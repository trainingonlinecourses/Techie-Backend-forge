---
title: Elasticsearch Basics — Inverted Indexes and Distributed Search
module: elasticsearch-deep
order: 1
minutes: 26
topics: ["Elasticsearch", "inverted index", "search", "Lucene", "documents", "indices"]
docs:
  - title: "Elasticsearch Guide — What Is Elasticsearch?"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/elasticsearch-intro.html"
  - title: "Inverted Index (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/documents-indices.html"
---

# Elasticsearch Basics — Inverted Indexes and Distributed Search

## The Concept: Search Is Not Lookup

A database finds rows by *matching values* — `WHERE title = 'spring'`. But real search is *fuzzy, ranked, and language-aware*: "spring boot tutorial" should find "Mastering Spring Boot for Beginners" even though no field equals the query, and rank the best match first. That's the problem **Elasticsearch** solves, and the engine under it is **Lucene** — the same library powering Solr and countless search features.

**The mental model:** imagine a librarian building the back-of-the-book index. Rather than scanning every page for every query, they build an **inverted index**: a dictionary mapping each *word* to the list of *documents containing it*. Query "spring" → look up "spring" in the dictionary → instantly get every document with that word. That lookup is O(1)-ish (well, O(log n) on the dictionary) — independent of how many documents exist. This inverted structure is the entire secret of search speed.

**Why it's different from a database:** SQL `LIKE '%spring%'` must scan every row — O(n) — and has no notion of relevance. Elasticsearch pre-builds the inverted index so queries are dictionary lookups, then *scores* each match (TF-IDF / BM25) to rank results, then supports analysis (stemming: "running" matches "run"), fuzzy matching, and faceting. Databases answer "which rows have this value?"; Elasticsearch answers "which documents are *most relevant* to this phrase, and why?"

## Documents, Indices, and Shards

- **Document** — a JSON object, the searchable unit. Like a MongoDB document or a table row.
- **Index** — a collection of documents, like a table or a collection. `search_products` holds product documents.
- **Shard** — an index is split into shards (Lucene instances); each shard is an independent inverted index. Shards give **scalability** (an index too big for one machine is split across many) and **parallelism** (a query fans out to all shards and merges results).
- **Replica** — a copy of a shard; gives **availability** (a node dies, replicas serve) and **read throughput** (queries load-balance across copies).

```text
Index: products
├── Shard 0 (primary)  ── replica on node B
├── Shard 1 (primary)  ── replica on node B
└── Shard 2 (primary)  ── replica on node B
```

## Indexing and Querying: The Two Faces

**Indexing** (the write side) — analyzing text and building the inverted index:

```bash
# Index a document (PUT to /<index>/_doc/<id>):
PUT /products/_doc/1
{
  "name": "Wireless Mechanical Keyboard",
  "description": "Compact mechanical keyboard with Bluetooth and RGB backlight",
  "price": 89.99,
  "tags": ["keyboard", "bluetooth", "mechanical"]
}
```

**Querying** (the read side) — matching and ranking:

```bash
GET /products/_search
{
  "query": { "match": { "description": "mechanical keyboard bluetooth" } }
}
```

The query's words are looked up in the inverted index, candidate documents are scored, and the top hits return — *ranked*, with a relevance score on each. That's the whole lifecycle in miniature: index documents, then search them.

## Analysis: The Part That Makes Text Searchable

Before text enters the inverted index, it passes through **analysis** — a pipeline that transforms raw text into searchable tokens:

```text
"Compact Mechanical Keyboard"
        │  (standard analyzer, for example)
        ▼
[compact, mechanical, keyboard]   ← lowercase, split on words, etc.
```

The default **standard analyzer** lowercases and splits on word boundaries. More advanced analyzers add: **stemming** (running/ran/runs → run), **stop-word removal** (the, a, an), **synonyms** (car ↔ automobile), **n-grams** (partial-word matching for autocomplete). The critical operational insight: **the analyzer you index with must match the analyzer you search with** — text indexed with stemming won't match a non-stemmed query the way you expect. This mismatch is the #1 "search doesn't work" bug in Elasticsearch projects.

## The Java Client

```java
// The modern client (elasticsearch-java):
import co.elastic.clients.elasticsearch.ElasticsearchClient;
import co.elastic.clients.elasticsearch.core.*;
import co.elastic.clients.json.jackson.JacksonJsonpMapper;
import co.elastic.clients.transport.rest_client.RestClientTransport;
import org.elasticsearch.client.RestClient;

// 1. Build the client (wraps the low-level REST client):
RestClient restClient = RestClient.builder(
        new HttpHost("localhost", 9200, "http")).build();
RestClientTransport transport = new RestClientTransport(restClient, new JacksonJsonpMapper());
ElasticsearchClient es = new ElasticsearchClient(transport);

// 2. Index a document:
Product product = new Product("1", "Wireless Mechanical Keyboard", 89.99);
IndexResponse index = es.index(i -> i.index("products").id(product.id())
        .document(product));
System.out.println("Indexed: " + index.result());   // Created

// 3. Search:
SearchResponse<Product> response = es.search(s -> s
                .index("products")
                .query(q -> q.match(m -> m.field("name").query("mechanical keyboard"))),
        Product.class);
response.hits().hits().forEach(hit ->
        System.out.println("Hit: " + hit.source().name() +
                           " (score " + hit.score() + ")"));
```

**Walking through it:** the client is built on the REST transport with a JSON mapper (Jackson). Indexing is `index(...)` with the document; searching is `search(...)` with a query built from the fluent builder (`match` → the `match` query). The typed client maps results back into your POJO/record. Note the syntax shape: every Elasticsearch feature — queries, aggregations, mappings — follows the same fluent-builder pattern, so once you can read one you can read them all.

## The Deployment Reality

Elasticsearch is a Java service (a cluster of nodes), typically run via Docker, Kubernetes, or a managed offering (Elastic Cloud). One node is fine for dev; production runs a cluster of 3+ nodes with replicas. The operational essentials: **heap size** (set `-Xms`/`-Xmx` equal, half the machine's RAM), **disk** (indices grow; monitor), and **snapshots** (backups to object storage — `snapshot` API). Like Kafka, the client side is the easy part; the cluster is the craft.

## Recap

Elasticsearch is Lucene's inverted index wrapped in a distributed, JSON-API search engine: documents go into sharded indices; text is *analyzed* (tokenized, stemmed) into searchable terms; queries are dictionary lookups that return *ranked* results. It's fundamentally different from database lookup — fuzzy, language-aware, relevance-scored — which is why it powers search, log analysis (the ELK stack), and autocomplete everywhere. The three concepts to master first: the **inverted index** (why it's fast), **analysis** (why matching works the way it does — and why index/search analyzers must agree), and **shards + replicas** (why it scales and survives). From there, every query DSL feature is a variation on the same mechanism.
