---
title: Spring AI Overview — The AI Stack for Spring Developers
summary: What Spring AI is, the abstraction layer (ChatClient, models, embeddings, RAG), and how it fits your architecture.
order: 1
minutes: 15
topics: [spring-ai, chat-model, overview]
docs:
  - https://docs.spring.io/spring-ai/reference/
  - https://spring.io/projects/spring-ai
---

# Spring AI Overview — The AI Stack for Spring Developers

## What Spring AI is

Spring AI brings the Spring philosophy — **portable abstractions with sensible defaults** — to AI applications. It wraps LLM providers (OpenAI, Anthropic, Ollama, Azure, Google, Mistral, ...) behind consistent APIs, so your code doesn't vendor-lock to one provider.

```
Your service
    │
    ▼
Spring AI abstractions (ChatClient, EmbeddingModel, VectorStore, Advisor)
    │
    ├── OpenAI      ├── Anthropic   ├── Ollama (local)   ├── Azure OpenAI
    ├── Google      ├── Mistral     ├── Amazon Bedrock   └── ...
```

## The core APIs

| API | Job |
|---|---|
| **`ChatClient`** | Fluent prompt → model → response (the workhorse) |
| **`ChatModel`** | The raw model interface (used under ChatClient) |
| **`EmbeddingModel`** | Turns text into vector representations |
| **`VectorStore`** | Stores/retrieves vectors for RAG |
| **`Advisor`** | Cross-cutting concerns: memory, logging, safety, RAG |
| **Tool / Function Calling** | Let the model call your Java methods |

## The mental model

```
Prompt (system + user) → ChatClient → Model → Response
                                │
        ← context: retrieved docs, tools, memory, history (advisors)
```

**RAG** (Retrieval-Augmented Generation) is the pattern: *retrieve relevant content from your own data, stuff it into the prompt, get grounded answers.* This is how you make a model an expert on your codebase, docs, or products — without retraining.

## Provider setup

```xml
<!-- One starter per provider; swap providers by changing the dependency -->
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-model-openai</artifactId>
</dependency>
```

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o-mini
          temperature: 0.3
```

With auto-configuration on, `ChatClient`, `ChatModel` and `EmbeddingModel` beans just appear (like any other Spring bean).

## The org pattern: build AI behind an interface

```java
public interface SupportAssistant {
    Answer answer(Question q);          // your code depends on THIS
}

@Service
public class SpringAiSupportAssistant implements SupportAssistant {
    private final ChatClient chatClient;
    // implementation swaps freely: OpenAI today, Anthropic or local Ollama tomorrow
}
```

> **Why it matters (organizational view)** — AI features are usually cross-cutting (assistants, summarization, search). Spring AI gives orgs: one consistent API across providers (no rewrites when models change), Spring-native config/observability, and the same DI/transactional habits developers already know. The strategy: start with a `ChatClient` behind an interface, add RAG when you need grounding, and evaluate (see the observability lesson) before you scale.

## Key takeaways

- Spring AI = portable abstractions over LLM providers.
- `ChatClient` for prompting; `EmbeddingModel` + `VectorStore` for RAG; `Advisor` for concerns.
- RAG grounds models in your data — the standard production pattern.
- One starter per provider; swap by changing the dependency.

**Official docs:** [Spring AI reference](https://docs.spring.io/spring-ai/reference/) · [Spring AI project](https://spring.io/projects/spring-ai)
