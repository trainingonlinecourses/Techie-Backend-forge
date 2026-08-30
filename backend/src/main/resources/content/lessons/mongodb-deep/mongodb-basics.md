---
title: MongoDB Basics — Documents, Collections, and the Document Model
module: mongodb-deep
order: 1
minutes: 25
topics: ["MongoDB", "documents", "collections", "BSON", "NoSQL", "document model"]
summary: For decades, the relational model was the only game in town: tables, rows, columns, and joins enforced by rigid schemas. MongoDB is the most popula...
docs:
  - title: "MongoDB Manual — Core Concepts"
    url: "https://www.mongodb.com/docs/manual/core/document/"
  - title: "Introduction to MongoDB (MongoDB University)"
    url: "https://learn.mongodb.com/"
---

# MongoDB Basics — Documents, Collections, and the Document Model

## The Concept: Rows Become Documents

For decades, the relational model was the only game in town: tables, rows, columns, and joins enforced by rigid schemas. **MongoDB** is the most popular *document database*: instead of a table of uniform rows, you store **documents** — self-contained JSON-like objects — in **collections**. Each document can have its own shape; there are no tables to `ALTER`, no columns to declare, and related data lives *inside* the document rather than in a joined table.

**The mental model:** a relational database is a set of spreadsheets with fixed columns — every row in "customers" must have the same fields, and related data (orders) lives in another spreadsheet linked by foreign keys. MongoDB is a filing cabinet of *folders*: each folder is a document describing one thing completely — a customer *with their orders nested inside*. You don't join; you open the folder.

**Why does this matter?** For data that is naturally hierarchical and read as a whole (a user profile with addresses and preferences, a product with variants and reviews, a blog post with comments), the document model matches the *application's* object shape directly: the JSON you store is the object you use. No ORM mapping, no join queries, no schema migrations for adding a field.

## Documents: JSON, But Richer

A MongoDB document is **BSON** — Binary JSON — a superset of JSON. What you write looks exactly like JSON:

```json
{
  "_id": "65f1c2a9d4c0a1b2c3d4e5f6",
  "title": "Spring Data MongoDB",
  "author": { "name": "Ada Lovelace", "email": "ada@example.com" },
  "tags": ["spring", "mongodb", "nosql"],
  "views": 1200,
  "published": true,
  "createdAt": "2025-01-15T10:30:00Z",
  "rating": 4.8
}
```

**The differences from relational thinking:**

- **`_id` is mandatory and unique** — the primary key. MongoDB generates an ObjectId (timestamp + machine + counter encoded in 12 bytes) automatically if you don't supply one; you can also use natural keys (email, order number).
- **Field names are part of the data.** `author.name` is a *nested document*; `tags` is an *array*; no normalization needed.
- **Types are rich:** dates, ObjectIds, embedded docs, arrays, even binary and decimal128.
- **The document is the unit of atomicity.** Operations on one document are atomic — which changes how you design transactions (more on that in the transactions lesson).

## Collections and the Schema-Free Question

A **collection** groups documents — conceptually like a table, but with no enforced shape:

```js
// Inserting three different-shaped documents into ONE collection:
db.products.insertOne({ name: "Laptop", price: 999 });
db.products.insertOne({ name: "Mouse", price: 25, color: "black" });
db.products.insertOne({ name: "Warranty", price: 0, kind: "service" });
```

All three live in `products` happily. This is the flexibility — but the industry's hard-won lesson is: **schema-free ≠ schema-less**. Production MongoDB projects define and enforce schemas at the application layer, using:

- **Document validation rules** (`$jsonSchema`) at the collection level — MongoDB *can* enforce shape if you ask it to.
- **Mongoose/Spring Data validators** — `@Document` classes in Spring enforce structure in code.
- **Conventions and migration scripts** — since there's no `ALTER TABLE`, evolving a field means handling both old and new shapes in application code.

The right mental model: the *database* doesn't enforce the schema, so *you* (or your framework) must — deliberately, not by accident.

## CRUD From the Shell

The `mongosh` shell is the direct way to learn MongoDB:

```js
// CREATE — insertOne/insertMany:
db.products.insertOne({ name: "Keyboard", price: 89, inStock: true });

// READ — find returns a cursor of matching docs:
db.products.find({ price: { $lt: 100 } });
db.products.find({ tags: "spring" });          // matches arrays containing it
db.products.findOne({ name: "Keyboard" });     // first match

// UPDATE — updateOne/updateMany with $set:
db.products.updateOne(
  { name: "Keyboard" },
  { $set: { price: 79 }, $inc: { reviews: 1 } }
);

// DELETE:
db.products.deleteOne({ name: "Keyboard" });

// Projection — shape the output:
db.products.find({}, { name: 1, price: 1 });   // only name and price
```

**The operator vocabulary is worth learning because it maps 1:1 to Spring Data:** `$lt`/`$gt` (comparisons), `$in`/`$nin` (membership), `$set`/`$inc`/`$push` (update operators — `$push` appends to arrays, `$inc` atomically increments), `$exists` (field presence). These are the building blocks of every query language on top of MongoDB.

## When MongoDB Fits (and When It Doesn't)

**Fits well:**
- Hierarchical, self-contained data read as a whole — profiles, catalogs, content, IoT telemetry.
- Flexible or evolving schemas — early-stage products, per-tenant customization.
- High write throughput with horizontal scaling (sharding is native).
- Data that maps naturally to JSON (web/mobile backends).

**Fits poorly:**
- Highly relational, join-heavy data (accounting, complex financial graphs) — the document model fights you.
- Strict, long-lived schemas with frequent cross-entity queries — relational wins on consistency and query flexibility.
- Multi-document transactional integrity as the *norm* — MongoDB supports transactions (4.0+) but the model encourages single-document atomicity.

The practical pattern: **many systems run both** — Postgres for relational core data, MongoDB for the document-shaped parts (catalogs, sessions, logs, content). Choose per dataset, not per religion.

## Spring Data MongoDB: The First Glimpse

```java
@Document("products")               // this class maps to the products collection
public record Product(
        @Id String id,              // maps to _id
        String name,
        double price,
        boolean inStock) {}

// Repository — Spring generates the implementation:
public interface ProductRepository extends MongoRepository<Product, String> {
    List<Product> findByPriceLessThan(double maxPrice);
    List<Product> findByInStockTrue();
}
```

`MongoRepository` gives you `save`, `findById`, `findAll`, `deleteById` out of the box, and method names like `findByPriceLessThan` generate queries automatically — the same derived-query magic as JPA, against MongoDB. `@Document` maps the class; `@Id` maps to `_id`. That's the whole onboarding: a repository interface, and CRUD works.

## Recap

MongoDB is a document database: self-contained BSON documents in collections, with `_id` keys, rich types, nested structures, and no enforced table schema. The document model shines for hierarchical, object-shaped data read as a whole — and demands schema discipline from the application layer since the DB won't enforce it. The CRUD vocabulary (`find`, `$set`, `$push`, `$lt`) maps directly onto Spring Data MongoDB's repositories and query methods. Choose it for the datasets that are naturally documents; keep relational databases for the join-heavy, integrity-critical core. And remember the design principle that shapes everything else in this module: **the document is the unit of atomicity** — model data so that what you update together lives together.
