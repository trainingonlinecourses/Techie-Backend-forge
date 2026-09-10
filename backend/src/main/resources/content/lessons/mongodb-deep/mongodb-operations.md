---
title: MongoDB Operations — CRUD, Aggregation, and Indexing
summary: Spring Data MongoDB operations — insert, find, update, aggregate pipelines, indexing strategies, and how organizations use MongoDB for document-oriented data. Beginner-friendly with line-by-line code.
order: 4
minutes: 22
topics: [MongoDB, MongoTemplate, MongoRepository, aggregation, indexing, document model, embedding, referencing]
docs:
  - https://docs.spring.io/spring-data/mongodb/docs/current/reference/html/
  - https://www.mongodb.com/docs/manual/crud/
---

# MongoDB Operations — CRUD, Aggregation, and Indexing

## What is MongoDB? (From Zero)

MongoDB is a **document database** — instead of rows and columns (like SQL), it stores JSON-like documents. Each document can have different fields, nested objects, and arrays. This makes it perfect for data that doesn't fit neatly into tables.

### SQL vs MongoDB

| SQL Concept | MongoDB Equivalent |
|---|---|
| Database | Database |
| Table | Collection |
| Row | Document |
| Column | Field |
| JOIN | Embedded document or lookup |
| Index | Index |

```json
// A MongoDB document (stored as BSON — binary JSON):
{
  "_id": "order-123",
  "customer": {
    "name": "Alice",
    "email": "alice@example.com"
  },
  "items": [
    {"product": "Laptop", "quantity": 1, "price": 999.99},
    {"product": "Mouse", "quantity": 2, "price": 29.99}
  ],
  "status": "PAID",
  "total": 1059.97,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

---

## The Code — Line by Line

### 1. MongoDB Entity (Document)


**What this code does — step by step:**

1. `@Document(collection = "orders")` — Maps to the "orders" collection
2. `@Id` — Maps to the "_id" field
3. `@Field("customer_name")` — Custom field name in MongoDB
4. `@Embedded` — Nested object (embedded in the document)
5. `private List<OrderItem> items;` — Array of embedded documents
6. `@Indexed` — Create an index on this field
7. `@Version` — Optimistic locking

The same code, clean:

```java
@Document(collection = "orders")
public class Order {

    @Id
    private String id;

    @Field("customer_name")
    private String customerName;

    @Embedded
    private Address shippingAddress;

    private List<OrderItem> items;

    @Indexed
    private String status;

    @CreatedDate
    private Instant createdAt;

    @Version
    private Long version;
}
```

### 2. MongoRepository (Simple CRUD)

@Repository
public interface OrderRepository extends MongoRepository<Order, String> {

    // Method name queries (same as Spring Data JPA):
    List<Order> findByStatus(String status);
    Optional<Order> findByCustomerName(String name);
    List<Order> findByStatusAndTotalGreaterThan(String status, double minTotal);
    List<Order> findByItemsProductId(String productId);     // Query nested array
    Page<Order> findByStatus(String status, Pageable pageable);

    // @Query with MongoDB query syntax:
    @Query("{ 'status': ?0, 'total': { $gte: ?1 } }")
    List<Order> findHighValueOrders(String status, double minTotal);

    // Aggregation:
    @Aggregation(pipeline = {
        "{ $match: { status: ?0 } }",
        "{ $group: { _id: '$customerName', total: { $sum: '$total' } } }",
        "{ $sort: { total: -1 } }"
    })
    List<Document> getTopCustomersByStatus(String status);
}

**Line-by-line explained:**
- `@Document(collection = "orders")` — This entity maps to the "orders" collection in MongoDB.
- `@Id private String id` — MongoDB uses `_id` as the primary key. Spring Data auto-generates if null.
- `@Indexed private String status` — Creates a MongoDB index on the "status" field for fast queries.
- `findByItemsProductId` — Queries into the nested `items` array. Spring Data handles the MongoDB query generation.
- `@Query("{ 'status': ?0 }")` — Raw MongoDB query syntax (not JPQL). Use when method names aren't expressive enough.

### 3. MongoTemplate (Advanced Operations)


**What this code does — step by step:**

1. Find with complex criteria:
2. `.regex(criteria.getCustomerName(), "i"));` — Case-insensitive regex
3. `query.limit(20);` — Max 20 results
4. Update specific fields (partial update):
5. `.set("status", newStatus)` — Set the status field
6. `.set("updatedAt", Instant.now());` — Set the timestamp
7. Upsert (insert or update):
8. Aggregation pipeline:
9. `Aggregation.limit(30)` — Last 30 days

The same code, clean:

```java
@Service
public class OrderMongoService {

    private final MongoTemplate mongoTemplate;

