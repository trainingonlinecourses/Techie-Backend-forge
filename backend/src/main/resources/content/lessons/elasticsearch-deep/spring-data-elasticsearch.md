---
title: Spring Data Elasticsearch — Repositories and the Search Template
module: elasticsearch-deep
order: 5
minutes: 26
topics: ["Spring Data Elasticsearch", "ElasticsearchRepository", "search template", "@Document", "native query"]
docs:
  - title: "Spring Data Elasticsearch Reference"
    url: "https://docs.spring.io/spring-data/elasticsearch/reference/"
  - title: "ElasticsearchRepository (Spring API)"
    url: "https://docs.spring.io/spring-data/elasticsearch/docs/current/api/org/springframework/data/elasticsearch/repository/ElasticsearchRepository.html"
summary: Spring Data Elasticsearch brings the repository pattern to Elasticsearch: @Document classes map to indices, repository interfaces provide derived q...
---

# Spring Data Elasticsearch — Repositories and the Search Template

## The Concept: Spring Data for Search

Spring Data Elasticsearch brings the repository pattern to Elasticsearch: `@Document` classes map to indices, repository interfaces provide derived queries, and the same conventions you know from JPA/MongoDB apply. The twist: because search is *scored and flexible*, the framework also exposes the raw **Query DSL** through `ElasticsearchOperations` — so you get the CRUD convenience of Spring Data and the full power of the query language when you need it.

**The mental model:** `ElasticsearchRepository` is the CRUD doorway (save, findById, delete — mapped to index operations). `ElasticsearchOperations` (the search template, like `MongoTemplate`) is the power doorway — native queries, aggregations, custom mappings, anything the DSL can express. Repositories for the 90% case, the operations template for the 10% that needs the whole language.

## Setup and Mapping

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
</dependency>
```

```properties
spring.elasticsearch.uris=http://localhost:9200
```

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.elasticsearch.annotations.Document;
import org.springframework.data.elasticsearch.annotations.Field;
import org.springframework.data.elasticsearch.annotations.FieldType;

@Document(indexName = "products")               // the ES index
public class Product {

    @Id private String id;

    // text + keyword sub-field: searchable AND sortable/aggregatable.
    @Field(type = FieldType.Text,
           fields = @Field(type = FieldType.Keyword, name = "keyword"))
    private String name;

    @Field(type = FieldType.Text)
    private String description;

    @Field(type = FieldType.Double)
    private double price;

    @Field(type = FieldType.Boolean)
    private boolean inStock;

    @Field(type = FieldType.Keyword)
    private String brand;

    // getters/setters...
}
```

**Walking through it:** `@Document(indexName)` maps the class to an index; `@Field(type)` declares each field's Elasticsearch type — the mapping annotations from the mapping lesson, in Java. The `text` + `keyword` sub-field pattern (`name` searchable, `name.keyword` sortable) is expressed directly. Spring creates/updates the index from these annotations on startup (`spring.elasticsearch...index.auto-create`), which is convenient for dev — production typically manages mappings explicitly (index templates, migrations) and relies on the annotations for the definition.

## The Repository

```java
import org.springframework.data.elasticsearch.repository.ElasticsearchRepository;
import java.util.List;

public interface ProductRepository extends ElasticsearchRepository<Product, String> {

    // Derived queries — Spring translates method names into the DSL:
    List<Product> findByName(String name);
    List<Product> findByBrand(String brand);
    List<Product> findByPriceBetween(double min, double max);
    List<Product> findByInStockTrue();
    long countByBrand(String brand);
}
```

Out of the box: `save`, `findById`, `findAll`, `deleteById`, `count` — all mapped to Elasticsearch operations. The derived methods (`findByPriceBetween` → `range` query, `findByInStockTrue` → `term` on boolean) follow the same name-grammar as Mongo/JPA. The limitation to know: derived *search* methods on analyzed `text` fields can be subtle (matching tokens, not phrases) — for real relevance search you'll reach for `ElasticsearchOperations`.

## The Search Template: Native Power

