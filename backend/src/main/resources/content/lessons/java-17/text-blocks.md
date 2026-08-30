---
title: "Text Blocks — Multi-Line Strings Without the Escape Hell"
summary: "What text blocks are, how triple-quoted strings work, why they exist, and how organizations use them for SQL, JSON, and HTML generation."
order: 7
minutes: 20
topics: [text-blocks, multi-line-strings, triple-quotes, java-17, formatting, string-literals]
docs:
  - https://openjdk.org/jeps/378
  - https://docs.oracle.com/en/java/javase/17/text-blocks/index.html
---

## The Concept, From Zero

### What is a Text Block?

Before Java 17, writing multi-line strings was painful. You had to use `+` concatenation and escape characters everywhere:

```java
String old = "SELECT u.id, u.name, u.email\n" +
             "FROM users u\n" +
             "WHERE u.active = true\n" +
             "ORDER BY u.name";
```

**The problem:** Every `\n` is an escape code. Every `"` inside the string needs `\"`. Every `\` needs `\\`. It's ugly, error-prone, and hard to read.

**Text Blocks fix this.** Introduced in Java 13 as a preview and finalized in Java 17 (JEP 378), a text block is a multi-line string literal that starts with `"""` (three double quotes) and ends with `"""`:

```java
String modern = """
        SELECT u.id, u.name, u.email
        FROM users u
        WHERE u.active = true
        ORDER BY u.name
        """;
```

**Same result, dramatically cleaner code.** No escape characters. No concatenation. Just write what you mean.

### Why Text Blocks Exist

Text blocks solve three specific problems:

1. **HTML/JSON/XML templates** — These are inherently multi-line, and escaping them in regular strings is awful
2. **SQL queries** — Complex queries span multiple lines and need to be readable
3. **Code generation** — When your Java code generates other code (like build scripts), text blocks make it natural

### How Triple Quotes Work

A text block starts with `"""` followed by a mandatory newline:

```java
// CORRECT — newline after opening """
String good = """
    Hello World
    """;

// WRONG — no newline after opening """
// This is actually NOT a text block, it's regular concatenation
// String bad = """Hello World""";
```

The closing `"""` must be on its own line and determines the **indentation stripping**:

```java
String s = """
        This line is indented by 8 spaces
        This line is also indented by 8 spaces
    """;  // The closing """ at column 4 strips 4 spaces from every line
```

**The rule:** The closing `"""` position defines the left margin. All leading whitespace up to that column is stripped from every line.

### The Basics — How to Create a Text Block

```java
public class TextBlockBasics {
    public static void main(String[] args) {
        // A simple text block
        String greeting = """
                Hello, World!
                Welcome to Java Text Blocks.
                """;
        
        System.out.println(greeting);
        // Output:
        // Hello, World!
        // Welcome to Java Text Blocks.
    }
}
```

**What happened here?**
1. `"""` opens the text block
2. Each line after `"""` is part of the string
3. The closing `"""` at column 4 strips 4 spaces from each line
4. The result is a clean string without extra indentation

### Text Blocks vs Regular Strings

```java
public class Comparison {
    public static void main(String[] args) {
        // Regular string — ugly escaping
        String html1 = "<html>\n" +
                       "    <body>\n" +
                       "        <p>Hello</p>\n" +
                       "    </body>\n" +
                       "</html>";
        
        // Text block — clean and readable
        String html2 = """
                <html>
                    <body>
                        <p>Hello</p>
                    </body>
                </html>
                """;
        
        // Both produce IDENTICAL output
        System.out.println(html1.equals(html2)); // true
    }
}
```

### Incidental White Space Stripping

This is the most confusing part of text blocks. The closing `"""` position determines indentation:

```java
public class IndentationDemo {
    public static void main(String[] args) {
        // Closing """ at column 0 — no stripping
        String a = """
Hello
  World
""";
        System.out.println("---a---");
        System.out.println(a);
        System.out.println("---a---");
        
        // Closing """ at column 4 — strips 4 spaces
        String b = """
            Hello
              World
            """;
        System.out.println("---b---");
        System.out.println(b);
        System.out.println("---b---");
    }
}
```

**Output:**
```
---a---
Hello
  World
---
---b---
Hello
  World
