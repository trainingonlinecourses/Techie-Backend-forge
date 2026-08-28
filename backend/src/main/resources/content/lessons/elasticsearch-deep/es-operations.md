---
title: Elasticsearch Operations — Complete Beginner's Guide
summary: Indexing documents, searching with DSL, filtering, aggregations, and Spring Data Elasticsearch integration.
order: 2
minutes: 20
topics: [elasticsearch, indexing, searching, dsl, aggregations, spring data elasticsearch]
docs:
  - https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html
  - https://docs.spring.io/spring-data/elasticsearch/reference/
---

# Elasticsearch Operations — Complete Beginner's Guide

## What Elasticsearch is

Elasticsearch is a **search engine** built on Apache Lucene. It stores, searches, and analyzes large volumes of data in near-real-time. Think of it as a super-powered database optimized for **full-text search** and **analytics**.

```
Traditional database (PostgreSQL):
  SELECT * FROM products WHERE name LIKE '%iPhone%';  -- Slow on millions of rows!

Elasticsearch:
  GET /products/_search?q=iPhone  -- Returns results in milliseconds, even with millions of docs
```

**Why use it alongside a database?**
- **Full-text search** — "find products containing 'wireless noise cancelling headphones'"
- **Fuzzy matching** — "find 'iphon' → matches 'iPhone'"
- **Autocomplete** — suggest completions as you type
- **Analytics** — "count products by category, average price per category"

## Core concepts

| Concept | What it is | Database analogy |
|---|---|---|
| **Index** | A collection of documents | Database table |
| **Document** | A JSON object | A row |
| **Field** | A key-value pair in a document | A column |
| **Mapping** | Schema definition for an index | Table schema |
| **Cluster** | A group of nodes | Database cluster |

## Indexing documents — adding data

```java
// Spring Data Elasticsearch — just annotate your entity
@Document(indexName = "products")
public class Product {
    @Id
    private Long id;
    
    @Field(type = FieldType.Text, analyzer = "standard")  // Line 1: Full-text searchable
    private String name;
    
    @Field(type = FieldType.Text)
    private String description;
    
    @Field(type = FieldType.Double)
    private Double price;
    
    @Field(type = FieldType.Keyword)  // Line 2: Exact match (not analyzed)
    private String category;
    
    @Field(type = FieldType.Date)
    private LocalDateTime createdAt;
}
```

```java
// Repository — Spring Data generates the implementation
@Repository
public interface ProductRepository extends ElasticsearchRepository<Product, Long> {
    // Custom search methods
    List<Product> findByNameContaining(String name);                    // Full-text search
    List<Product> findByCategoryAndPriceLessThan(String cat, Double p); // Filter + range
}
```

## Searching with Query DSL

Elasticsearch has its own query language (DSL). Spring Data Elasticsearch wraps it, but understanding DSL helps:

```java
// Method 1: Repository methods (simple)
List<Product> products = productRepository.findByNameContaining("wireless headphones");

// Method 2: ElasticsearchOperations (complex queries)
SearchQuery query = new NativeSearchQueryBuilder()
    .withQuery(QueryBuilders.matchQuery("name", "wireless headphones"))  // Line 1: Full-text search
    .withFilter(QueryBuilders.rangeQuery("price").lt(100.0))            // Line 2: Price filter
    .withSort(Sort.by("price").ascending())                              // Line 3: Sort by price
    .withPageable(PageRequest.of(0, 10))                                 // Line 4: Pagination
    .build();

List<Product> products = operations.queryForList(query, Product.class);
```

## Common search patterns

### Full-text search

```java
// "find products where name OR description contains 'wireless'"
SearchQuery query = new NativeSearchQueryBuilder()
    .withQuery(QueryBuilders.multiMatchQuery("wireless", "name", "description"))
    .build();
```

### Fuzzy search (typo-tolerant)

```java
// "find products matching 'iphon' (fuzzy → matches 'iPhone')"
SearchQuery query = new NativeSearchQueryBuilder()
    .withQuery(QueryBuilders.fuzzyQuery("name", "iphon")
        .fuzziness(Fuzziness.AUTO))  // Line 1: Allow typos
    .build();
```

