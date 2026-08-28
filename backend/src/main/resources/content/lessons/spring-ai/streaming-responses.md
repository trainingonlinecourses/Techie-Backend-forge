---
title: Streaming AI Responses — Server-Sent Events with Spring AI
summary: Streaming token-by-token responses from AI models using Flux, SSE endpoints, and the patterns that make AI chat feel instant. Beginner-friendly with line-by-line code.
order: 10
minutes: 20
topics: [streaming, SSE, Server-Sent Events, Flux, token streaming, real-time AI, chunked response]
docs:
  - https://docs.spring.io/spring-ai/reference/api/chatclient-streaming.html
  - https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html
---

# Streaming AI Responses — Server-Sent Events with Spring AI

## What is Streaming? (From Zero)

When you ask ChatGPT a question, you don't wait 10 seconds for the full answer — you see it **appear word by word** in real-time. This is **streaming**: the AI generates tokens one at a time, and each token is sent to the client immediately instead of waiting for the complete response.

### Why Stream?

| Approach | Time to First Token | User Experience |
|---|---|---|
| **Non-streaming** (wait for full response) | 5-30 seconds | Staring at a loading spinner |
| **Streaming** (token by token) | 200-500ms | Text appears in real-time |

Streaming doesn't make the AI faster — it makes it **feel** faster because the user sees progress immediately.

---

## The Code — Line by Line

### 1. Streaming with ChatClient

```java
@RestController
@RequestMapping("/api/ai")
public class AiStreamController {

    private final ChatClient chatClient;

    public AiStreamController(ChatModel chatModel) {
        this.chatClient = ChatClient.create(chatModel);
    }

    // Non-streaming (waits for complete response):
    @PostMapping("/chat")
    public String chat(@RequestBody ChatRequest request) {
        return chatClient.prompt()
            .user(request.message())
            .call()
            .content();                     // Blocks until FULL response is ready
    }

    // Streaming (returns tokens as they arrive):
    @PostMapping(value = "/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<String> chatStream(@RequestBody ChatRequest request) {
        return chatClient.prompt()
            .user(request.message())
            .stream()                       // Returns Flux<String> instead of blocking
            .content();                     // Each element is one token/chunk
    }
}
```

**Line-by-line explained:**
- `.stream()` instead of `.call()` — switches from blocking to streaming mode.
- Returns `Flux<String>` — a reactive stream of strings. Each string is a token or small chunk.
- `produces = MediaType.TEXT_EVENT_STREAM_VALUE` — tells the client this is SSE (Server-Sent Events).
- The client receives tokens in real-time as the AI generates them.

### 2. Streaming with Tool Calls

```java
@PostMapping(value = "/agent/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> agentStream(@RequestBody ChatRequest request) {
    return chatClient.prompt()
        .system("You are a helpful assistant with access to tools.")
        .user(request.message())
        .tools(weatherTools, calculatorTools)
        .stream()                            // Stream mode
        .content();                           // Tokens arrive as AI generates them
    // Tool calls happen transparently — the client sees the final answer streaming
}
```

### 3. SSE Endpoint (Alternative Approach)

```java
@RestController
@RequestMapping("/api/ai")
public class AiSseController {

    private final ChatModel chatModel;

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamChat(@RequestParam String message) {
        SseEmitter emitter = new SseEmitter(60_000L);  // 60 second timeout

        // Run AI generation in a separate thread
        CompletableFuture.runAsync(() -> {
            try {
                Prompt prompt = new Prompt(new UserMessage(message));

                // Subscribe to the streaming response
                chatModel.stream(prompt, new StreamResponseHandler() {
                    @Override
                    public void onResponse(ChatResponse response) {
                        String token = response.getResult().getOutput().getText();
                        try {
                            emitter.send(SseEmitter.event()
                                .name("token")
                                .data(token));
                        } catch (IOException e) {
                            emitter.completeWithError(e);
                        }
                    }

                    @Override
                    public void onComplete() {
                        emitter.send(SseEmitter.event()
                            .name("done")
                            .data("[DONE]"));
                        emitter.complete();
                    }

                    @Override
                    public void onError(Throwable ex) {
                        emitter.completeWithError(ex);
                    }
                });
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });

        return emitter;
    }
}
```

