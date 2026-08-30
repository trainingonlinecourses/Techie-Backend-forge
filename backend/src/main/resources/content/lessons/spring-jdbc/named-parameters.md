---
title: NamedParameterJdbcTemplate
module: spring-jdbc
order: 2
minutes: 18
topics: ["named parameters", "SqlParameterSource", "MapSqlParameterSource", "BeanPropertySqlParameterSource", "dynamic queries"]
summary: ? placeholders are positional — pass 7 parameters and pray you remember the order. NamedParameterJdbcTemplate names each parameter (:title, :level)...
docs:
  - title: "Named parameters"
    url: "https://docs.spring.io/spring-framework/reference/data-access/jdbc.html#jdbc-NamedParameterJdbcTemplate"
---

# NamedParameterJdbcTemplate

`?` placeholders are positional — pass 7 parameters and pray you remember the order. `NamedParameterJdbcTemplate` names each parameter (`:title`, `:level`) and binds by name. For any query with more than 3 parameters, it's the difference between fragile and readable.

## Setup

```java
@Repository
public class CourseRepository {

    private final NamedParameterJdbcTemplate jdbcTemplate;

    public CourseRepository(NamedParameterJdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }
}
```

Spring Boot auto-configures it from the `DataSource`. It wraps a `JdbcTemplate` under the hood — same features, named syntax.

## Named Queries

```java
public Course findByTitleAndLevel(String title, String level) {
    return jdbcTemplate.queryForObject("""
        SELECT * FROM courses
        WHERE title = :title AND level = :level
        """,
        new MapSqlParameterSource()
            .addValue("title", title)
            .addValue("level", level),
        courseRowMapper);
}
```

The `SqlParameterSource` carries the values. Three implementations:

| Implementation | Use |
|----------------|-----|
| `MapSqlParameterSource` | Explicit name → value pairs |
| `BeanPropertySqlParameterSource` | Map bean properties by name |
| `EmptySqlParameterSource` | No parameters |

## Binding a Bean

```java
public void insert(Course course) {
    jdbcTemplate.update("""
        INSERT INTO courses (title, level, minutes)
        VALUES (:title, :level, :minutes)
        """,
        new BeanPropertySqlParameterSource(course));
}
```

The parameter names match the bean's property names — no mapping code. Combined with records or DTOs, insert/update code collapses.

## Reusable Parameter Map

```java
public List<Course> search(String title, String level, Integer minMinutes) {
    MapSqlParameterSource params = new MapSqlParameterSource();

    StringBuilder sql = new StringBuilder("SELECT * FROM courses WHERE 1=1");

    if (title != null) {
        sql.append(" AND title ILIKE :title");
        params.addValue("title", "%" + title + "%");
    }
    if (level != null) {
        sql.append(" AND level = :level");
        params.addValue("level", level);
    }
    if (minMinutes != null) {
        sql.append(" AND minutes >= :minMinutes");
        params.addValue("minMinutes", minMinutes);
    }
    sql.append(" ORDER BY title");

    return jdbcTemplate.query(sql.toString(), params, courseRowMapper);
}
```

Dynamic queries build SQL and parameters side by side — the names keep the two in sync, something positional placeholders make painful.

## Batch With Named Parameters

```java
public int[] insertAll(List<Course> courses) {
    SqlParameterSource[] batch = courses.stream()
        .map(BeanPropertySqlParameterSource::new)
        .toArray(SqlParameterSource[]::new);

    return jdbcTemplate.batchUpdate("""
        INSERT INTO courses (title, level, minutes)
        VALUES (:title, :level, :minutes)
        """, batch);
}
```

## IN-Clauses

Named parameters make the classic `IN (...)` dynamic list clean:

```java
public List<Course> findByIds(Collection<Long> ids) {
    MapSqlParameterSource params = new MapSqlParameterSource("ids", ids);
    return jdbcTemplate.query(
        "SELECT * FROM courses WHERE id IN (:ids)",
        params, courseRowMapper);
}
```

The template expands `:ids` into `(?, ?, ?...)` automatically — no manual comma-joining.

## Reusing the Underlying JdbcTemplate

Both APIs coexist:

```java
// Positional when you need it
public int count() {
    return jdbcTemplate.getJdbcTemplate().queryForObject(
        "SELECT COUNT(*) FROM courses", Long.class).intValue();
}
```

Use named parameters as the default; drop to the wrapped `JdbcTemplate` only for trivial scalar queries.

## Transactions Work the Same

Named parameters and transactions compose naturally:

```java
@Transactional
public void publishCourse(Long id) {
    jdbcTemplate.update("""
        UPDATE courses SET published = true WHERE id = :id
        """, new MapSqlParameterSource("id", id));
    auditService.log("course-published", id);
}
```

The `@Transactional` boundary wraps the template call — same as JPA.

## Testing

```java
@DataJpaTest   // or @JdbcTest for pure JDBC slice
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class CourseRepositoryTest {

    @Autowired NamedParameterJdbcTemplate jdbcTemplate;

    @Test
    void findsByTitleAndLevel() {
        insertCourse("Spring Boot", "BEGINNER");

        Course course = repository.findByTitleAndLevel("Spring Boot", "BEGINNER");

        assertNotNull(course);
        assertEquals("Spring Boot", course.getTitle());
    }
}
```

## Summary

| Concern | NamedParameterJdbcTemplate |
|---------|---------------------------|
| Readability | `:name` instead of `?` |
| Binding | `MapSqlParameterSource` / `BeanPropertySqlParameterSource` |
| Dynamic SQL | Params map grows with the WHERE clause |
| IN lists | `:ids` auto-expands |
| Batches | `SqlParameterSource[]` |
| Fallback | `getJdbcTemplate()` for positional |

Named parameters are strictly more readable and less error-prone than positional placeholders. Make them your default for anything beyond a one-liner — the code reads like the SQL, and refactors stop breaking silently.
