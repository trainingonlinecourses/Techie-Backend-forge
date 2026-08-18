---
title: Spring Data MongoDB — Repositories, Queries, and Mapping
module: mongodb-deep
order: 3
minutes: 27
topics: ["Spring Data MongoDB", "MongoRepository", "query methods", "@Document", "MongoTemplate"]
docs:
  - title: "Spring Data MongoDB Reference"
    url: "https://docs.spring.io/spring-data/mongodb/reference/"
  - title: "MongoRepository (Spring API)"
    url: "https://docs.spring.io/spring-data/mongodb/docs/current/api/org/springframework/data/mongodb/repository/MongoRepository.html"
---

# Spring Data MongoDB — Repositories, Queries, and Mapping

## The Concept: JPA-Style Development Against MongoDB

Spring Data MongoDB brings the familiar Spring Data contract to MongoDB: **repositories with derived queries**, entity mapping via annotations, and a `MongoTemplate` for fine-grained control. If you know JPA repositories, you know 80% of this — the framework conventions (interfaces, method-name query derivation, `Page`/`Sort`) are identical; only the underlying model (documents instead of tables) differs.

**The mental model:** your `@Document` class describes the document shape; your repository interface describes the queries; Spring generates the implementations at runtime. `findByEmail(String email)` becomes a `{email: "..."}` query; `findByPriceBetween(a, b)` becomes `{price: {$gte: a, $lt: b}}`. You write intent, not query syntax.

## Setup and First Repository

```xml
<!-- Maven: -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-mongodb</artifactId>
</dependency>
```

```properties
# application.properties — the connection:
spring.data.mongodb.uri=mongodb://localhost:27017/academy
```

```java
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

@Document("products")                    // collection name
public class Product {
    @Id private String id;               // maps to _id (auto ObjectId)
    private String name;
    private double price;
    private boolean inStock;
    private List<String> tags = List.of();

    // getters/setters (or use a record/immutable style with Jackson)
}
```

```java
import org.springframework.data.mongodb.repository.MongoRepository;
import java.util.List;

public interface ProductRepository extends MongoRepository<Product, String> {

    // Derived queries — method name becomes the query:
    List<Product> findByName(String name);
    List<Product> findByPriceLessThan(double max);
    List<Product> findByInStockTrue();
    List<Product> findByTagsContaining(String tag);       // array contains
    List<Product> findByPriceBetween(double min, double max);
    long countByInStockTrue();

    // Sorting and paging are parameters, not name parts:
    List<Product> findByInStockTrueOrderByPriceAsc();
}
```

**Walking through it:** `@Document` declares the collection; `@Id` declares the primary key (Spring fills a generated ObjectId if null). The repository interface inherits `save`, `findById`, `findAll`, `deleteById`, `count` — and every `findBy...` method name compiles into a query. The method-name grammar: property paths (`findByPriceLessThan` → `{price: {$lt: ...}}`), boolean suffixes (`True`/`False`), array operators (`Containing` → `$in`), and ordering suffixes (`OrderByPriceAsc`). Get the property name or type slightly wrong and the app fails at *startup* with a clear parse error — Spring validates these eagerly, which is a feature.

## Query Methods: The Vocabulary

| Method name fragment | MongoDB operator |
|---|---|
| `findByAgeGreaterThan(int)` | `{age: {$gt: x}}` |
| `findByNameIn(List)` | `{name: {$in: [...]}}` |
| `findByNameRegex(String)` | `{name: {$regex: ...}}` |
| `findByTagsContaining(String)` | `{tags: "x"}` (array contains) |
| `findByAddressCity(String)` | nested: `{"address.city": x}` |
| `existsByName(String)` | returns boolean |
| `deleteByName(String)` | delete matching |
| `countByStatus(String)` | count matching |

Nested properties use dot-path names in the method: `findByAddressCity` reads `address.city`. This is where the document model's nesting shows its power — deep field queries are just property paths.

## @Query: When Method Names Aren't Enough

For complex queries, annotate with raw MongoDB query JSON:

