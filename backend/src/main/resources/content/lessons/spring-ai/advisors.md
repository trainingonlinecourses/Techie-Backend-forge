---
title: Advisors — Memory, Logging, RAG & Safety
summary: Cross-cutting concerns for every prompt: chat memory, logging, retrieval augmentation and moderation.
order: 6
minutes: 15
topics: [advisors, chat-memory, logging-advisor, safety]
docs:
  - https://docs.spring.io/spring-ai/reference/api/advisors.html
---

# Advisors — Memory, Logging, RAG & Safety

## What advisors are

**Advisors** wrap the prompt/response cycle with cross-cutting concerns — think *AOP for AI*. Instead of hand-coding "add history, log the call, moderate the output" into every prompt, you attach advisors to a `ChatClient`.

## Memory: conversations with context

```java
@Configuration
public class AiConfig {

    @Bean
    ChatClient memoryChatClient(ChatClient.Builder builder) {
        return builder
                .defaultAdvisors(new MessageChatMemoryAdvisor(
                        new InMemoryChatMemory()))          // window of last N messages
                .build();
    }
}
```

```java
// Keep the conversation handle around between turns:
String conversationId = UUID.randomUUID().toString();

chatClient.prompt()
        .user("What did I just ask about?")
        .advisors(a -> a.param(ChatMemoryAdvisor.CHAT_MEMORY_CONVERSATION_ID_KEY, conversationId))
        .call()
        .content();
```

For multi-user apps, scope memory per user: `conversationId = user.getId()` — never a global memory (users would see each other's context).

## Logging: observability for prompts

```java
.builder()
    .defaultAdvisors(new SimpleLoggerAdvisor())    // logs request + response
    .build();
```

`SimpleLoggerAdvisor` prints the prompt (system + user + messages) and the response — invaluable in dev; use structured logging + redaction in prod (prompts can contain PII).

## RAG advisor (covered in the previous lesson)

```java
.defaultAdvisors(new QuestionAnswerAdvisor(vectorStore,
        SearchRequest.builder().topK(4).build()))
```

## Safety: moderation & guardrails

```java
public class ModerationAdvisor implements Advisor {
    @Override
    public AdvisedRequest before(AdvisedRequest request) {
        // inspect request.userText() — reject/replace if flagged
        return request;
    }
    @Override
    public AdvisedResponse after(AdvisedResponse response) {
        // inspect the model's text — filter policy violations
        return response;
    }
}
```

```java
ChatClient safeClient = builder
        .defaultAdvisors(new ModerationAdvisor())
        .build();
```

Implementing `Advisor` gives you `before`/`after` hooks — the place for input filtering, output filtering, and injection guards.

## Ordering advisors

Advisors run in order. RAG advisor should run before the call; memory advisor wraps the whole exchange. Spring AI lets you order them (`@Order`-like ordering via `ordered()` / `.defaultAdvisors(List.of(...))` in sequence).

## Composing a production assistant

```java
@Bean
ChatClient assistant(ChatClient.Builder builder, VectorStore vectorStore, ChatMemory memory) {
    return builder
            .defaultSystem(ASSISTANT_SYSTEM_PROMPT)
            .defaultAdvisors(
                    new MessageChatMemoryAdvisor(memory),
                    new QuestionAnswerAdvisor(vectorStore, SearchRequest.builder().topK(5).build()),
                    new SimpleLoggerAdvisor(),
                    new ModerationAdvisor())
            .defaultTools(ToolCallbacks.from(new SupportTools()))
            .build();
}
```

One builder, one coherent behavior — the org-standard way to assemble an assistant.

> **Why it matters (organizational view)** — Advisors are the difference between a demo and a product: memory makes it conversational, logging makes it debuggable, RAG makes it accurate, moderation makes it safe. Standardizing on advisor *stacks* (every assistant gets memory + RAG + logging) means consistent behavior across all AI features and a single place to add new guardrails.

## Key takeaways

- Advisors = cross-cutting concerns attached to a ChatClient.
- `MessageChatMemoryAdvisor` for history (per-user conversation ids!).
- `SimpleLoggerAdvisor` for observability; custom `Advisor` for safety.
- Compose memory + RAG + logging + moderation in one builder.

**Official docs:** [Advisors](https://docs.spring.io/spring-ai/reference/api/advisors.html)