    public List<Order> findOrders(OrderSearchCriteria criteria) {
        Query query = new Query();

        if (criteria.getStatus() != null) {
            query.addCriteria(Criteria.where("status").is(criteria.getStatus()));
        }
        if (criteria.getMinTotal() != null) {
            query.addCriteria(Criteria.where("total").gte(criteria.getMinTotal()));
        }
        if (criteria.getCustomerName() != null) {
            query.addCriteria(Criteria.where("customerName")
                .regex(criteria.getCustomerName(), "i"));
        }

        query.with(Sort.by(Sort.Direction.DESC, "createdAt"));
        query.limit(20);

        return mongoTemplate.find(query, Order.class);
    }

    public void updateOrderStatus(String orderId, String newStatus) {
        Query query = Query.query(Criteria.where("_id").is(orderId));
        Update update = new Update()
            .set("status", newStatus)
            .set("updatedAt", Instant.now());

        mongoTemplate.updateFirst(query, update, Order.class);
    }

    public void upsertOrder(Order order) {
        Query query = Query.query(Criteria.where("_id").is(order.getId()));
        mongoTemplate.upsert(query, order, Order.class);
    }

    public List<Document> getRevenueByDay() {
        Aggregation aggregation = Aggregation.newAggregation(
            Aggregation.match(Criteria.where("status").is("PAID")),
            Aggregation.group("createdAt")
                .sum("total").as("dailyRevenue")
                .count().as("orderCount"),
            Aggregation.sort(Sort.Direction.ASC, "_id"),
            Aggregation.limit(30)
        );

        return mongoTemplate.aggregate(aggregation, "orders", Document.class)
            .getMappedResults();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: E-Commerce Product Catalog


**What this code does — step by step:**

1. `private List<String> tags;` — Array of strings
2. `private Map<String, Object> attributes;` — Dynamic attributes (color, size, weight)
3. `private List<Review> reviews;` — Embedded reviews
4. Query: find products by tag (uses multikey index):
5. Query: find products by dynamic attribute:

The same code, clean:

```java
@Document(collection = "products")
public class Product {
    @Id
    private String id;
    private String name;
    private String description;
    private double price;
    private String category;
    private List<String> tags;
    private Map<String, Object> attributes;
    private List<Review> reviews;
    private int stockQuantity;
}

List<Product> products = productRepository.findByTagsContaining("laptop");

Query query = Query.query(Criteria.where("attributes.color").is("black")
    .and("attributes.weight").lte(2.0));
```

### Scenario 2: Logging/Analytics (Time Series)

@Document(collection = "events")
@Indexed(name = "timestamp_idx", direction = IndexDirection.DESCENDING)
public class AnalyticsEvent {
    @Id
    private String id;
    private String eventType;
    private String userId;
    private Map<String, Object> properties;
    private Instant timestamp;
}

// Find events in the last 24 hours:
Query query = Query.query(
    Criteria.where("timestamp").gte(Instant.now().minus(Duration.ofHours(24)))
);
query.with(Sort.by(Sort.Direction.DESC, "timestamp"));
query.limit(1000);

### Scenario 3: Chat Messages (Embedded vs Referenced)


**What this code does — step by step:**

1. EMBEDDED (denormalized): messages inside the conversation
2. `private List<Message> messages;` — Embedded — fast to read
3. REFERENCED (normalized): messages in separate collection
4. `private String conversationId;` — Reference to parent
5. When to use which: Embedded: messages are always loaded with the conversation (< 16MB total). Referenced: messages are loaded independently, or conversation has > 100K messages

The same code, clean:

```java
@Document(collection = "conversations")
public class Conversation {
    @Id
    private String id;
    private String title;
    private List<Message> messages;
}

@Document(collection = "messages")
public class Message {
    @Id
    private String id;
    private String conversationId;
    private String sender;
    private String content;
    private Instant timestamp;
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| No indexes on query fields | Full collection scan on every query | Add `@Indexed` on frequently queried fields |
| Embedding too much data | Documents exceed 16MB limit | Reference large collections instead of embedding |
| Using MongoDB like a relational DB | Missing the document model benefits | Design around access patterns, not normalization |
| Not monitoring slow queries | Performance degrades silently | Enable MongoDB profiler, review slow queries |
| Ignoring connection pool size | Thread starvation under load | Configure `spring.data.mongodb.max-connection-pool-size` |

---

## Key Takeaways

- **MongoDB stores documents** (JSON-like) — not rows. Design around your access patterns.
- **MongoRepository** gives you Spring Data's method-name queries for free.
- **MongoTemplate** for complex queries, partial updates, and aggregation pipelines.
- **Index everything you query by** — MongoDB does full collection scans without indexes.
- **Embed vs Reference**: embed for 1:1 and 1:few relationships. Reference for 1:many and many:many.

Official docs: [Spring Data MongoDB](https://docs.spring.io/spring-data/mongodb/docs/current/reference/html/) · [MongoDB CRUD](https://www.mongodb.com/docs/manual/crud/)

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [mongodb.com/docs/manual](https://www.mongodb.com/docs/manual/)
