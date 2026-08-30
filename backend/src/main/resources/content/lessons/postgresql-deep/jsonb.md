---
title: JSONB: Documents in Postgres
module: postgresql-deep
order: 4
minutes: 25
topics: ["jsonb", "document queries", "GIN indexes", "jsonb operators", "hybrid relational-document"]
docs:
  - title: "PostgreSQL JSON types"
    url: "https://www.postgresql.org/docs/current/datatype-json.html"
summary: Postgres's jsonb type gives you documentdatabase capabilities inside a relational database: store arbitrary JSON, query into it, index it. The resu...
---

# JSONB: Documents in Postgres

Postgres's `jsonb` type gives you document-database capabilities inside a relational database: store arbitrary JSON, query into it, index it. The result is a **hybrid model** — strict relational tables where you need integrity, JSONB documents where the schema is flexible. This is how modern Postgres replaced the "MongoDB or Postgres?" question with "both."

## json vs jsonb

| | json | jsonb |
|--|------|-------|
| Storage | Text, keeps whitespace/order | Binary, normalized |
| Speed | Slow to process | Fast (no re-parse) |
| Indexing | ❌ | ✅ (GIN) |
| Duplicate keys | Keeps all | Last wins |
| Use | Logs / raw payloads | **Everything else** |

**Always use jsonb** for real work.

## Modeling: When to Use JSONB

```sql
-- Relational: when you query by the field
CREATE TABLE courses (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    level TEXT NOT NULL
);

-- JSONB: flexible, rarely-filtered attributes
CREATE TABLE course_metadata (
    course_id BIGINT PRIMARY KEY REFERENCES courses(id),
    attributes JSONB NOT NULL DEFAULT '{}'
);
```

**The decision**:
- Field is queried, filtered, joined → **column**
- Field is variable, nested, rarely filtered → **jsonb**
- The classic case: audit trails, feature configs, vendor payloads, dynamic forms

## Writing JSONB

```java
@Entity
public class CourseMetadata {

    @Id private Long courseId;

    @JdbcTypeCode(SqlTypes.JSON)          // Hibernate 6+ maps String ↔ jsonb
    private String attributes;            // JSON text in the entity
}
```

```sql
INSERT INTO course_metadata (course_id, attributes)
VALUES (1, '{"tags": ["java", "spring"], "rating": 4.8, "instructor": {"name": "Ada"}}');
```

## Querying Into JSONB

The operators:

| Operator | Meaning | Example |
|----------|---------|---------|
| `->` | Get JSON (object/array) | `attributes->'rating'` |
| `->>` | Get as text | `attributes->>'rating'` → `'4.8'` |
| `#>` / `#>>` | Path access | `attributes#>>'{instructor,name}'` |
| `@>` | Contains (JSON) | `attributes @> '{"tags":["java"]}'` |
| `?` | Key exists | `attributes ? 'rating'` |
| `?|` / `?&` | Any / all keys exist | `attributes ?| array['a','b']` |
| `||` | Concatenate | `attributes || '{"new":"1"}'` |

```sql
-- Courses rated 4.5+
SELECT course_id FROM course_metadata
WHERE (attributes->>'rating')::numeric >= 4.5;

-- Has the java tag
SELECT course_id FROM course_metadata
WHERE attributes @> '{"tags": ["java"]}';

-- Instructor name
SELECT attributes#>>'{instructor,name}' AS instructor
FROM course_metadata;
```

In Spring Data JPA:

```java
@Query(value = """
    SELECT course_id FROM course_metadata
    WHERE attributes @> CAST(:filter AS jsonb)
    """, nativeQuery = true)
List<Long> findByAttribute(@Param("filter") String jsonFilter);
```

## Indexing JSONB: GIN

Queries into jsonb are slow without an index — the `@>` and `?` operators need a **GIN index**:

```sql
-- General: index every key/value
CREATE INDEX idx_metadata_gin ON course_metadata USING GIN (attributes);

-- Targeted: index one path (smaller, faster)
CREATE INDEX idx_metadata_tags ON course_metadata
USING GIN ((attributes -> 'tags'));

-- Expression index for a scalar value
CREATE INDEX idx_metadata_rating ON course_metadata
USING GIN ((attributes -> 'rating'));
```

GIN (Generalized Inverted Index) is designed exactly for containment/array queries — it's what makes `@>` fast.

## Updating JSONB

```sql
-- Add a key
UPDATE course_metadata
SET attributes = attributes || '{"audited": true}'
WHERE course_id = 1;

-- Remove a key (jsonb - text)
UPDATE course_metadata
SET attributes = attributes - 'legacy_field'
WHERE course_id = 1;

-- Set a nested path (jsonb_set)
UPDATE course_metadata
SET attributes = jsonb_set(attributes, '{instructor,name}', '"Grace"')
WHERE course_id = 1;
```

## The Hybrid Model in Practice

The winning pattern — strict rows + JSONB extras:

```java
@Entity
public class Course {

    @Id private Long id;
    private String title;               // relational: queried, indexed
    private String level;               // relational: filtered

    @JdbcTypeCode(SqlTypes.JSON)
    private String metadata;            // jsonb: flexible extras
}
```

```sql
-- Hybrid query: indexed column + jsonb filter
SELECT * FROM courses
WHERE level = 'BEGINNER'
  AND metadata @> '{"hasCertificate": true}';
```

Index `level` (btree) for the column filter and `metadata` (GIN) for the JSON filter — both fast, one query.

## JSONB vs. a Document Store

| | Postgres jsonb | MongoDB |
|--|----------------|---------|
| Consistency | ACID with the rest of the data | Weaker by default |
| Transactions | Full SQL + jsonb together | Multi-doc transactions newer |
| Joins | Relational + JSON | Aggregation pipeline |
| Query language | SQL (+ jsonb ops) | Mongo query |
| When | JSON is a *part* of your data | JSON is *all* of your data |

Use Postgres jsonb when JSON is one attribute among relational data. Use a real document store when everything is documents and you need its scaling/ops story.

## Testing JSONB Queries

```java
@DataJpaTest
@Testcontainers
class JsonbTest {

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void findsByNestedAttribute() {
        jdbcTemplate.update("""
            INSERT INTO course_metadata (course_id, attributes)
            VALUES (1, '{"tags":["java"],"rating":4.8}')
            """);

        List<Long> ids = jdbcTemplate.query("""
            SELECT course_id FROM course_metadata
            WHERE attributes @> '{"tags":["java"]}'
            """, (rs, n) -> rs.getLong("course_id"));

        assertEquals(List.of(1L), ids);
    }
}
```

## Summary

| Concern | Answer |
|---------|--------|
| Type | `jsonb` (never plain json) |
| Model | Column for queried fields; jsonb for flexible ones |
| Query | `->>`, `@>`, `#>>` operators |
| Index | GIN on the jsonb column |
| Update | `\|\|`, `jsonb_set`, `- 'key'` |
| Hybrid | Relational rows + jsonb extras |
| Alternative | Document store only when JSON is everything |

JSONB is how Postgres absorbed the document database: ACID, SQL, joins, and flexible JSON in one engine. Model deliberately — queried fields as columns, flexible data as jsonb, GIN-index the paths you filter — and you get the best of both worlds without a second database.
