---
title: Document Modeling — Embedding vs Referencing
module: mongodb-deep
order: 2
minutes: 28
topics: ["data modeling", "embedding", "referencing", "one-to-many", "design patterns"]
docs:
  - title: "Data Modeling Introduction (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/core/data-modeling-introduction/"
  - title: "Model One-to-Many Relationships (MongoDB Manual)"
    url: "https://www.mongodb.com/docs/manual/tutorial/model-referenced-one-to-many-relationships-between-documents/"
---

# Document Modeling — Embedding vs Referencing

## The Concept: Where Do Related Things Live?

The document model's core design decision: when a customer has orders, do the orders live *inside* the customer document (**embedding**) or in their own documents pointing back at the customer (**referencing**)? There is no "always do X" answer — the choice follows from how your application *reads and writes* the data. Get it right and your queries are one read; get it wrong and you're either shipping enormous documents or doing manual joins.

**The mental model:** embedding is carrying your wallet with cash and cards inside it — everything you need on one trip, one object. Referencing is a checkbook with a registry — each check references an account elsewhere; the book stays thin, but cashing a check means going to the bank (a second read). The question is always: *do you typically need the related data together, and how big is it?*

## The Three Relationship Shapes

**One-to-one (embed):** a user and their profile. Always read together, always written together, small. Embed:

```json
{ "_id": "...", "name": "Ada",
  "profile": { "bio": "...", "avatar": "url", "preferences": { "theme": "dark" } } }
```

**One-to-many (usually reference):** a customer and their orders. If orders were embedded, the customer document would grow unboundedly as orders accumulate — every read of the customer (even "show name") ships every order. Reference:

```json
// customer doc:
{ "_id": "c1", "name": "Ada" }
// order docs (separate collection), referencing the customer:
{ "_id": "o1", "customerId": "c1", "total": 99.5, "items": [...] }
{ "_id": "o2", "customerId": "c1", "total": 12.0, "items": [...] }
```

**Many-to-many (reference both ways):** books and authors. Reference — each book holds author ids (or each author holds book ids):

```json
{ "_id": "b1", "title": "...", "authorIds": ["a1", "a2"] }
```

## The Decision Rules

The MongoDB docs offer a concrete test: **ask "one" and "many" and "Frequently" — three questions:**

1. **"One"** — will I need the embedded entity *by itself*? (If yes, embedding duplicates it everywhere it's used — bad.)
2. **"Many"** — how many of the "many" side exist per "one"? If it's unbounded (orders, log entries, messages) — reference. If it's a small fixed set (addresses, phone numbers) — embed.
3. **"Frequently"** — do I read the related data *together* with the parent, frequently? If yes, embedding saves a read and a join. If the related data is read independently (reporting on orders without touching customers) — reference.

Plus two more hard rules:

- **Atomicity follows the document.** If two things must update atomically together, they belong in one document. If you `updateOne` on an order and `updateOne` on a customer separately, they're two independent operations — a crash between them leaves inconsistency (unless you use a transaction).
- **Document size has a practical ceiling** (16MB hard limit, and large docs are slow to ship). Unbounded arrays belong in their own collections.

## The Classic Patterns

**Pattern A — Embedding with bounded arrays (the sweet spot):**

```json
{ "_id": "...", "title": "Spring Data MongoDB",
  "tags": ["spring", "nosql"],              // bounded: fine to embed
  "reviews": [                              // bounded by a review cap
    { "user": "u1", "rating": 5, "text": "Great" }
  ] }
```

**Pattern B — Referencing with denormalized copies (the performance pattern):** when you read a list that must *show* related data, embed a small *copy* of the referenced fields, and keep the authoritative copy elsewhere:

```json
{ "_id": "o1", "customerId": "c1",
  "customerName": "Ada",            // denormalized copy — for display only
  "total": 99.5 }
```

The trade-off is explicit: reads become single-document (fast), but the copy can go stale if the customer renames. The rule: **denormalize for display, normalize for integrity.** Update the copy only when the change is user-visible (rename) and tolerate eventual consistency; never denormalize data that must be exact (prices, balances).

**Pattern C — Two-way referencing with application-side joins:** store ids on both sides (`customer.orderIds` and `order.customerId`) when you need both directions. MongoDB's aggregation framework (`$lookup`) performs server-side joins across collections — the escape hatch when referencing needs a join after all:

```js
db.orders.aggregate([
  { $match: { customerId: "c1" } },
  { $lookup: { from: "products", localField: "productId",
               foreignField: "_id", as: "product" } }
]);
```

## The Anti-Patterns

1. **Unbounded arrays embedded in the parent** — a `comments` array on a post that grows forever; every post read ships all comments.
2. **Deeply nested documents** — more than ~2 levels get painful to query and update (`$` positional operators lose steam).
3. **Denormalizing mutable, integrity-critical data** — stale prices, stale balances.
4. **Modeling with joins in mind** — if you find yourself reaching for `$lookup` constantly, you've recreated a relational schema inside MongoDB; consider whether the data is actually relational.
5. **Ignoring access patterns** — modeling for "the schema" instead of "the queries I actually run."

## The Engineering Discipline

Document modeling is *application-driven*: you design for the reads and writes your app performs, not for a normalized ideal. The practical workflow:

1. List the app's read paths (what screens/data do users fetch?) and write paths (what updates happen, how often?).
2. For each relationship, apply the one/many/frequently test.
3. Verify document sizes stay bounded.
4. Check atomicity boundaries — what must update together?
5. Optimize for the *hot* reads even at the cost of denormalization — the copy is the price of a fast read.

## Recap

The document model's central design choice is embed vs reference. Embed when related data is small, bounded, and always read/written with its parent; reference when the "many" side is unbounded or independently queried. Denormalize small copies for display-only fields to make reads single-document, but never denormalize integrity-critical data. Remember the two laws: **atomicity follows the document** (update-together data lives together) and **documents have practical size limits** (unbounded arrays belong elsewhere). Model from your access patterns, and the MongoDB design — often derided as "schema-less chaos" — becomes as deliberate as any relational design, just with different trade-offs.
