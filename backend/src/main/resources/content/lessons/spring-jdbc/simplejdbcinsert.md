---
title: SimpleJdbcInsert and Insert Patterns
module: spring-jdbc
order: 3
minutes: 16
topics: ["SimpleJdbcInsert", "generated keys", "table metadata", "multiple rows", "audit columns"]
summary: SimpleJdbcInsert removes the last boilerplate from inserts: it reads table metadata once, then turns a Map or bean into a parameterized INSERT — in...
docs:
  - title: "SimpleJdbcInsert"
    url: "https://docs.spring.io/spring-framework/reference/data-access/jdbc.html#jdbc-simple-jdbc-insert"
---

# SimpleJdbcInsert and Insert Patterns

`SimpleJdbcInsert` removes the last boilerplate from inserts: it reads table metadata once, then turns a `Map` or bean into a parameterized INSERT — including generated keys, with zero SQL string to maintain.

## Setup

```java
@Repository
public class CourseRepository {

    private final JdbcTemplate jdbcTemplate;
    private final SimpleJdbcInsert courseInsert;

    public CourseRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
        this.courseInsert = new SimpleJdbcInsert(jdbcTemplate)
            .withTableName("courses")
            .usingGeneratedKeyColumns("id");
    }
}
```

`usingGeneratedKeyColumns` tells the insert to fetch the auto-generated key.

## Insert From a Map

```java
public Long insert(String title, String level, int minutes) {
    Map<String, Object> params = new HashMap<>();
    params.put("title", title);
    params.put("level", level);
    params.put("minutes", minutes);
    // published defaults to false in the DB schema

    return courseInsert.executeAndReturnKey(params).longValue();
}
```

`executeAndReturnKey` runs the INSERT and returns the generated key. The column list comes from the map keys; the SQL is built from table metadata once at startup.

## Insert From a Bean

```java
public Long insert(Course course) {
    SqlParameterSource params = new BeanPropertySqlParameterSource(course);
    return courseInsert.executeAndReturnKey(params).longValue();
}
```

Same bean-to-parameter mapping as named parameters — the insert is now a one-liner.

## Multiple Rows

```java
public void insertAll(List<Course> courses) {
    SqlParameterSource[] batch = courses.stream()
        .map(BeanPropertySqlParameterSource::new)
        .toArray(SqlParameterSource[]::new);
    courseInsert.executeBatch(batch);   // one round-trip
}
```

`executeBatch` is the `batchUpdate` equivalent for `SimpleJdbcInsert`.

## Keys That Aren't Single Long

```java
public Object insertWithCompositeKey(Course course) {
    // KeyHolder gives access to all generated columns
    KeyHolder keyHolder = new GeneratedKeyHolder();
    courseInsert.execute(new BeanPropertySqlParameterSource(course), keyHolder);

    Map<String, Object> keys = keyHolder.getKeys();
    Long id = ((Number) keys.get("id")).longValue();
    return id;
}
```

`getKeys()` returns every generated column (useful for DB-generated UUIDs, timestamps, or composite keys).

## Column Control

By default `SimpleJdbcInsert` includes every column in the table — which fails when the table has NOT-NULL columns with DB defaults or audit columns you don't set. Explicitly declare the columns you set:

```java
private final SimpleJdbcInsert courseInsert = new SimpleJdbcInsert(jdbcTemplate)
    .withTableName("courses")
    .usingGeneratedKeyColumns("id")
    .usingColumns("title", "level", "minutes");   // only these — created_at, published etc. come from DB defaults
```

`usingColumns` is the correct production configuration: it documents the insert contract and prevents surprises from schema drift.

## The Audit Column Problem

DB defaults (`created_at DEFAULT now()`) are the clean way to handle audit fields with SimpleJdbcInsert — don't insert them at all:

```java
// Schema:
//   created_at TIMESTAMP NOT NULL DEFAULT now()
//   updated_at TIMESTAMP NOT NULL DEFAULT now()

// Insert only business columns; the DB fills audit columns
usingColumns("title", "level", "minutes");
```

For app-managed audit values (e.g., `created_by` from the security context), add them to the map:

```java
Map<String, Object> params = Map.of(
    "title", course.getTitle(),
    "level", course.getLevel(),
    "minutes", course.getMinutes(),
    "created_by", SecurityContextHolder.getContext().getAuthentication().getName());
```

## Upserts (INSERT ... ON CONFLICT)

`SimpleJdbcInsert` doesn't do upserts — fall back to explicit SQL:

```java
public void upsert(Course course) {
    jdbcTemplate.update("""
        INSERT INTO courses (id, title, level, minutes)
        VALUES (:id, :title, :level, :minutes)
        ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            level = EXCLUDED.level,
            minutes = EXCLUDED.minutes,
            updated_at = now()
        """,
        new BeanPropertySqlParameterSource(course));
}
```

The pattern: insert, on conflict update the business columns, bump `updated_at`.

## When Not to Use SimpleJdbcInsert

| Use SimpleJdbcInsert | Use plain SQL |
|----------------------|---------------|
| Simple single-table inserts | Joins, upserts, returning clauses |
| Generated keys | Custom SQL logic |
| Map/bean-driven inserts | Insert ... SELECT |
| Prototyping | Performance-critical (SQL is clearer) |

## Testing

```java
@JdbcTest
class CourseInsertTest {

    @Autowired JdbcTemplate jdbcTemplate;

    @Test
    void insertReturnsGeneratedKey() {
        Long id = repository.insert("Spring", "BEGINNER", 25);

        assertNotNull(id);
        Course course = repository.findById(id);
        assertEquals("Spring", course.getTitle());
    }

    @Test
    void batchInsertsAllRows() {
        repository.insertAll(List.of(
            new Course("Java", "BEGINNER", 30),
            new Course("Boot", "ADVANCED", 40)));

        assertEquals(2, repository.count());
    }
}
```

## Summary

| Feature | SimpleJdbcInsert |
|---------|------------------|
| Insert from map | `execute(params)` / `executeAndReturnKey(params)` |
| Insert from bean | `BeanPropertySqlParameterSource` |
| Generated keys | `usingGeneratedKeyColumns("id")` + `executeAndReturnKey` |
| Multi-row | `executeBatch(SqlParameterSource[])` |
| Column contract | `usingColumns(...)` |
| Upserts | Plain SQL with `ON CONFLICT` |

`SimpleJdbcInsert` is the least-known JDBC convenience: metadata-driven SQL, generated keys for free, and a clear column contract. Use it for the straightforward inserts, keep plain SQL for the interesting ones.
