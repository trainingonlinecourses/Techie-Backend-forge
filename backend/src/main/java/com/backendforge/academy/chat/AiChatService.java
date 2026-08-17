package com.backendforge.academy.chat;

import com.backendforge.academy.chat.ChatDtos.ChatAnswer;
import com.backendforge.academy.chat.ChatDtos.Source;
import com.backendforge.academy.config.AppProperties;
import com.backendforge.academy.config.AppProperties.OpenAi;
import com.backendforge.academy.content.ContentService;
import com.backendforge.academy.content.ContentDtos.SearchResultDto;
import com.backendforge.academy.content.Lesson;
import com.backendforge.academy.user.User;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

/**
 * The Spring AI integration. The tutor resolves an LLM provider automatically,
 * in priority order, so it works with <b>zero configuration and zero keys</b>:
 * <ol>
 *   <li><b>OpenAI</b> — when {@code OPENAI_API_KEY} is set.</li>
 *   <li><b>Custom endpoint</b> — when {@code APP_OPENAI_BASE_URL} points at any
 *       OpenAI-compatible server (Hugging Face Spaces, Ollama, LM Studio, ...).</li>
 *   <li><b>Ollama (local, free, no key)</b> — auto-detected on {@code localhost:11434}.</li>
 *   <li><b>Built-in free endpoint</b> — a keyless Hugging Face Space, enabled by default
 *       ({@code APP_USE_FREE_ENDPOINT=false} to disable).</li>
 *   <li><b>Local mode</b> — a deterministic knowledge assistant that searches the
 *       curriculum and answers from it, used when everything above is unavailable.</li>
 * </ol>
 * Every LLM mode uses a real {@link ChatClient} with retrieval-augmented context and
 * a lesson-lookup tool; if a call fails it gracefully falls back to local mode.
 *
 * @see <a href="https://docs.spring.io/spring-ai/reference/api/chatclient.html">Spring AI ChatClient docs</a>
 */
@Service
public class AiChatService {

    private static final Logger log = LoggerFactory.getLogger(AiChatService.class);

    /** Keyless Hugging Face Space used as the zero-config default (base URL without /v1). */
    private static final String FREE_ENDPOINT_BASE_URL =
            "https://g9hnto0u7lvbu837.us-east-2.aws.endpoints.huggingface.cloud";
    private static final String FREE_ENDPOINT_MODEL = "Qwen/Qwen3.8-27B";

    /** Where Ollama exposes its OpenAI-compatible API. */
    private static final String OLLAMA_BASE_URL = "http://localhost:11434";
    private static final String OLLAMA_OPENAI_URL = OLLAMA_BASE_URL + "/v1";

    /** Models to look for on a local Ollama, in preference order. */
    private static final List<String> OLLAMA_PREFERRED_MODELS = List.of(
            "qwen2.5:7b", "qwen2.5:3b", "qwen2.5", "llama3.2:3b", "llama3.2",
            "llama3.1:8b", "llama3.1", "gemma2", "mistral", "llama3", "phi3:mini", "phi3");

    private static final String SYSTEM_PROMPT = """
            You are the BackendForge Academy teaching assistant.
            You help software engineers learn Java, Spring Framework, Spring Boot,
            Spring Security and Spring AI from an organizational point of view.

            Rules:
            - Answer in clear, well-structured Markdown with short code examples when relevant.
            - Ground your answer in the provided context and curriculum lessons; mention lesson
              ids when you reference them (e.g. 'spring-boot/actuator').
            - If you do not know, say so honestly and point to the official docs instead of guessing.
            - Keep answers focused; prefer depth over breadth.
            """;

    private final AppProperties props;
    private final ContentService content;
    private final ChatRepository chat;
    private final ObjectMapper mapper = new ObjectMapper();

    private volatile ChatClient openAiClient;
    /** Resolved endpoint, cached after the first call (Ollama probe included). */
    private volatile AiEndpoint endpoint;

    public AiChatService(AppProperties props, ContentService content, ChatRepository chat) {
        this.props = props;
        this.content = content;
        this.chat = chat;
    }

    /** Whether any LLM endpoint is available (OpenAI, custom, Ollama or the free default). */
    public boolean openAiEnabled() {
        return resolveEndpoint() != null;
    }

