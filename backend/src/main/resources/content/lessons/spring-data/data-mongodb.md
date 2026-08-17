---
title: Spring Data MongoDB
summary: Documents, collections and the MongoRepository — embedding vs. referencing, @Document mapping, GeoJSON, aggregations and the schema-flexibility trade-off.
order: 4
minutes: 15
topics: [mongodb, mongorepository, document model, aggregation pipeline, embedding]
docs:
  - https://docs.spring.io/spring-data/mongodb/reference/
  - https://www.mongodb.com/docs/manual/
---

# Spring Data MongoDB

## The document model

MongoDB stores **BSON documents** in collections — no fixed schema, no joins. The entire mindset shift from SQL: you model *documents as you read them*, and you decide up front whether data lives **inside** a document (embedded) or **in another collection** (referenced).

```java
@Document(collection = "products")
public class Product {
    @Id String id;
    String sku;
    String name;
    BigDecimal price;
    @Indexed String category;          // index for the queries you actually run
    Instant createdAt = Instant.now();
}

public interface ProductRepository extends MongoRepository<Product, String> {
    List<Product> findByCategoryOrderByPriceDesc(String category);  // derived query works
    Page<Product> findByPriceBetween(BigDecimal min, BigDecimal max, Pageable pageable);
}
```

## Embed vs. reference — the decision that matters

| Situation | Model |
|---|---|
| Child lives and dies with the parent, read together | **Embed** (order lines in an order) |
| Child is large, shared, or queried independently | **Reference** (user in an order → store `userId`) |
| Child grows unboundedly | **Reference or a separate collection** (audit events, messages) |

The 16 MB document limit is the hard backstop: an unbounded embedded list is a time bomb. Mongo has no joins — referencing means **your application resolves the reference** (or you store a denormalized copy and keep it in sync), which is why embed-first is the Mongo idiom.

## Mapping and indexes

- `@Id` → `_id`; field names map to property names unless `@Field("legacy_name")` overrides.
- `@Indexed` / `@CompoundIndex` create indexes at startup; **index what you query, or the queries full-scan**. Check the execution plan with `.explain("executionStats")` when a query is slow.
- `@TextIndexed` enables `$text` search; `@GeoJsonPoint` + `@GeoSpatialIndexed` enable geospatial queries (find places within N km — the classic Mongo strength).

## The aggregation pipeline

For anything beyond simple queries, the aggregation pipeline (`$match → $group → $sort → $limit`) is Mongo's answer to GROUP BY:

```java
Aggregation agg = Aggregation.newAggregation(
    Aggregation.match(Criteria.where("status").is("COMPLETED")),
    Aggregation.group("customerId").sum("amount").as("total"),
    Aggregation.sort(Sort.by(Direction.DESC, "total")),
    Aggregation.limit(10));

AggregationResults<CustomerTotal> results =
    mongoTemplate.aggregate(agg, "orders", CustomerTotal.class);
```

`MongoTemplate` is the escape hatch for pipeline queries, `$lookup` (the closest thing to a join), `$unwind`, and raw updates — when repository methods aren't enough.

## Transactions (yes, Mongo has them)

Multi-document transactions work on replica sets (and `mongod` standalone since 4.0 in limited form):

```java
@Transactional
public void moveStock(Product p, int qty) {
    productRepo.save(p.decrement(qty));      // two documents, one transaction
    stockRepo.record(p.getId(), qty);
}
```

Spring Data Mongo honors `@Transactional` when the connection is configured with transactions enabled. The catch: transactions are single-node by default and have overhead — use them for genuine multi-document invariants, not for every write.

## Schema flexibility: asset and liability

The selling point is no-migration schema evolution (add a field, old docs just lack it). The discipline it demands:

- **Validate at the boundary** — Bean Validation (the Spring Core lesson) on your `@Document` DTOs; the DB won't reject anything.
- **Version your mapping** — `@Version` optimistic locking for concurrent updates; a `schemaVersion` field for format changes.
- **Never trust old documents** — write migrations (a startup runner that reads/re-writes legacy shapes) when semantics change.

## When Mongo beats Postgres (and when it doesn't)

- **Mongo wins**: document-shaped reads (a product with nested variants, a profile with arbitrary metadata), geo queries, high-write telemetry, schema that evolves weekly.
- **Postgres wins**: relational integrity, transactions across aggregates, ad-hoc reporting joins, strict schemas. The `jsonb` column blurs the line — many "document" needs are met by Postgres `jsonb` + indexes without a second system. Choose by the shape of your reads and the strength of your invariants.

## Key takeaways

- Model embed-first, reference by need; the 16 MB document cap bounds embedded growth.
- `MongoRepository` + derived queries + `@Indexed` cover the basics; `MongoTemplate` + Aggregation cover the rest.
- `@Transactional` works but costs — reserve for real multi-document invariants.
- No schema means validate at the boundary and version your documents.

Official docs: [Spring Data MongoDB](https://docs.spring.io/spring-data/mongodb/reference/) · [MongoDB Manual](https://www.mongodb.com/docs/manual/)
