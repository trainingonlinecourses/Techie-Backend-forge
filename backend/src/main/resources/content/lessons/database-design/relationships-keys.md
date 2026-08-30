---
title: Relationships and Keys — The Anatomy of a Schema
module: database-design
order: 2
minutes: 25
topics: ["primary keys", "foreign keys", "one-to-many", "many-to-many", "one-to-one", "join tables"]
docs:
  - title: "PostgreSQL keys and constraints"
    url: "https://www.postgresql.org/docs/current/ddl-constraints.html"
summary: A database table is a list of records, but a relational database earns its name from how records refer to each other. Two kinds of keys make this w...
---

# Relationships and Keys — The Anatomy of a Schema

## The Concept: Keys Are the Addresses, Relationships Are the Maps

A database table is a list of records, but a *relational* database earns its name from how records **refer to each other**. Two kinds of keys make this work:

- **Primary key (PK)** — the unique identifier of a row *within its table*. The row's address. Every row must have one; no two rows share it.
- **Foreign key (FK)** — a column in one table that *references the primary key of another table*. The relationship: "this order belongs to customer 7".

Think of a city: every house has a unique address (primary key). A delivery truck's manifest lists addresses of houses to visit (foreign keys). The manifest doesn't *contain* the houses — it references them. That indirection is what makes the system manageable: change a house's owner without reprinting every manifest.

## The Three Relationship Shapes

### 1. One-to-Many (1:N) — the workhorse

One author has many courses; one course has one author:

```sql
CREATE TABLE authors (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    author_id INT NOT NULL REFERENCES authors(id)   -- the "many" side holds the FK
);
```

**Where the FK lives:** the *many* side (courses) holds `author_id`. A course knows its author; the author doesn't track its courses (you query for them).

### 2. Many-to-Many (M:N) — needs a join table

A course has many students; a student takes many courses:

```sql
CREATE TABLE students (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL
);

CREATE TABLE courses ( ... );          -- as before

-- The JOIN TABLE: one row per (student, course) pair
CREATE TABLE enrollments (
    student_id INT NOT NULL REFERENCES students(id),
    course_id  INT NOT NULL REFERENCES courses(id),
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (student_id, course_id)   -- composite PK: no duplicate pairs
);
```

**Why a join table?** A foreign key can only express "belongs to one other row". Many-to-many needs *pairs* — and a pair needs its own table, where the pair (both FKs) is the primary key. Join tables also naturally carry relationship *attributes* (`enrolled_at`, grade, status) — things that belong to the enrollment, not to either side.

### 3. One-to-One (1:1) — rare, but sometimes right

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL
);

CREATE TABLE user_profiles (
    user_id INT PRIMARY KEY REFERENCES users(id),   -- PK = FK: one profile per user
    bio TEXT,
    avatar_url TEXT
);
```

1:1 is used to: split rarely-used columns (faster scans on the hot table), isolate sensitive columns (separate access), or model a genuine exclusive relationship. When both sides are almost always present, just merge the tables — 1:1 should be the exception, not the habit.

## The Code Walkthrough — A Realistic Schema

```sql
-- The academy's domain, designed with proper keys and relationships:

CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,               -- business-unique identifier
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE modules (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    "order" INT NOT NULL
);

CREATE TABLE lessons (
    id BIGSERIAL PRIMARY KEY,
    module_id BIGINT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    minutes INT NOT NULL DEFAULT 15,
    UNIQUE (module_id, title)                 -- a module has distinct lesson titles
);

CREATE TABLE progress (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, lesson_id)          -- one progress row per (user, lesson)
);

-- Index the FKs you query on (details in the PostgreSQL module):
CREATE INDEX idx_lessons_module ON lessons(module_id);
CREATE INDEX idx_progress_user ON progress(user_id);
```

### Walking Through Each Part

**`BIGSERIAL PRIMARY KEY`** — a surrogate key: an auto-incrementing number with no business meaning. It's stable (never changes), compact, and perfect as a FK target. **Business identifiers** (`email UNIQUE`) are enforced *separately* with a `UNIQUE` constraint — because emails change, but the id must not.

**`ON DELETE CASCADE`** — the delete policy: deleting a module deletes its lessons; deleting a user deletes their progress. Chosen per relationship — cascades are convenient but dangerous (a misconfigured cascade deletes half your database); use `RESTRICT`/`SET NULL` where the child must survive.

**The composite PK on `progress`** — `(user_id, lesson_id)` enforces the invariant *"one progress row per pair"* at the database level. No application logic can create duplicates.

**The `UNIQUE (module_id, title)`** — a composite uniqueness rule: within a module, titles are distinct. This is a *business rule* enforced by the schema — the database refuses to store nonsense.

## Keys, Indexes, and Performance

The database automatically indexes primary keys and unique constraints — lookups by them are fast. **Foreign keys are NOT automatically indexed** — a join on `lesson.module_id` scans the table unless you create the index (the `CREATE INDEX` lines above). Rule: **index every FK you join or filter on.**

## Common Beginner Pitfalls

1. **Foreign keys without `REFERENCES`** — the DB won't enforce the relationship; orphaned rows accumulate silently.
2. **No `ON DELETE` policy** — either cascades surprise you or deletes fail mysteriously; decide per relationship.
3. **Business values as FKs** — referencing `email` instead of `id` breaks when the email changes; always FK to the surrogate id.
4. **Many-to-many without a join table** — comma-separated ids in a column (1NF violation + unqueryable).
5. **1:1 everywhere** — two tables that are always joined together should be one table; 1:1 is for genuine separation.
6. **Forgetting FK indexes** — correct joins that are slow; index the FK columns.
7. **Composite PKs on the wrong pairs** — the PK must reflect *actual* uniqueness; adding a meaningless column to a PK makes duplicates possible.

## Key Takeaways

- PK = the row's address; FK = the reference to another table's row.
- One-to-many: FK on the many side. Many-to-many: a join table with a composite PK. One-to-one: PK = FK (rare).
- Join tables carry relationship attributes (`enrolled_at`) and enforce pair uniqueness.
- Use surrogate ids for FKs; enforce business uniqueness with `UNIQUE` constraints.
- Choose `ON DELETE` policies per relationship; cascade deliberately.
- Index FK columns you join/filter on.