    public ChatAnswer answer(String message, User user) {
        if (openAiEnabled()) {
            try {
                return answerWithLlm(message, user);
            } catch (Exception e) {
                log.warn("LLM call failed ({}), falling back to local assistant: {}",
                        endpointLabel(), e.getMessage());
                return answerLocally(message, user, "openai-error");
            }
        }
        return answerLocally(message, user, "local");
    }

    // ---- LLM mode ----------------------------------------------------------

    private ChatAnswer answerWithLlm(String message, User user) {
        AiEndpoint ep = resolveEndpoint();
        ChatClient client = client();
        List<SearchResultDto> hits = content.search(message).stream().limit(5).toList();
        String context = contextBlock(hits);

        String response = client.prompt()
                .user(u -> u.text(
                        "Relevant curriculum context:\n---\n{context}\n---\n\nQuestion: {question}")
                        .param("context", context)
                        .param("question", message))
                .call()
                .content();

        List<Source> sources = hits.stream()
                .map(h -> new Source(h.lessonId(), h.title(), h.moduleTitle()))
                .toList();
        return new ChatAnswer(response, sources, ep.model(), ep.label());
    }

    private ChatClient client() {
        ChatClient local = openAiClient;
        if (local == null) {
            synchronized (this) {
                if (openAiClient == null) {
                    AiEndpoint ep = resolveEndpoint();
                    String apiKey = props.openai().apiKey();
                    OpenAiApi.Builder apiBuilder = OpenAiApi.builder()
                            // Keyless endpoints (free HF Spaces, Ollama) ignore the header.
                            .apiKey(StringUtils.hasText(apiKey) ? apiKey : "keyless-endpoint")
                            .restClientBuilder(llmRestClient());
                    if (ep.baseUrl() != null) {
                        apiBuilder.baseUrl(ep.baseUrl());
                    }
                    OpenAiApi api = apiBuilder.build();
                    OpenAiChatModel model = OpenAiChatModel.builder()
                            .openAiApi(api)
                            .defaultOptions(OpenAiChatOptions.builder()
                                    .model(ep.model())
                                    .temperature(0.3)
                                    .build())
                            .build();
                    openAiClient = ChatClient.builder(model)
                            .defaultSystem(SYSTEM_PROMPT)
                            .defaultTools(new LessonTool(content))
                            .build();
                }
                local = openAiClient;
            }
        }
        return local;
    }

