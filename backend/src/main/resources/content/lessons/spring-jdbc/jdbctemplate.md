---
title: JdbcTemplate Fundamentals
module: spring-jdbc
order: 1
minutes: 22
topics: ["JdbcTemplate", "RowMapper", "query methods", "updates", "generated keys", "SQL control"]
summary: Spring Data JPA is great — until you need exact SQL, raw performance, or a query JPA can't express. JdbcTemplate is the middle ground: full SQL con...
docs:
  - title: "Spring JDBC docs"
    url: "https://docs.spring.io/spring-framework/reference/data-access/jdbc.html"
---

# JdbcTemplate Fundamentals

Spring Data JPA is great — until you need exact SQL, raw performance, or a query JPA can't express. `JdbcTemplate` is the middle ground: full SQL control with no boilerplate. No connection management, no try/finally, no checked exceptions — just SQL and mapping.

## Setup

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-jdbc</artifactId>
</dependency>
```

Spring Boot auto-configures a `JdbcTemplate` from the `DataSource`. Inject it anywhere:

```java
@Repository
public class CourseJdbcRepository {

    private final JdbcTemplate jdbcTemplate;

    public CourseJdbcRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
}
```

## Querying With RowMapper

```java
public Course findById(Long id) {
    return jdbcTemplate.queryForObject(
        """
        SELECT id, title, level, minutes
        FROM courses
        WHERE id = ?
        """,
        courseRowMapper,
        id);
}
```

The `RowMapper` maps each row to an object:

```java
private static final RowMapper<Course> courseRowMapper = (rs, rowNum) ->
    new Course(
        rs.getLong("id"),
        rs.getString("title"),
        rs.getString("level"),
        rs.getInt("minutes"));
```

Or with a `BeanPropertyRowMapper` for simple cases (column names → property names):

```java
return jdbcTemplate.queryForObject(
    "SELECT * FROM courses WHERE id = ?",
    new BeanPropertyRowMapper<>(Course.class),
    id);
```

## The Query Method Family

| Method | Returns | When |
|--------|---------|------|
| `queryForObject(sql, mapper, args...)` | One row | `WHERE id = ?` |
| `query(sql, mapper, args...)` | List of rows | Any multi-row query |
| `queryForList(sql, Class, args...)` | List of a single column | `SELECT id FROM ...` |
| `queryForMap(sql, args...)` | One row as a map | Ad-hoc / dynamic |
| `queryForObject(sql, Class, args...)` | Scalar | `SELECT COUNT(*)` |

```java
public List<Course> findByLevel(String level) {
    return jdbcTemplate.query(
        "SELECT * FROM courses WHERE level = ? ORDER BY title",
        courseRowMapper, level);
}

public long countByLevel(String level) {
    return jdbcTemplate.queryForObject(
        "SELECT COUNT(*) FROM courses WHERE level = ?",
        Long.class, level);
}

