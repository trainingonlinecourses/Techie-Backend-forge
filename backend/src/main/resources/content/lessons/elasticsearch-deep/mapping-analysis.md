---
title: Mapping and Analysis — How Fields Become Searchable
module: elasticsearch-deep
order: 3
minutes: 27
topics: ["mapping", "analyzers", "tokenization", "stemming", "field types", "dynamic mapping"]
summary: When you index a document, Elasticsearch must decide how to treat each field — is price a number (range queries, sorting) or text (tokenized search...
docs:
  - title: "Mapping (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html"
  - title: "Analysis (Elastic docs)"
    url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/analysis.html"
---

# Mapping and Analysis — How Fields Become Searchable

## The Concept: The Schema You Didn't Know You Had

When you index a document, Elasticsearch must decide *how to treat each field* — is `price` a number (range queries, sorting) or text (tokenized search)? Is `title` analyzed for full-text or kept verbatim? This decision is the **mapping**: the per-field type and analysis configuration. If you don't declare it, Elasticsearch **infers it dynamically** from the first document it sees — convenient, and a silent trap when the inference is wrong.

**The mental model:** the mapping is the recipe for the inverted index. A *text* field gets analyzed: words are extracted, transformed, and each becomes an index entry. A *keyword* field is stored verbatim — the whole string is one token — so it can be filtered, sorted, and aggregated exactly. A *number* field is indexed numerically so range queries work. Get the recipe wrong and your searches return nothing, your aggregations fail, or your sort orders wrongly — and because the mapping is fixed once the index has data, fixing it later means reindexing.

## Field Types: The Core Vocabulary

| Type | Behavior | Use for |
|---|---|---|
| `text` | analyzed: tokenized, stemmed, match-able | full-text search (descriptions, titles) |
| `keyword` | verbatim: the whole value is one token | filters, sorting, aggregations (status, category, email) |
| `integer` / `long` / `double` | numeric: range queries, sorting | prices, counts, ages |
| `boolean` | true/false | flags |
| `date` | timestamps: range queries, date math | createdAt, expiresAt |
| `object` / `nested` | embedded documents | addresses, line items |
| `geo_point` | lat/lon: geo queries | locations |
| `ip` | IP addresses: CIDR queries | access logs |
| `completion` | autocomplete-suggest structures | typeahead |

The key distinction to internalize: **`text` is for matching words; `keyword` is for matching the whole value.** Searching "bluetooth" works on a `text` field; `term`-filtering "exactly equals bluetooth keyboard" or sorting alphabetically requires `keyword`.

## Declaring a Mapping

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name":       { "type": "text" },
      "brand":      { "type": "keyword" },
      "description":{"type": "text", "analyzer": "english" },
      "price":      { "type": "double" },
      "inStock":    { "type": "boolean" },
      "tags":       { "type": "keyword" },
      "createdAt":  { "type": "date" },
      "specs":      { "type": "object", "properties": {
                        "weight_kg": { "type": "double" } } }
    }
  }
}
```

**Walking through the decisions:** `name` is `text` (people search words in it). `brand` and `tags` are `keyword` (filter by exact brand, aggregate by tag). `description` is `text` *with a custom analyzer* — `english` gives stemming so "running" matches "run". `price` is `double` for range queries ("under $100"). `createdAt` is `date` for time filters and sort-by-newest. Notice the *multi-type* pattern in real mappings: a field is often both `text` and `keyword` (via a sub-field), so it's searchable *and* sortable:

```json
"title": { "type": "text",
           "fields": { "keyword": { "type": "keyword" } } }
-- now "title" matches words, and "title.keyword" sorts exactly
```

## Analyzers: The Text Pipeline

An analyzer is a pipeline with three stages: **character filters** → **tokenizer** → **token filters**:

```text
"Running shoes for Runners!"
        │ char filters (strip HTML, replace chars)
        ▼
        │ tokenizer (split into words)
        ▼
   [Running, shoes, for, Runners]
        │ token filters (lowercase, stem, remove stops)
        ▼
   [run, shoe, runner]        ← the terms actually indexed