### Autocomplete

```java
// Suggest completions as user types
SearchQuery query = new NativeSearchQueryBuilder()
    .withSuggestBuilder(new SuggestBuilder()
        .addSuggestion("product-suggest",
            SuggestBuilders.completionSuggestion("name")
                .prefix("wire")           // Line 1: User typed "wire"
                .skipDuplicates(true)      // Line 2: No duplicate suggestions
                .size(5)))                // Line 3: Top 5 suggestions
    .build();
```

## Aggregations — analytics

```java
// "count products by category, average price per category"
SearchQuery query = new NativeSearchQueryBuilder()
    .addAggregation(AggregationBuilders
        .terms("by_category")                     // Line 1: Group by category
        .field("category")                        // Line 2: Field to group on
        .subAggregation(                          // Line 3: Nested aggregation
            AggregationBuilders.avg("avg_price")
                .field("price")                   // Line 4: Average price
        )
    )
    .build();

Aggregations aggregations = operations.query(query, SearchResponse.class).getAggregations();
Terms byCategory = aggregations.get("by_category");

for (Terms.Bucket bucket : byCategory.getBuckets()) {
    String category = bucket.getKeyAsString();     // Line 1: Category name
    long count = bucket.getDocCount();             // Line 2: Number of products
    Avg avgPrice = bucket.getAggregations().get("avg_price");  // Line 3: Average price
    System.out.println(category + ": " + count + " products, avg $" + avgPrice.getValue());
}
```

## Real-world scenario — product search

```java
@Service
public class ProductSearchService {
    private final ElasticsearchOperations operations;
    
    // Advanced search with filters, sorting, and pagination
    public SearchResults<Product> search(String query, String category, 
                                         Double minPrice, Double maxPrice,
                                         int page, int size) {
        NativeSearchQueryBuilder builder = new NativeSearchQueryBuilder();
        
        // Full-text search across name and description
        if (query != null && !query.isEmpty()) {
            builder.withQuery(QueryBuilders.multiMatchQuery(query, "name", "description"));
        } else {
            builder.withQuery(QueryBuilders.matchAllQuery());  // Line 1: No query → return all
        }
        
        // Category filter
        if (category != null) {
            builder.withFilter(QueryBuilders.termQuery("category", category));  // Line 2: Exact match
        }
        
        // Price range filter
        if (minPrice != null || maxPrice != null) {
            RangeQueryBuilder priceRange = QueryBuilders.rangeQuery("price");
            if (minPrice != null) priceRange.gte(minPrice);  // Line 3: Minimum price
            if (maxPrice != null) priceRange.lte(maxPrice);  // Line 4: Maximum price
            builder.withFilter(priceRange);
        }
        
        // Sorting and pagination
        builder.withSort(Sort.by("price").ascending());
        builder.withPageable(PageRequest.of(page, size));
        
        return operations.queryForPage(builder.build(), Product.class);
    }
}
```

## Common mistakes

| Mistake | Why it's bad | Fix |
|---|---|---|
| Using `match` for exact values | Wrong results for categories, IDs | Use `term` for exact, `match` for full-text |
| No mapping for text fields | Can't search properly | Define `@Field` annotations |
| Searching without pagination | Returns millions of results | Always use `Pageable` |
| Syncing manually | Data gets out of sync | Use `@Document` + Spring Data |
| Ignoring analyzers | Wrong tokenization | Define analyzers in mapping |

## Key takeaways

- Elasticsearch is for full-text search and analytics, not primary data storage
- `@Document(indexName = "products")` defines the index; `@Field` defines searchable fields
- `match` for full-text, `term` for exact, `range` for numeric ranges
- Aggregations enable analytics (counts, averages, histograms)
- Spring Data Elasticsearch generates repositories like JPA — minimal code

**Official docs:** [Elasticsearch Reference](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html) · [Spring Data Elasticsearch](https://docs.spring.io/spring-data/elasticsearch/reference/)
