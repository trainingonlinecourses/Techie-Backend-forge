---
title: Normalization — Designing Tables That Don't Lie
module: database-design
order: 1
minutes: 27
topics: ["normal forms", "1NF", "2NF", "3NF", "data redundancy", "update anomalies"]
docs:
  - title: "Database normalization (Wikipedia)"
    url: "https://en.wikipedia.org/wiki/Database_normalization"
---

# Normalization — Designing Tables That Don't Lie

## The Concept: One Fact, One Place

**Normalization** is the systematic process of organizing tables so that **each fact is stored once** — no redundancy, no contradictions, no accidental data corruption. The rules come in numbered "normal forms" (1NF, 2NF, 3NF...), each removing a specific class of problem.

Why bother? Consider what happens with redundant data:

```sql
-- A denormalized design — the author name is repeated on every course row:
CREATE TABLE courses (
    id INT PRIMARY KEY,
    title TEXT,
    author_name TEXT,      -- repeated for every course by the same author
    author_email TEXT      -- repeated too
);
```

Now imagine the author changes their email. You must update **every row** with that author — miss one, and the database now contains *two different emails for the same person*. That's an **update anomaly**: the data has silently become a lie. Normalization exists to make such lies impossible.

## The Three Normal Forms (The Practical Core)

### 1NF — Atomic Values

Every column holds a single value; no lists or repeated groups:

```sql
-- VIOLATES 1NF: a list in one column
CREATE TABLE courses (
    id INT PRIMARY KEY,
    title TEXT,
    tags TEXT        -- 'java,spring,security' — a list, not atomic!
);
```

**Fix:** a child table (one row per tag) or a proper many-to-many table.

### 2NF — No Partial Dependencies

Every non-key column must depend on the **whole** primary key, not just part of it. Only matters for **composite keys**:

```sql
-- VIOLATES 2NF: composite key (course_id, lesson_id), but lesson_title
-- depends only on lesson_id (part of the key)
CREATE TABLE course_lessons (
    course_id INT,
    lesson_id INT,
    lesson_title TEXT,    -- depends on lesson_id alone → partial dependency
    PRIMARY KEY (course_id, lesson_id)
);
```

**Fix:** split — lessons table holds `lesson_title`; `course_lessons` holds only the association.

### 3NF — No Transitive Dependencies

Non-key columns must not depend on *other non-key* columns:

```sql
-- VIOLATES 3NF: author_email depends on author_name (a non-key column)
CREATE TABLE courses (
    id INT PRIMARY KEY,
    title TEXT,
    author_name TEXT,
    author_email TEXT     -- transitive dependency: email → author_name → id
);
```

**Fix:** an `authors` table — `courses` references `author_id`; the email lives once in `authors`.

## The Code Walkthrough — Normalizing Step by Step

**The bad design (all facts, one table):**

```sql
CREATE TABLE orders_denormalized (
    order_id INT,
    customer_name TEXT,
    customer_city TEXT,        -- repeated per order
    product_name TEXT,         -- repeated per order line
    product_price NUMERIC,     -- repeated per order line
    quantity INT
);
```

Problems: a customer's city repeated on every order (update anomaly); the same product's price repeated on every order line (update anomaly + a price change requires touching history).

**Step 1 — Split customer into its own table (3NF):**

```sql
CREATE TABLE customers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    city TEXT NOT NULL
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    customer_id INT NOT NULL REFERENCES customers(id),
    ordered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Step 2 — Split products into their own table (3NF):**

```sql
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL
);
```

**Step 3 — The association table (2NF/1NF for the many-to-many):**

```sql
CREATE TABLE order_lines (
    order_id INT NOT NULL REFERENCES orders(id),
    product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id)
);
```

Now: the customer's city is stored **once**; the product's price is stored **once**; an order references both by id. Changing a customer's city touches exactly one row. There is no way to store two conflicting facts about the same entity.

## The Query Reward

Normalization also makes queries *easier to write correctly* — the joins are the relationships:

```sql
SELECT c.name, SUM(p.price * ol.quantity) AS total
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN order_lines ol ON ol.order_id = o.id
JOIN products p ON p.id = ol.product_id
GROUP BY c.name;
```

Each table answers one question; the join composes them.

## When to Stop Normalizing

Perfect normalization (up to 3NF/Boyce-Codd) is the *baseline* — most schemas should be 3NF. The later forms (4NF, 5NF) solve exotic edge cases rarely worth the complexity. And sometimes you *deliberately* denormalize for performance — that's the next lesson's topic (denormalization as a conscious trade).

The tension: **joins cost** — a heavily normalized schema means more joins per query. For read-heavy, high-throughput paths, teams store precomputed/duplicated values *deliberately* (a denormalized read model) while keeping the normalized source of truth. The rule: **normalize the source of truth; denormalize the read path — consciously, with synchronization.**

## Common Beginner Pitfalls

1. **"I'll never need to update it"** — every schema eventually gets updates; normalization is insurance.
2. **Composite keys without understanding 2NF** — partial dependencies hide until the data contradicts itself.
3. **Denormalizing "for performance" as a default** — premature; measure first, denormalize the read path, keep the source normalized.
4. **Skipping foreign keys** — normalization without `REFERENCES` is just a naming convention; the DB must enforce it.
5. **Lists-in-columns** (comma-separated tags) — violates 1NF and makes queries miserable; use join tables.
6. **Over-normalizing every column** — splitting one table into ten for a 3-row dataset is ceremony; match the design to the data's real variety.

## Key Takeaways

- Normalization stores each fact once — eliminating update, insert, and delete anomalies.
- 1NF = atomic columns; 2NF = no partial key dependencies; 3NF = no transitive dependencies.
- The fix pattern: split entities into their own tables; reference by foreign key.
- 3NF is the practical baseline for most schemas.
- Joins are the cost of normalization; denormalize deliberately on the read path.
- Enforce relationships with real foreign keys — not just naming.
