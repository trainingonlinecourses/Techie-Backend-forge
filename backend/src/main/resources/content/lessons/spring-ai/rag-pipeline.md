---
title: RAG — Retrieval-Augmented Generation
summary: The full RAG pipeline — ingest, chunk, embed, retrieve, prompt — and how to ground model answers in your own data.
order: 5
minutes: 20
topics: [rag, retrieval, grounding, qa-pattern]
docs:
  - https://docs.spring.io/spring-ai/reference/api/rag.html
  - https://docs.spring.io/spring-ai/reference/api/retrieval-augmented-generation.html
---

# RAG — Retrieval-Augmented Generation

## Why RAG

Models know what they were trained on — not *your* codebase, docs, or policies. **RAG** retrieves the relevant pieces of your data and includes them in the prompt, so the model answers from **your** sources instead of hallucinating.

```
                    ┌─────────────────────────────┐
                    │       INGESTION (offline)    │
  docs (md, pdf,   │  split → chunk → embed →    │
  wiki, code) ────►│  store in VectorStore        │
                    └─────────────────────────────┘
                    ┌─────────────────────────────┐
                    │       QUERY (online)         │
  user question ──► │  embed question →           │
                    │  similaritySearch(topK) ───►│
                    │  prompt = question + chunks │
                    │  ChatClient → grounded answer│
                    └─────────────────────────────┘
```

## The manual RAG pipeline (clear, explicit)

```java
@Service
public class RagService {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;

    public String ask(String question) {
        // 1. RETRIEVE: find the most relevant chunks
        List<Document> relevant = vectorStore.similaritySearch(
                SearchRequest.builder().query(question).topK(4).build());

        // 2. AUGMENT: stuff them into the prompt with instructions
        String context = relevant.stream()
                .map(d -> "Source: " + d.getMetadata().get("lesson") + "\n" + d.getContent())
                .collect(Collectors.joining("\n\n---\n\n"));

        // 3. GENERATE: answer grounded in the context
        return chatClient.prompt()
                .system("""
                        You are a documentation assistant. Answer ONLY from the provided
                        context. If the context doesn't contain the answer, say so.
                        Cite the source lesson ids you used.
                        """)
                .user(u -> u.text("Context:\n{context}\n\nQuestion: {question}")
                        .param("context", context)
                        .param("question", question))
                .call()
                .content();
    }
}
```

That's the whole pattern. The production version adds: chunking, metadata filters, reranking, citation parsing.

## The production RAG pattern (the one Spring AI recommends)

```java
@Configuration
public class RagConfig {

    @Bean
    VectorStore vectorStore(EmbeddingModel embeddingModel) {
        return SimpleVectorStore.builder(embeddingModel).build();
    }

    @Bean
    ChatClient ragChatClient(ChatClient.Builder builder, VectorStore vectorStore) {
        return builder
                .defaultAdvisors(new QuestionAnswerAdvisor(vectorStore, SearchRequest.builder().topK(4).build()))
                .defaultSystem("Answer from the retrieved context. Cite your sources.")
                .build();
    }
}
```

`QuestionAnswerAdvisor` does retrieve + stuff + generate for you — the query is embedded, matched, injected, and the answer returned. This is the RAG advisor in action (more advisors in the next lesson).

## Grounding quality = retrieval quality

| Levers | Effect |
|---|---|
| `topK` (4–8) | More context vs more noise |
| `similarityThreshold` | Kill weak matches |
| Metadata filters (`module=spring-boot`) | Narrow the search space |
| Chunk size + overlap | Relevant-but-not-truncated chunks |
| Reranking | Order retrieved chunks by true relevance |

## Citations: the trust layer

```java
public record CitedAnswer(String answer, List<String> sources) {}

// collect which lessons/docs the model used, return them to the UI:
List<String> sourcesUsed = relevant.stream().map(d -> (String) d.getMetadata().get("lesson")).toList();
return new CitedAnswer(answer, sourcesUsed);
```

Users (and auditors) can verify: *the assistant says X, citing lesson Y.* This academy's own chat assistant returns `sources` exactly this way.

## Evaluation loop

1. Build a golden set: 20–50 real questions + ideal answers.
2. Run them through the pipeline, measure **hit rate** (did the right doc get retrieved?) and **answer quality** (manual or LLM-as-judge).
3. Improve retrieval (chunking, topK, reranking) → re-measure.

> **Why it matters (organizational view)** — RAG is the org's standard way to make AI *useful and safe* on internal knowledge. It's cheap to run, easy to update (re-ingest on doc change), and auditable (citations). Teams ship RAG when the answer must be true to *their* data — which is almost always.

## Key takeaways

- RAG = retrieve relevant chunks → stuff into prompt → answer with citations.
- Manual pipeline is ~20 lines; `QuestionAnswerAdvisor` automates it.
- Retrieval quality determines answer quality: topK, filters, chunking, rerank.
- Always return sources; evaluate against a golden set.

**Official docs:** [RAG](https://docs.spring.io/spring-ai/reference/api/rag.html) · [QuestionAnswerAdvisor](https://docs.spring.io/spring-ai/reference/api/advisors.html)