---
```

**The rule:** Count the spaces from the start of the line to the closing `"""`. That many spaces are stripped from EVERY line. Lines with fewer spaces than the strip amount throw a `TextBlockTooLongException` at runtime (actually, they just get all spaces stripped).

### Line Terminators and Trailing Spaces

Text blocks preserve line terminators (`\n`) exactly as written:

```java
public class LineEndings {
    public static void main(String[] args) {
        // Trailing spaces are preserved (but invisible)
        String s = """
                line1
                line2
                """;
        
        // You can control trailing newline with \
        String t = """
                line1\
                line2""";
        // Result: "line1line2" — no newline between them!
    }
}
```

**The `\` at end of line** is a line terminator escape — it joins lines without a newline character.

### JSON Example

```java
public class JsonExample {
    public static void main(String[] args) {
        String json = """
                {
                    "name": "Alice Johnson",
                    "age": 30,
                    "skills": ["Java", "Spring", "Docker"],
                    "active": true
                }
                """;
        
        System.out.println(json);
        // Valid JSON — ready to parse or send to an API
    }
}
```

### SQL Example

```java
public class SqlExample {
    public static void main(String[] args) {
        String query = """
                SELECT 
                    u.id,
                    u.first_name,
                    u.last_name,
                    COUNT(o.id) as order_count
                FROM users u
                LEFT JOIN orders o ON o.user_id = u.id
                WHERE u.created_at >= '2024-01-01'
                GROUP BY u.id, u.first_name, u.last_name
                HAVING COUNT(o.id) > 5
                ORDER BY order_count DESC
                LIMIT 100
                """;
        
        System.out.println(query);
        // Clean, readable SQL — no string concatenation mess
    }
}
```

### HTML Template Example

```java
public class HtmlTemplate {
    public static void main(String[] args) {
        String name = "Alice";
        int age = 30;
        
        String html = """
                <html>
                    <body>
                        <h1>User Profile</h1>
                        <p>Name: %s</p>
                        <p>Age: %d</p>
                    </body>
                </html>
                """.formatted(name, age);
        
        System.out.println(html);
    }
}
```

### Organization Use Cases

**1. API Response Templates**
```java
public class ApiResponseTemplate {
    public String errorResponse(String code, String message) {
        return """
                {
                    "status": "error",
                    "code": "%s",
                    "message": "%s",
                    "timestamp": "%s"
                }
                """.formatted(code, message, java.time.Instant.now());
    }
}
```

**2. Flyway SQL Migrations**
```java
public class MigrationV2 {
    public String up() {
        return """
                CREATE TABLE users (
                    id BIGINT PRIMARY KEY AUTO_INCREMENT,
                    username VARCHAR(50) NOT NULL UNIQUE,
                    email VARCHAR(100) NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
                );
                
                CREATE INDEX idx_users_email ON users(email);
                """;
    }
}
```

**3. Code Generation**
```java
public class DtoGenerator {
    public String generateDto(String className, List<String> fields) {
        StringBuilder sb = new StringBuilder();
        sb.append("""
                public record %s("""
                .formatted(className));
        
        String fieldList = fields.stream()
            .map(f -> "    String " + f)
            .collect(java.util.stream.Collectors.joining(",\n"));
        
        sb.append(fieldList);
        sb.append(""") {}""");
        return sb.toString();
    }
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting newline after opening `"""` | Not a text block — just string concatenation | Always put `"""` on its own line |
| Wrong closing `"""` indentation | Extra/missing whitespace in result | Align closing `"""` with desired left margin |
| Using `\n` inside text blocks | Double newlines — `\n` plus the actual newline | Remove `\n` — text blocks handle line breaks automatically |
| Not using `formatted()` for templates | Static text only, no dynamic values | Use `formatted()` or `String.format()` |
| Mixing text blocks with regular strings unnecessarily | Over-engineering single-line strings | Use text blocks only for 3+ line strings |

### Line-by-Line Code Explanation

```java
public class TextBlockDemo {
    // ↑ Public class — the text block demo
    
    public static void main(String[] args) {
        // ↑ Standard main method entry point
        
        String sql = """
                // ↑ Triple quotes OPEN the text block
                // ↑ Mandatory newline after opening """
                
                SELECT id, name, email
                // ↑ First line of content — will have indentation stripped
                
                FROM users
                // ↑ Second line — same indentation stripping
                
                WHERE active = true
                // ↑ Third line — SQL is readable and clean
                
                """;
                // ↑ Triple quotes CLOSE the text block
                // ↑ The closing position determines indentation stripping
        
        String formatted = sql.formatted();
        // ↑ formatted() with no args — just validates the string
        // ↑ In Java 17, this is equivalent to just using sql directly
        
        System.out.println(formatted);
        // ↑ Prints the clean SQL — no escape characters visible
    }
}
```

### Key Takeaways

1. **Text blocks use `"""` triple quotes** — they start with `"""` followed by a newline
2. **Indentation is auto-stripped** based on the closing `"""` position
3. **No escape characters needed** for `"` — only `\"` for the three quote characters themselves
4. **`formatted()` replaces `String.format()`** — cleaner template syntax
5. **Use them for SQL, JSON, HTML, XML** — any multi-line text
6. **Don't use them for short strings** — regular strings are fine for 1-2 lines

### Real-World Organization Scenario

A backend team is building a microservices platform. They need:
- SQL migrations (Flyway/Liquibase)
- OpenAPI documentation strings
- Email templates
- Configuration files

Before text blocks, each of these required ugly string concatenation or external files. With text blocks, they embed multi-line templates directly in Java code — readable, maintainable, and type-safe.