```java
public interface ProductRepository extends MongoRepository<Product, String> {

    // Direct MongoDB query document. ?0 = first parameter.
    @Query("{ 'price': { $gte: ?0, $lte: ?1 }, 'inStock': true }")
    List<Product> findInPriceRange(double min, double max);

    // Aggregation pipelines run server-side:
    @Aggregation(pipeline = {
        "{ $match: { inStock: true } }",
        "{ $group: { _id: '$category', total: { $sum: '$price' } } }",
        "{ $sort: { total: -1 } }"
    })
    List<CategoryTotal> totalValueByCategory();
}
```

`@Query` takes a real MongoDB query document with positional parameters (`?0`); `@Aggregation` runs a full pipeline — the same aggregation framework as the shell, from Spring. This is the escape hatch when method names would be unreadable.

## MongoTemplate: The Imperative Alternative

Repositories cover 90% of needs. For ad-hoc operations, updates with operators, and dynamic queries, `MongoTemplate` gives imperative control:

```java
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.*;

@Service
public class InventoryService {
    private final MongoTemplate mongo;

    public InventoryService(MongoTemplate mongo) { this.mongo = mongo; }

    public void decrementStock(String productId, int amount) {
        // Atomic $inc update — no read-modify-write race:
        Query q = Query.query(Criteria.where("_id").is(productId)
                              .and("stock").gte(amount));
        Update u = new Update().inc("stock", -amount);
        mongo.updateFirst(q, u, Product.class);
    }

    public List<Product> search(String keyword, double maxPrice) {
        // Build criteria dynamically:
        Criteria c = Criteria.where("price").lte(maxPrice);
        if (keyword != null && !keyword.isBlank()) {
            c = c.and("name").regex(keyword, "i");   // case-insensitive
        }
        return mongo.find(Query.query(c), Product.class);
    }
}
```

`Query`/`Criteria`/`Update` are the Java face of MongoDB's query and update documents. The `$inc` update is atomic — exactly the concurrency-safe decrement you'd want for stock counters, mirroring the shell operator from the basics lesson.

## Mapping Details Worth Knowing

- **Field name mapping:** `@Field("created_at")` maps a Java field to a different MongoDB name. Underscores in JSON vs camelCase in Java is the classic case.
- **`@Transient`** fields aren't persisted.
- **`@Version Long version`** enables **optimistic locking**: on save, MongoDB checks the version — a concurrent update bumps it, and a stale save throws `OptimisticLockingFailureException`. This is how you get lost-update protection in the document model.
- **`LocalDateTime`/`Instant`** map to BSON dates automatically — the modern Java time types work out of the box.
- **`@Indexed`** creates an index on startup: `@Indexed(unique = true)` on an email field enforces uniqueness at the DB level — the schema discipline the document model otherwise lacks.
- **`@CompoundIndex`** declares multi-field indexes (e.g., `{category: 1, price: -1}`) for query performance.

## Transactions and Consistency

MongoDB supports multi-document transactions (replica sets required). Spring Data integrates them with the same `@Transactional` you know from JPA:

```java
@Transactional
public void placeOrder(String customerId, Order order) {
    orderRepo.save(order);
    customerRepo.incrementOrderCount(customerId);  // atomic together
}
```

Spring maps `@Transactional` onto MongoDB's session-based transactions. Still, the document-model discipline stands: prefer designing for single-document atomicity (embed what must update together), and use transactions for the rare multi-document invariants.

## Recap

Spring Data MongoDB gives JPA-style development on documents: `@Document` classes, `MongoRepository` interfaces with derived query methods (`findByPriceLessThan`, `findByTagsContaining`), `@Query`/`@Aggregation` for complex pipelines, and `MongoTemplate` for imperative atomic operations. The mapping annotations (`@Id`, `@Field`, `@Indexed`, `@Version`) bring the schema discipline the database doesn't enforce, and `@Transactional` bridges multi-document transactions. The skill transfer from JPA is nearly free — the differences (nested property paths, array operators, atomic `$inc` updates, optimistic locking) come from the document model itself. Choose repositories for standard CRUD, `MongoTemplate` for dynamic or atomic operations, and keep modeling around single-document atomicity.
