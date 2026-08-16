---
title: Embeddings & Vector Stores
summary: Turning text into vectors, similarity search, and storing embeddings in SimpleVectorStore or a real vector database.
order: 4
minutes: 16
topics: [embeddings, vector-store, similarity, simplevectorstore]
docs:
  - https://docs.spring.io/spring-ai/reference/api/embeddings.html
  - https://docs.spring.io/spring-ai/reference/api/vectordbs.html
---

# Embeddings & Vector Stores

## What an embedding is

An **embedding** is a list of numbers (a vector, e.g. 1536 dimensions) that captures the *meaning* of a text. Semantically similar texts have numerically close vectors:

```
"Spring Boot starters"      → [0.12, -0.34, 0.87, ...]
"Spring Boot auto-config"   → [0.11, -0.33, 0.86, ...]   ← close (similar meaning)
"how to make pasta"         → [-0.9, 0.4, 0.02, ...]      ← far
```

## EmbeddingModel: text → vector

```java
@Configuration
public class AiConfig {
    @Bean
    EmbeddingModel embeddingModel(EmbeddingModel builder) { return builder; }
}
```

```java
@Service
public class EmbeddingService {

    private final EmbeddingModel embeddingModel;

    public float[] embed(String text) {
        EmbeddingResponse response = embeddingModel.embedForResponse(List.of(text));
        return response.getResult().getOutput();    // float[] of N dimensions
    }
}
```

Spring AI provides `embeddingModel.embed(String)` returning `float[]` — and batches:

```java
List<float[]> vectors = embeddingModel.embed(List.of(doc1, doc2, doc3));
```

## VectorStore: store + retrieve

```java
@Bean
VectorStore vectorStore(EmbeddingModel embeddingModel) {
    return SimpleVectorStore.builder(embeddingModel).build();   // in-memory, dev/CI
    // production: new PgVectorStore(...), RedisVectorStore, Milvus, Chroma, Weaviate, ...
}
```

Store documents with metadata:

```java
vectorStore.add(List.of(
        new Document("spring-boot-starter-web pulls in Tomcat, MVC and Jackson",
                Map.of("lesson", "boot-philosophy", "module", "spring-boot")),
        new Document("Auto-configuration registers beans conditionally",
                Map.of("lesson", "boot-philosophy", "module", "spring-boot"))
));
```

Retrieve by similarity — the heart of RAG:

```java
List<Document> matches = vectorStore.similaritySearch(
        SearchRequest.builder()
                .query("what does the web starter include?")
                .topK(3)                       // top 3 most similar
                .similarityThreshold(0.5)      // ignore weak matches
                .build());
```

## Vector databases for production

| Store | When |
|---|---|
| `SimpleVectorStore` | Dev/tests, small corpora, single instance |
| PostgreSQL + pgvector | Already running Postgres — zero new infra |
| Redis | Existing Redis, low-latency |
| Milvus / Weaviate / Qdrant / Chroma | Large corpora, dedicated vector DB |
| Elasticsearch | Hybrid keyword + vector search |

Each has a Spring AI starter — the `VectorStore` interface stays the same:

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-vector-store-pgvector</artifactId>
</dependency>
```

## The ingestion pattern

```java
@Component
public class DocumentIngester {

    private final VectorStore vectorStore;

    @Bean
    ApplicationRunner ingest() {
        return args -> {
            List<Document> docs = markdownFiles.stream()
                    .map(f -> new Document(f.text(),
                            Map.of("source", f.name())))
                    .toList();
            vectorStore.add(docs);          // chunk + embed + store
        };
    }
}
```

**Chunking matters**: split long docs into ~500–1000 token chunks with overlap, so retrieval finds the *relevant* piece, not a wall of text. Spring AI provides `TokenTextSplitter`/`DocumentSplitter`:

```java
List<Document> chunks = new TokenTextSplitter().apply(originalDocs);
```

> **Why it matters (organizational view)** — Embeddings are the "search" layer of AI features: FAQ answers, docs assistants, semantic search over tickets. The org pattern: one embedding provider (dimensions must match the vector store), chunked ingestion pipelines with versioned documents, and pgvector first (you already run Postgres) before adding a dedicated vector DB.

## Key takeaways

- Embeddings = meaning as vectors; similarity = closeness in vector space.
- `EmbeddingModel.embed(...)` → `float[]`; `VectorStore.add/similaritySearch` for storage.
- SimpleVectorStore for dev; pgvector/Redis/dedicated DBs for production.
- Chunk documents (~500-1000 tokens, overlap) before embedding.

**Official docs:** [Embeddings](https://docs.spring.io/spring-ai/reference/api/embeddings.html) · [Vector databases](https://docs.spring.io/spring-ai/reference/api/vectordbs.html)