**Line-by-line explained:**
- `SseEmitter` — Spring's way to send Server-Sent Events. The connection stays open until `complete()` is called.
- `chatModel.stream(prompt, handler)` — Streams the response token by token. The `onResponse` callback is called for each token.
- `emitter.send(SseEmitter.event().name("token").data(token))` — Sends each token as an SSE event to the client.
- `emitter.complete()` — Signals the stream is done. The client knows no more tokens are coming.

### 4. Frontend JavaScript (Consuming the Stream)

```javascript
// Client-side: consume the SSE stream
async function streamChat(message) {
    const response = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // SSE format: "data: token\n\n"
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const token = line.slice(6);     // Remove "data: " prefix
                fullResponse += token;
                document.getElementById('response').textContent = fullResponse;
            }
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Chat UI with Typewriter Effect

```java
@RestController
@RequestMapping("/api/ai")
public class AiChatController {

    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<String>> chat(@RequestBody ChatRequest request) {
        return chatClient.prompt()
            .system("You are a helpful Java tutor. Explain concepts clearly with examples.")
            .user(request.message())
            .stream()
            .map(token -> ServerSentEvent.<String>builder()
                .event("message")                    // Custom event name
                .id(UUID.randomUUID().toString())     // Unique ID for each token
                .data(token)                          // The actual token text
                .build())
            .concatWith(Flux.just(                    // Send [DONE] signal at the end
                ServerSentEvent.<String>builder()
                    .event("done")
                    .data("[DONE]")
                    .build()
            ));
    }
}
```

### Scenario 2: Streaming with Progress Indicators

```java
@PostMapping(value = "/research", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> researchStream(@RequestBody ChatRequest request) {
    return Flux.concat(
        // Phase 1: Thinking
        Flux.just("🔍 Researching: " + request.message() + "\n\n"),

        // Phase 2: AI response (streaming)
        chatClient.prompt()
            .system("Research this topic thoroughly using the provided tools.")
            .user(request.message())
            .tools(searchTools)
            .stream()
            .content(),

        // Phase 3: Complete
        Flux.just("\n\n✅ Research complete!")
    );
}
```

### Scenario 3: Streaming for Long-Running Analysis

```java
@PostMapping(value = "/analyze/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<String> analyzeStream(@RequestBody AnalysisRequest request) {
    return Flux.concat(
        Flux.just("📊 Starting analysis...\n"),

        // Step 1: Query data
        Flux.just("Step 1: Querying database... "),
        dataQueryTool.queryData(request.getQuery())
            .thenMany(Flux.just("✓\n")),

        // Step 2: Process results
        Flux.just("Step 2: Processing results... "),
        chatClient.prompt()
            .user("Analyze this data: " + dataResults)
            .stream()
            .content(),

        Flux.just("\n\n✅ Analysis complete!")
    );
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Using `.call()` for streaming UI | User waits for full response (10+ seconds) | Use `.stream()` for real-time display |
| No timeout on SSE | Connections hang forever if AI is slow | Set timeout on SseEmitter (60s) |
| Not sending [DONE] signal | Client doesn't know stream ended | Send a completion event |
| Streaming large tool results | Client overwhelmed with data | Chunk tool results into small pieces |
| No error handling in stream | Client sees broken stream on AI errors | Send error event before completing |

---

## Key Takeaways

- **`.stream().content()` instead of `.call().content()`** — switches from blocking to streaming.
- **SSE (Server-Sent Events)** — the standard protocol for streaming from server to client.
- **Time to first token** drops from 5-30s to 200-500ms with streaming.
- **Always send a [DONE] signal** — so the client knows the stream is complete.
- **Streaming + tools** = the AI calls tools silently while the client sees the answer streaming.

Official docs: [Streaming (Spring AI)](https://docs.spring.io/spring-ai/reference/api/chatclient-streaming.html) · [SSE (Spring)](https://docs.spring.io/spring-framework/reference/web/webflux-webfn.html)