```java
import org.springframework.data.elasticsearch.core.ElasticsearchOperations;
import org.springframework.data.elasticsearch.core.SearchHits;
import org.springframework.data.elasticsearch.core.query.Criteria;
import org.springframework.data.elasticsearch.core.query.CriteriaQuery;
import org.springframework.data.elasticsearch.core.query.Query;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class ProductSearchService {
    private final ElasticsearchOperations operations;

    public ProductSearchService(ElasticsearchOperations operations) {
        this.operations = operations;
    }

    // Criteria-based: readable, type-safe composition:
    public SearchHits<Product> search(String keyword, String brand, double maxPrice) {
        Criteria c = new Criteria();
        if (keyword != null && !keyword.isBlank()) {
            c = c.and(new Criteria("description").matches(keyword));
        }
        if (brand != null && !brand.isBlank()) {
            c = c.and(new Criteria("brand").is(brand));     // term
        }
        c = c.and(new Criteria("price").lessThanEqual(maxPrice));

        return operations.search(new CriteriaQuery(c), Product.class);
    }

    // The FULL native DSL for the 10% case — this is the Elasticsearch
    // JSON query expressed in the typed client's builder (or with the
    // fluent StringQuery for raw JSON):
    public SearchHits<Product> nativeSearch(String keyword) {
        // Using the low-level client's query builder through Spring:
        org.elasticsearch.index.query.QueryBuilder qb =
            org.elasticsearch.index.query.QueryBuilders.boolQuery()
                .must(QueryBuilders.matchQuery("description", keyword))
                .filter(QueryBuilders.rangeQuery("price").gte(50))
                .filter(QueryBuilders.termQuery("inStock", true));
        return operations.search(
                new org.springframework.data.elasticsearch.core.query.NativeQuery(qb),
                Product.class);
    }
}
```

**Walking through it:** `Criteria` is the type-safe query builder — `and`, `matches` (analyzed full-text), `is` (term), `lessThanEqual` (range) compose into a query with the familiar Java fluency. `operations.search(query, Product.class)` runs it and returns `SearchHits<Product>` — which carries the hits *and their scores*, plus facets/aggregations. For the full Query DSL (bool/must/filter with boosts), `NativeQuery` accepts raw Lucene query builders — the entire Elasticsearch query language, from Spring. **SearchHits is the return type to know**: `hit.getContent()`, `hit.getScore()`, and `searchHits.getTotalHits()` give you results plus the relevance data the whole engine exists to produce.

## Index Management and the Write Side

```java
@Service
public class IndexService {
    private final ElasticsearchOperations operations;

    // Rebuild the index — the "reindex via Java" path:
    public void recreateIndex(Class<Product> type) {
        boolean exists = operations.indexOps(type).exists();
        if (exists) operations.indexOps(type).delete();
        operations.indexOps(type).create();          // creates from @Document
        operations.indexOps(type).putMapping();      // applies the mapping
    }
}
```

`IndexOperations` (`operations.indexOps(...)`) is the mapping/index management face: `exists`, `create`, `putMapping`, `refresh`, `delete`. For production you'll mostly manage indices externally (templates, aliases, reindex scripts) — but the Java API is there when the app must own its index lifecycle.

## The Sync Problem: Keeping the Index Current

Elasticsearch is a *search index*, not the source of truth — and the eternal question is **how the index stays in sync with the database**. The standard patterns:

1. **Dual-write:** update the DB and index in the same service method — simple, but a crash between the two leaves them out of sync (unless you use the transactional outbox pattern).
2. **CDC / log tailing:** stream DB changes (via Debezium, Kafka) to an indexer — the production-grade answer for high volumes.
3. **Scheduled reindex:** batch rebuilds for non-critical data — simple, eventually consistent.
4. **Spring Data sync on save:** index in the repository's save path — fine for small datasets.

The engineering rule: **the database is authoritative; the index is a derived, eventually-consistent projection.** Accept the lag, design for it, and rebuild the index from the DB when it drifts — that's the mental model that keeps search from corrupting your source of truth.

## Recap

Spring Data Elasticsearch gives you repository-style CRUD (`ElasticsearchRepository` with derived methods) and full query power (`ElasticsearchOperations` with `Criteria`, `NativeQuery`, and `SearchHits` carrying scores). `@Document`/`@Field` annotations declare the mapping — including the `text`+`keyword` sub-field pattern — and `IndexOperations` manages the index lifecycle. The two habits to take away: use repositories for standard access and the search template for relevance search; and treat the index as a **derived, eventually-consistent projection of the database** — synced deliberately (dual-write, outbox, or CDC), rebuilt from the source of truth when it drifts. Search is a feature you add to your data, not a second database you must keep perfectly in lockstep.