public List<String> findTitles() {
    return jdbcTemplate.queryForList("SELECT title FROM courses", String.class);
}
```

## Updates and Inserts

```java
public int updateMinutes(Long id, int minutes) {
    return jdbcTemplate.update(
        "UPDATE courses SET minutes = ? WHERE id = ?",
        minutes, id);
}
```

`update` returns the affected row count — the natural check for "did it exist?":

```java
public boolean deleteIfExists(Long id) {
    return jdbcTemplate.update("DELETE FROM courses WHERE id = ?", id) > 0;
}
```

### Insert With Generated Keys

```java
public Course insert(Course course) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbcTemplate.update(con -> {
        PreparedStatement ps = con.prepareStatement(
            "INSERT INTO courses (title, level, minutes) VALUES (?, ?, ?)",
            Statement.RETURN_GENERATED_KEYS);
        ps.setString(1, course.getTitle());
        ps.setString(2, course.getLevel());
        ps.setInt(3, course.getMinutes());
        return ps;
    }, keyHolder);

    long id = keyHolder.getKey().longValue();
    return course.withId(id);
}
```

## Batch Operations: The Performance Dial

Inserting 10,000 courses one `update()` at a time is 10,000 round-trips. `batchUpdate` does one:

```java
public int[] insertAll(List<Course> courses) {
    return jdbcTemplate.batchUpdate(
        "INSERT INTO courses (title, level, minutes) VALUES (?, ?, ?)",
        new BatchPreparedStatementSetter() {
            @Override
            public void setValues(PreparedStatement ps, int i) throws SQLException {
                ps.setString(1, courses.get(i).getTitle());
                ps.setString(2, courses.get(i).getLevel());
                ps.setInt(3, courses.get(i).getMinutes());
            }

            @Override
            public int getBatchSize() {
                return courses.size();
            }
        });
}
```

Or with Java 8+ streams (Postgres supports `executeBatch` with `Statement` reuse):

```java
jdbcTemplate.batchUpdate(
    "INSERT INTO courses (title, level, minutes) VALUES (?, ?, ?)",
    courses,
    100,                                  // batch size
    (ps, course) -> {
        ps.setString(1, course.getTitle());
        ps.setString(2, course.getLevel());
        ps.setInt(3, course.getMinutes());
    });
```

## SQL Injection Safety

**Always use `?` placeholders, never string concatenation:**

```java
// ❌ INJECTION: title concatenated into SQL
jdbcTemplate.query(
    "SELECT * FROM courses WHERE title = '" + title + "'", ...);

// ✅ SAFE: parameterized
jdbcTemplate.query(
    "SELECT * FROM courses WHERE title = ?", courseRowMapper, title);
```

A parameterized query cannot be injected — the value is data, never code. This is the single most important rule of raw SQL in any language.

## Mapping to Records

Records make RowMappers trivial:

```java
public record CourseRow(Long id, String title, String level, int minutes) {}

private static final RowMapper<CourseRow> ROW_MAPPER = (rs, n) ->
    new CourseRow(rs.getLong("id"), rs.getString("title"),
        rs.getString("level"), rs.getInt("minutes"));

public List<CourseRow> findAll() {
    return jdbcTemplate.query("SELECT * FROM courses ORDER BY id", ROW_MAPPER);
}
```

## Exceptions: The Translation Layer

Spring translates raw SQLExceptions into meaningful DataAccessExceptions:

```java
try {
    jdbcTemplate.update("INSERT INTO courses ...", ...);
} catch (DuplicateKeyException e) {
    // specific: duplicate primary key — no SQLException parsing
    throw new CourseCodeExistsException();
}
```

The hierarchy (via `SQLErrorCodeSQLExceptionTranslator`) maps vendor codes to Spring exceptions: `DuplicateKeyException`, `DataIntegrityViolationException`, `EmptyResultDataAccessException` (queryForObject found nothing), `IncorrectResultSizeDataAccessException` (found >1).

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| `queryForObject` returns null | `EmptyResultDataAccessException` | `query(...).stream().findFirst()` |
| Concatenated SQL | Injection | Placeholders |
| Slow single inserts | N round-trips | `batchUpdate` |
| Column name typos | Runtime SQLException | Column aliases + tests |
| Forgetting WHERE | Full-table updates | Always review updates/deletes |

## Summary

| Need | JdbcTemplate method |
|------|---------------------|
| One row | `queryForObject(sql, mapper, id)` |
| Many rows | `query(sql, mapper, ...)` |
| Scalar | `queryForObject(sql, Long.class, ...)` |
| Write | `update(sql, ...)` → row count |
| Generated key | `KeyHolder` |
| Bulk | `batchUpdate` |
| Mapping | `RowMapper` / `BeanPropertyRowMapper` / records |

JdbcTemplate is your escape hatch: exact SQL, full control, parameterized safety, and Spring's exception translation. The next lessons cover named parameters, `SimpleJdbcInsert`, and the transaction integration.
