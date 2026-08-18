---
title: The Query DSL — Match, Term, Bool, and Relevance
module: elasticsearch-deep
order: 3
minutes: 28
topics: ["query DSL", "match query", "bool query", "term query", "relevance scoring", "filters"]
docs:
  - title: "Query DSL (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl.html"
  - title: "Boolean Query (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-bool-query.html"
---

# The Query DSL — Match, Term, Bool, and Relevance

## The Concept: A Query Language for Relevance, Not Just Matching

The **Query DSL** is Elasticsearch's JSON query language — and its design reflects the engine's purpose: *ranking*, not just filtering. There are two families of clauses that beginners constantly conflate, and the difference is the key to the whole DSL:

- **Query context** — *how well* does a document match? Produces a **relevance score**; results are ranked. Used for the "search" part: `match`, `multi_match`, `match_phrase`.
- **Filter context** — *does* a document match, yes/no? No scoring, and — the performance gem — filter results are **cacheable**. Used for the "constraints" part: `term`, `range`, `exists`, and the `filter` clause of `bool`.

**The mental model:** a real search UI has both: "find products matching 'mechanical keyboard' (scored, ranked by relevance) that are under $100, in stock, category=peripherals (filters — no scoring, cached)." The DSL separates these cleanly: the `bool` query combines scored `must`/`should` clauses with unscored `filter` clauses.

## The Core Queries

```bash
# 1. MATCH — the full-text workhorse. Analyzes the query text and
#    matches any of the resulting terms (OR by default):
GET /products/_search
{ "query": { "match": { "description": "mechanical keyboard" } } }
# -> docs containing "mechanical" OR "keyboard", scored higher if both,
#    ranked by relevance (BM25).

# 2. MATCH_PHRASE — the words in order, as a phrase:
GET /products/_search
{ "query": { "match_phrase": { "description": "mechanical keyboard" } } }
# -> "mechanical keyboard" as a contiguous phrase.

# 3. MULTI_MATCH — the same text across several fields:
GET /products/_search
{ "query": { "multi_match": {
    "query": "wireless",
    "fields": ["name^3", "description"] } } }
# -> name matches weigh 3x more (^3 = boost).

# 4. TERM — exact value match on a NON-analyzed field (keyword/number):
GET /products/_search
{ "query": { "term": { "brand": "Logitech" } } }
# -> brand exactly equals "Logitech". (On a `text` field this would
#    usually fail — the analyzed term isn't the whole value.)

# 5. RANGE — numeric/date ranges:
GET /products/_search
{ "query": { "range": { "price": { "gte": 50, "lt": 150 } } } }
```

**The pattern to see:** `match`/`match_phrase`/`multi_match` are the *search* queries (analyzed, scored); `term`/`range` are the *exact* queries (unanalyzed, filter-style). Use the former on `text` fields, the latter on `keyword`/numeric/date fields. Mixing them up — `match` on `keyword`, `term` on `text` — is the source of most "search doesn't work" bugs.

## The bool Query: Composing Everything

```java
// The production query shape — combining scored and unscored clauses:
SearchResponse<Product> response = es.search(s -> s
    .index("products")
    .query(q -> q.bool(b -> b
        .must(m -> m.match(mt -> mt.field("description")
                                      .query("mechanical keyboard"))))
        .filter(f -> f.term(t -> t.field("brand").value("Logitech")))
        .filter(f -> f.range(r -> r.field("price")
                                    .gte(JsonData.of(50))
                                    .lt(JsonData.of(150))))
        .filter(f -> f.term(t -> t.field("inStock").value(true)))
    ), Product.class);
```

**The bool clause roles:**

- **`must`** — required *and* scored (the search terms). Docs must match; they also contribute to ranking.
- **`filter`** — required but *not* scored (the constraints). Docs must match; ranking ignores them. **Cacheable** — the reason to put pure constraints here instead of `must`.
- **`should`** — optional, adds score when matched. In a query with no `must`/`filter`, at least one `should` must match (like OR). With `must`, `should`s act as ranking boosts ("prefer docs that also mention 'bluetooth'").
- **`must_not`** — excluded (and not scored). "But not this."

The JSON for the same query shows the structure directly:

```json
{ "query": { "bool": {
    "must":   [ { "match": { "description": "mechanical keyboard" } } ],
    "filter": [
      { "term":  { "brand": "Logitech" } },
      { "range": { "price": { "gte": 50, "lt": 150 } } },
      { "term":  { "inStock": true } }
    ]
} } }
```

**Read it as a sentence:** "match documents about 'mechanical keyboard' (ranked), but only Logitech products priced $50–150 that are in stock (unscored filters)." Every production search query is this shape — scored intent in `must`/`should`, constraints in `filter`.

## Relevance Scoring: Why This Result Is First

Elasticsearch ranks results by a score computed with **BM25** (the modern successor to TF-IDF). Two factors dominate:

- **Term frequency (TF):** the more a term appears in a document, the more relevant it is — but with diminishing returns (BM25 saturates, so a term appearing 50 times doesn't score 50× a single mention).
- **Inverse document frequency (IDF):** the *rarer* a term is across all documents, the more it signals relevance. "mechanical" in a tech store is common (low weight); "mechanical" in a general store is rare (high weight). Common words (the, and) barely count — they're in (almost) every document.

**The practical consequences:** adding `must` terms raises the bar and narrows relevance; `should` terms *boost* documents that match them (the "prefer X" dial); `filter` terms don't affect ranking at all (that's why constraints go there). When the "right" result isn't first, the usual fixes are **boosts** (`name^3`), moving terms between `must`/`should`, or **`function_score`** for business rules ("newer products rank higher").

## Pagination, Sorting, and Aggregations

```java
SearchResponse<Product> response = es.search(s -> s
    .index("products")
    .query(q -> q.match(m -> m.field("description").query("keyboard")))
    .from(20).size(10)                      // page 3 of 10
    .sort(so -> so.field(f -> f.field("price")
                              .order(SortOrder.Asc))),
    Product.class);

// Aggregations — the "GROUP BY" of search:
SearchResponse<Product> aggResponse = es.search(s -> s
    .index("products")
    .size(0)                                // no hits needed, just the agg
    .aggregations("byBrand", a -> a.terms(t -> t.field("brand.keyword")
                                               .size(10)))
    .aggregations("avgPrice", a -> a.avg(av -> av.field("price"))),
    Product.class);
```

**The two big reminders:** deep pagination via `from`/`size` is expensive beyond a few thousand (use **search_after** or PIT for deep pages); and **aggregations need `keyword` fields** — aggregating on analyzed `text` errors. Aggregations are the analytics half of Elasticsearch: counts by category, averages, date histograms ("requests per hour") — the ELK log-dashboard engine.

## Recap

The Query DSL has two clause families: scored *query* clauses (`match`, `match_phrase`, `multi_match` — the search intent, ranked by BM25 relevance) and unscored *filter* clauses (`term`, `range` — exact constraints, cacheable). The `bool` query composes them: `must` (required + scored), `filter` (required, unscored, cached), `should` (optional boosts), `must_not` (excluded). Relevance comes from term frequency and inverse document frequency, tuned with field boosts. And the operational extras — sorting, pagination (shallow), and aggregations on `keyword` fields — complete the toolbox. Read a query as "search intent + constraints," and the DSL stops being a wall of JSON and becomes a sentence.
