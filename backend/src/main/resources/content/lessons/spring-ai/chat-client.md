---
title: ChatClient — Prompts, Messages & Streaming
summary: The fluent ChatClient API, system/user messages, parameters, streaming and how to build a chat service.
order: 2
minutes: 18
topics: [chatclient, prompts, streaming, messages]
docs:
  - https://docs.spring.io/spring-ai/reference/api/chatclient.html
  - https://docs.spring.io/spring-ai/reference/api/chatmodel.html
---

# ChatClient — Prompts, Messages & Streaming

## Getting a ChatClient

```java
@Configuration
public class AiConfig {
    @Bean
    ChatClient chatClient(ChatClient.Builder builder) {
        return builder
                .defaultSystem("You are a helpful support assistant for Acme Corp.")
                .defaultOptions(OpenAiChatOptions.builder()
                        .model("gpt-4o-mini")
                        .temperature(0.3)
                        .build())
                .build();
    }
}
```

`ChatClient.Builder` is auto-configured when a `ChatModel` exists — inject it and customize.

## The fluent call

```java
@Service
public class SupportService {

    private final ChatClient chatClient;

    public String answer(String question, String customerName) {
        return chatClient.prompt()
                .system("You are {company}'s support assistant. Be concise and friendly.")
                .user(u -> u
                        .text("Customer {name} asks: {question}")
                        .param("company", "Acme")
                        .param("name", customerName)
                        .param("question", question))
                .call()
                .content();
    }
}
```

`params` are the safe way to interpolate — never string-concatenate user input into prompts (prompt injection!).

## Messages: system, user, assistant

```java
List<Message> history = List.of(
        new SystemMessage("You are a coding tutor. Answer with Java examples."),
        new UserMessage("Explain @Transactional propagation."),
        new AssistantMessage("There are several propagation levels: REQUIRED, REQUIRES_NEW, ..."),
        new UserMessage("When would I use REQUIRES_NEW?")
);

String answer = chatClient.prompt()
        .messages(history)
        .call()
        .content();
```

## Streaming: tokens as they arrive

```java
// Reactive stream of text chunks
Flux<String> stream = chatClient.prompt()
        .user("Write a haiku about Spring Boot")
        .stream()
        .content();

// Consume chunk by chunk (e.g. server-sent events to the frontend)
stream.subscribe(chunk -> sseSink.emit(chunk));
```

## The full response object

```java
ChatResponse response = chatClient.prompt().user(q).call().chatResponse();
response.getResult().getOutput().getText();   // the answer
response.getResult().getMetadata();           // tokens, finish reason, model
// response.getUsage().getPromptTokens(), .getCompletionTokens()
```

## Building the "ask" endpoint (what this academy does)

```java
@PostMapping("/api/chat")
public ChatAnswer ask(@RequestBody ChatRequest req) {
    String answer = chatClient.prompt()
            .user(req.message())
            .call()
            .content();
    return new ChatAnswer(answer, "gpt-4o-mini");
}
```

> **Why it matters (organizational view)** — ChatClient is the AI equivalent of `RestTemplate`/`JdbcTemplate`: one idiomatic API the whole org learns. Standards: system prompts live in config or constants (reviewable), user content goes through `.param(...)`, temperature chosen per use case (0.x for factual, higher for creative), and every prompt has a version so behavior changes are trackable.

## Key takeaways

- `ChatClient.prompt().user(...).call().content()` — the core pattern.
- Parameters (`param`) beat string interpolation for safety.
- Streaming via `.stream()` → `Flux<String>`.
- Default system prompt + options in the builder keep calls consistent.

**Official docs:** [ChatClient](https://docs.spring.io/spring-ai/reference/api/chatclient.html) · [ChatModel](https://docs.spring.io/spring-ai/reference/api/chatmodel.html)
