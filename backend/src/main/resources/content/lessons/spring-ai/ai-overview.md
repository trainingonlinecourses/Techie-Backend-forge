---
title: Spring AI — Integrating AI into Your Application
summary: Spring AI's abstraction over LLM providers, chat models, embeddings, vector stores, and how organizations build AI-powered features. Beginner-friendly with line-by-line code.
order: 1
minutes: 20
topics: [Spring AI, LLM, chat model, embeddings, vector store, RAG, prompt engineering, AI integration]
docs:
  - https://docs.spring.io/spring-ai/reference/
  - https://spring.io/projects/spring-ai
---

# Spring AI — Integrating AI into Your Application

## What is Spring AI? (From Zero)

Spring AI is a Spring module that provides a **unified API** for integrating AI capabilities into your Java application. Instead of learning different SDKs for OpenAI, Azure OpenAI, Ollama, or Anthropic, Spring AI gives you one consistent interface.

Think of it like JDBC: before JDBC, you needed different code for MySQL, PostgreSQL, and Oracle. With JDBC, you write code against the JDBC API and swap databases by changing a dependency. Spring AI does the same for AI providers.

### What Can Spring AI Do?

| Capability | What It Does | Example |
|---|---|---|
| **Chat Models** | Send messages, get AI responses | Chatbots, content generation |
| **Embeddings** | Convert text to numbers (vectors) | Semantic search, similarity |
| **Vector Stores** | Store and search embeddings | RAG (Retrieval-Augmented Generation) |
| **Image Generation** | Generate images from text | DALL-E, Stable Diffusion |
| **Audio** | Text-to-speech, speech-to-text | Voice assistants |

---

## The Code — Line by Line

### 1. Setup (Maven Dependency)

```xml
<!-- pom.xml — Add Spring AI -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>

<!-- application.yml — Configure the AI provider -->
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}                    # Your API key from environment
      chat:
        options:
          model: gpt-4o                             # Which model to use
          temperature: 0.7                           # Creativity (0=deterministic, 1=creative)
```

### 2. Chat Model (Basic AI Interaction)

```java
@Service
public class AiTutorService {

    private final ChatClient chatClient;

    public AiTutorService(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);     // Create a chat client from the model
    }

    // Simple chat:
    public String askQuestion(String question) {
        return chatClient.prompt()
            .user(question)                                  // The user's message
            .call()
            .content();                                      // Get the response as a String
    }

    // Chat with system prompt (set the AI's role):
    public String explainConcept(String topic) {
        return chatClient.prompt()
            .system("""
                You are a Java programming tutor.
                Explain concepts in simple terms with code examples.
                Use beginner-friendly language.
                Always include a real-world analogy.
                """)                                         // System message — sets behavior
            .user("Explain " + topic + " in detail")        // User message — the question
            .call()
            .content();
    }

    // Chat with conversation history:
    public String chatWithHistory(List<Message> history, String newMessage) {
        List<Message> messages = new ArrayList<>(history);
        messages.add(new UserMessage(newMessage));           // Add the new user message

        return chatClient.prompt()
            .messages(messages)                              // Pass full conversation
            .call()
            .content();
    }
}
```

**Line-by-line explained:**
- `ChatClient.create(chatModel)` — Creates a client that wraps the AI model. The `chatModel` is auto-configured by Spring Boot based on your `application.yml`.
- `.system(...)` — Sets the AI's role and behavior. This is like giving instructions to an employee.
- `.user(...)` — The actual question from the user.
- `.call().content()` — Sends the request and returns the text response.
- `List<Message>` — Conversation history. The AI uses previous messages for context.

### 3. Structured Output (Parse AI Responses)

```java
// Define what you want the AI to return:
public record LessonSummary(
    String title,
    String explanation,
    List<String> keyPoints,
    String codeExample,
    String commonMistake
) {}

@Service
public class LessonService {

    private final ChatClient chatClient;

    // Get structured JSON from AI:
    public LessonSummary generateLessonSummary(String topic) {
        return chatClient.prompt()
            .system("You are a Java tutor. Generate a structured lesson summary.")
            .user("Create a lesson summary for: " + topic)
            .call()
            .entity(LessonSummary.class);                   // Parse response into this record
    }
}
```