    /**
     * HTTP client with hard timeouts for LLM calls. Without these, a stalled provider
     * (e.g. the free Hugging Face endpoint) hangs the chat request forever; with them
     * the call fails and {@link #answer} falls back to the local knowledge assistant.
     */
    private static RestClient.Builder llmRestClient() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(10).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(60).toMillis());
        return RestClient.builder().requestFactory(factory);
    }

    // ---- Provider resolution --------------------------------------------------

    /**
     * Picks the best available endpoint in priority order and caches the result.
     * Order: explicit OpenAI key → explicit base URL → local Ollama → built-in free
     * endpoint → {@code null} (local assistant).
     */
    private AiEndpoint resolveEndpoint() {
        AiEndpoint cached = endpoint;
        if (cached != null) {
            return cached;
        }
        synchronized (this) {
            if (endpoint == null) {
                endpoint = resolveEndpointNow();
                if (endpoint != null) {
                    log.info("AI tutor using {} endpoint: {} (model {})",
                            endpoint.label(), endpoint.baseUrl(), endpoint.model());
                }
            }
            return endpoint;
        }
    }

    private AiEndpoint resolveEndpointNow() {
        OpenAi openAi = props.openai();

        // 1. Explicit OpenAI key.
        if (StringUtils.hasText(openAi.apiKey())) {
            return new AiEndpoint(null, openAi.model(), "openai");
        }

        // 2. Explicit OpenAI-compatible base URL.
        if (StringUtils.hasText(openAi.baseUrl())) {
            return new AiEndpoint(openAi.baseUrl(), openAi.model(), "free-endpoint");
        }

        // 3. Local Ollama, auto-detected (free, no key, private).
        String ollamaModel = detectOllamaModel();
        if (ollamaModel != null) {
            return new AiEndpoint(OLLAMA_OPENAI_URL, ollamaModel, "ollama");
        }

        // 4. Built-in free Hugging Face endpoint (zero config).
        if (openAi.useFreeEndpoint()) {
            return new AiEndpoint(FREE_ENDPOINT_BASE_URL, FREE_ENDPOINT_MODEL, "free-endpoint");
        }

        return null;
    }

    private String endpointLabel() {
        AiEndpoint ep = endpoint;
        return ep == null ? "none" : ep.label();
    }

    /** Queries a local Ollama for installed models; returns the best chat model or null. */
    private String detectOllamaModel() {
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(1))
                    .build();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(OLLAMA_BASE_URL + "/api/tags"))
                    .timeout(Duration.ofSeconds(2))
                    .GET()
                    .build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() != 200) {
                return null;
            }
            JsonNode models = mapper.readTree(res.body()).path("models");
            List<String> installed = new java.util.ArrayList<>();
            models.forEach(m -> installed.add(m.path("name").asText()));

            for (String preferred : OLLAMA_PREFERRED_MODELS) {
                if (installed.contains(preferred)) {
                    return preferred;
                }
            }
            // Fall back to the first installed model if none of the preferred are there.
            return installed.isEmpty() ? null : installed.get(0);
        } catch (Exception e) {
            // No Ollama running (or not installed) — that's fine, fall through.
            return null;
        }
    }

    /** A resolved LLM endpoint: where to call it, which model, and how to label it. */
    private record AiEndpoint(String baseUrl, String model, String label) {}

    /** A tool the model can call to read the full text of any lesson. */
    public static class LessonTool {
        private final ContentService content;

        public LessonTool(ContentService content) {
            this.content = content;
        }

        @Tool(description = "Returns the full content of a lesson. Lesson ids are slugs like "
                + "'java-streams', 'actuator', 'jwt-auth', 'rag-pipeline'.")
        public String lessonContent(String lessonId) {
            return content.lessonEntity(lessonId)
                    .map(l -> "# " + l.getTitle() + "\n\n" + l.getBody())
                    .orElse("Lesson not found: " + lessonId);
        }
    }

    // ---- Local mode --------------------------------------------------------

    private ChatAnswer answerLocally(String message, User user, String provider) {
        List<SearchResultDto> hits = content.search(message).stream().limit(3).toList();
        StringBuilder answer = new StringBuilder();

        if (hits.isEmpty()) {
            answer.append("I couldn't find a lesson that directly matches **")
                  .append(truncate(message, 80))
                  .append("**.\n\nTry one of these instead:\n\n")
                  .append("- **Java** — JVM, OOP, collections, streams, concurrency\n")
                  .append("- **Spring Core** — IoC, DI, AOP, events, transactions\n")
                  .append("- **Spring Boot** — auto-configuration, REST APIs, JPA, testing, Actuator\n")
                  .append("- **Spring Security** — authentication, JWT, authorization, OAuth2\n")
                  .append("- **Spring AI** — ChatClient, RAG, embeddings, function calling\n\n")
                  .append("Or use the search bar — every topic is covered end to end.");
        } else {
            answer.append("Here's what the curriculum covers for **")
                  .append(truncate(message, 80))
                  .append("**. These lessons walk you through it end to end:\n\n");
            int i = 1;
            for (SearchResultDto hit : hits) {
                answer.append(i++).append(". **").append(hit.title()).append("** (module: ")
                      .append(hit.moduleTitle()).append(")\n\n   ")
                      .append(truncate(hit.snippet(), 240)).append("\n\n");
            }
            answer.append("Open any of these lessons from the sidebar to see the full explanation, "
                          + "production code and links to the official docs.");
        }
        return new ChatAnswer(answer.toString(), hits.stream()
                .map(h -> new Source(h.lessonId(), h.title(), h.moduleTitle()))
                .toList(), "local-knowledge-assistant", provider);
    }

    private String contextBlock(List<SearchResultDto> hits) {
        StringBuilder sb = new StringBuilder();
        for (SearchResultDto h : hits) {
            sb.append("### Lesson ").append(h.lessonId()).append(" — ").append(h.title()).append('\n')
              .append(h.snippet()).append("\n\n");
        }
        return sb.length() == 0 ? "(no matching curriculum context)" : sb.toString();
    }

    private String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
