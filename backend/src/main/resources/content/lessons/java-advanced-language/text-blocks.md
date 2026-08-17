---
title: Text Blocks and String Processing
module: java-advanced-language
order: 3
minutes: 15
topics: ["text blocks", "multiline strings", "formatted", "indentation", "SQL templates"]
docs:
  - title: "Text blocks"
    url: "https://docs.oracle.com/en/java/javase/21/text-blocks.html"
---

# Text Blocks and String Processing

Multiline strings in Java used to mean `\n` escapes and string concatenation soup. Text blocks (Java 15+) make JSON, SQL, HTML, and templates readable — with automatic indentation handling and a `formatted` method for interpolation.

## The Problem

```java
// OLD: escape soup
String json = "{\n" +
    "  \"id\": 1,\n" +
    "  \"title\": \"Spring\",\n" +
    "  \"level\": \"BEGINNER\"\n" +
    "}";
```

```java
// NEW: text block
String json = """
    {
      "id": 1,
      "title": "Spring",
      "level": "BEGINNER"
    }
    """;
```

## How Text Blocks Work

```java
String block = """
    Line one
    Line two
    """;
```

- Opening `"""` must be followed by a newline.
- **Incidental indentation** — the least-indented line determines the base; it's stripped.
- Closing `"""` position controls the base: content is indented relative to the closing delimiter's column.

```java
String sql = """
        SELECT id, title
        FROM courses
        WHERE level = ?
        """;
// The closing """ at column 0 → all 8 spaces of content indentation are incidental and stripped
```

## formatted: Interpolation

```java
String message = """
    Hello %s,
    Your order %d is %s.
    """.formatted("Ada", 12345, "shipped");
```

`formatted` is `String.format` on the block. No concatenation, no `String.format` wrapper.

## SQL Templates

The killer use case — readable, maintainable queries:

```java
@Repository
public class CourseRepository {

    private static final String SEARCH_SQL = """
        SELECT id, title, level, minutes
        FROM courses
        WHERE (:title IS NULL OR title ILIKE '%' || :title || '%')
          AND (:level IS NULL OR level = :level)
        ORDER BY title
        """;

    public List<Course> search(String title, String level) {
        return namedJdbc.query(SEARCH_SQL,
            new MapSqlParameterSource()
                .addValue("title", title)
                .addValue("level", level),
            ROW_MAPPER);
    }
}
```

Multi-line SQL with alignment, comments, and parameters — exactly as the DBA wrote it.

## JSON Payloads

```java
String payload = """
    {
      "amount": %d,
      "currency": "%s",
      "description": "%s",
      "metadata": {
        "source": "backend"
      }
    }
    """.formatted(amount, currency, description);
```

Or with Jackson for full control — but for small payloads the text block is readable and self-contained.

## HTML and Email Templates

```java
String email = """
    <html>
      <body>
        <h1>Welcome, %s!</h1>
        <p>Your account is ready.</p>
      </body>
    </html>
    """.formatted(userName);
```

## Escapes Inside Text Blocks

```java
String block = """
    Line with \"quotes\" and \\ backslash
    Unicode: \u0041
    Line continuation: \
        continues on the same line
    """;
```

- `\"` — escaped quote (three quotes in a row are allowed raw: `"""` inside content works only via escape)
- `\\` — backslash
- `\` at line end — continuation (joins lines, strips indentation of following lines)

## String Templates Preview (Java 21)

Java 21 previews the `STR` processor:

```java
// Preview in Java 21, finalized path in later versions
String message = STR."""
    Hello \{name},
    Your order \{order.id()} is \{status}.
    """;
```

`\{expr}` interpolates expressions directly — no `formatted`, no format specifiers. When it stabilizes, it will supersede most `formatted` usage.

## Performance: They're Just Strings

Text blocks compile to regular `String` constants — no runtime parsing, no hidden cost:

```java
// Both compile to the same constant pool entry
String a = "SELECT * FROM courses WHERE level = 'BEGINNER'";
String b = """
    SELECT * FROM courses WHERE level = 'BEGINNER'
    """;
```

`b` is a compile-time constant — usable in `switch` cases and annotations.

## Common Mistakes

| Mistake | Result |
|---------|--------|
| Space before `"""` opener | Included in the string |
| Closing `"""` indented with content | Extra indentation kept |
| Tabs mixed with spaces | Indentation calculation gets weird |
| Blank first line | Leading newline (intentional in some cases) |

## Summary

| Use | Text block benefit |
|-----|--------------------|
| SQL | Alignment, comments, multi-line joins |
| JSON | Readable payloads, no escape soup |
| HTML/email | Template-like clarity |
| Error messages | Multi-line guidance |
| Interpolation | `formatted` or (preview) `STR` |

Text blocks are the boring productivity win: the same strings you already write, but readable. Combine with the records/sealed/pattern-matching trio and Java stops being a language you fight and starts being one you compose in.