### 4. Embeddings (Semantic Search)

```java
@Service
public class SearchService {

    private final EmbeddingModel embeddingModel;
    private final VectorStore vectorStore;

    // Convert text to a vector (array of numbers):
    public float[] embed(String text) {
        EmbeddingResponse response = embeddingModel.call(
            new EmbeddingRequest(List.of(new TextObservation(text)), null));
        return response.getResult().getOutput().getEmbedding();
    }

    // Store documents with embeddings:
    public void indexLesson(String lessonId, String content) {
        List<Document> documents = List.of(
            new Document(lessonId, content)
        );
        vectorStore.add(documents);                          // Auto-generates embeddings
    }

    // Semantic search (find similar content):
    public List<Document> searchSimilar(String query, int topK) {
        SearchRequest request = SearchRequest.query(query)
            .withTopK(topK)                                  // Return top K results
            .withSimilarityThreshold(0.7);                   // Minimum similarity score

        return vectorStore.similaritySearch(request);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: AI-Powered Tutor (RAG Pattern)

```java
@Service
public class AiTutorRAG {

    private final VectorStore vectorStore;
    private final ChatClient chatClient;

    public String answerWithCurriculum(String question) {
        // 1. Find relevant curriculum content
        List<Document> relevantDocs = vectorStore.similaritySearch(
            SearchRequest.query(question).withTopK(5));

        // 2. Build context from found documents
        String context = relevantDocs.stream()
            .map(Document::getContent)
            .collect(Collectors.joining("\n\n"));

        // 3. Ask AI with the context
        return chatClient.prompt()
            .system("""
                You are a Java tutor. Answer based ONLY on the provided curriculum context.
                If the context doesn't contain enough information, say so.
                """)
            .user("""
                Context from curriculum:
                %s

                Student question: %s
                """.formatted(context, question))
            .call()
            .content();
    }
}
```

### Scenario 2: Code Review Assistant

```java
public CodeReviewResult reviewCode(String code) {
    return chatClient.prompt()
        .system("""
            You are a senior Java code reviewer.
            Analyze the code for:
            1. Bugs and potential issues
            2. Performance problems
            3. Security vulnerabilities
            4. Code style and best practices
            Provide a severity rating (LOW, MEDIUM, HIGH, CRITICAL) for each finding.
            """)
        .user("Review this code:\n```java\n" + code + "\n```")
        .call()
        .entity(CodeReviewResult.class);
}
```

### Scenario 3: Content Generation

```java
public List<String> generateQuizQuestions(String topic, int count) {
    return chatClient.prompt()
        .system("Generate quiz questions about Java/Spring topics.")
        .user("Create %d multiple-choice questions about %s. Format: question + 4 options + correct answer."
            .formatted(count, topic))
        .call()
        .entity(new ParameterizedTypeReference<List<QuizQuestion>>() {});
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Not setting temperature | Default might be too random or too rigid | Set 0.0-0.3 for factual tasks, 0.7-1.0 for creative |
| No system prompt | AI doesn't know its role or constraints | Always set a system prompt |
| Trusting AI output blindly | AI can hallucinate (make things up) | Validate responses, use RAG for grounding |
| Ignoring token limits | Long conversations hit limits, get truncated | Monitor token count, truncate history if needed |
| Hardcoding model names | Can't switch providers without code changes | Use Spring AI's abstraction layer |

---

## Key Takeaways

- **Spring AI = JDBC for AI** — one API, multiple providers, easy to swap.
- **System prompts control behavior** — always set the AI's role and constraints.
- **Structured output** — use `.entity(Class)` to parse AI responses into Java objects.
- **Embeddings + Vector Store** = semantic search. RAG = AI grounded in your data.
- **Temperature** controls creativity: low = deterministic, high = creative.

Official docs: [Spring AI](https://docs.spring.io/spring-ai/reference/) · [Spring AI Project](https://spring.io/projects/spring-ai)