```

```json
// A custom analyzer — compose your own pipeline:
PUT /products/_settings
{
  "analysis": {
    "analyzer": {
      "products_analyzer": {
        "type": "custom",
        "tokenizer": "standard",
        "filter": ["lowercase", "english_stemmer"]
      }
    },
    "filter": {
      "english_stemmer": { "type": "stemmer", "language": "english" }
    }
  }
}
```

**The rule that governs everything:** the terms in the index are the *analyzed* output, not the raw text. A query is analyzed the same way before matching. So "Running" (query) becomes `run`, "running" (document) becomes `run` — match. That's stemming working. The failure mode: index with one analyzer, query with another — the terms never align and search silently returns nothing.

## Dynamic Mapping: Convenience and Its Traps

If you index without declaring a mapping, Elasticsearch infers types from the first document:

```json
PUT /logs/_doc/1
{ "message": "Request failed", "status": 500, "duration": 42.5 }
-- auto-mapping: message -> text, status -> long, duration -> float
```

**The traps of relying on it:**

1. **The first document sets the type forever.** A later document with `status: "500"` (a string) fails or coerces — the mapping doesn't adapt.
2. **`message: "Request failed"` becomes searchable text — but if you then want to aggregate on `message.keyword`, it doesn't exist.**
3. **Numbers and booleans get guessed wrong** (a phone number field becomes `long`; a zip code becomes numeric and loses leading zeros).
4. **Date strings can be mis-detected** as text.

The production discipline: **declare mappings explicitly for indices whose shape you know** (products, users, orders); use dynamic mapping only for logs and other genuinely shape-shifting data. "It worked on the first document" is not a schema.

## Reindexing: When the Mapping Must Change

Mapping changes (adding a field is fine — new fields are just not indexed on old docs; *changing a type* is not). Changing `text` to `keyword` requires a **reindex**: create the new index with the correct mapping, copy documents over, switch aliases:

```bash
# 1. Create products_v2 with the corrected mapping.
# 2. Copy data:
POST /_reindex
{ "source": { "index": "products" },
  "dest":   { "index": "products_v2" } }
# 3. Atomically switch the alias:
POST /_aliases
{ "actions": [ { "remove": { "index": "products", "alias": "products_active" } },
               { "add":    { "index": "products_v2", "alias": "products_active" } } ] }
```

The **alias** pattern is the production answer to schema evolution: applications query the alias, never the raw index name, so a reindex is invisible to them. (This is exactly how Spring Data Elasticsearch's index-management and the Elasticsearch Rollover API operate.)

## Common Mistakes and Their Symptoms

| Mistake | Symptom |
|---|---|
| Searching a `keyword` field with `match` | No results (whole-value match only) |
| Filtering a `text` field with `term` | No results (term looks for the exact token) |
| Sorting on `text` | Error — text isn't sortable (use `.keyword`) |
| Analyzer mismatch index vs query | Mysterious empty results |
| Range query on a dynamically-mapped string | Error or wrong behavior |
| Aggregating on `text` | Error — aggregations need `keyword` |

Every one of these is a mapping/analysis misunderstanding — which is why "check the mapping" is the first diagnostic for search bugs.

## Recap

The mapping is Elasticsearch's per-field schema: `text` fields get analyzed for word matching, `keyword` fields stay verbatim for filters/sorting/aggregations, and numeric/date/geo types enable their specialized queries. Analyzers — char filters, tokenizer, token filters — transform raw text into the terms that actually enter the inverted index, and index-time and query-time analysis must agree for matching to work. Dynamic mapping is convenient and treacherous: the first document fixes the types, so production indices get explicit mappings (with `text` + `keyword` sub-fields for the sortable-and-searchable pattern) and evolution goes through aliases + reindex. The mapping isn't an afterthought — it *is* the search behavior, decided before the first document lands.
