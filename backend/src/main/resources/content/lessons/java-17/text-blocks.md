---
title: Text Blocks — Multi-Line Strings Without the Pain
summary: What text blocks are, how they replace escaped strings, indentation handling, and how organizations use them for SQL, JSON, HTML, and templates.
order: 4
minutes: 15
topics: [text-blocks, triple-quote, multi-line-string, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/text-blocks/
---

## The Concept, From Zero

Before Java 15, multi-line strings required ugly concatenation or escape sequences:

```java
// OLD WAY: JSON template
String json = "{\n" +
    "  \"name\": \"Alice\",\n" +
    "  \"age\": 30,\n" +
    "  \"address\": {\n" +
    "    \"city\": \"New York\"\n" +
    "  }\n" +
    "}";
```

**Text blocks** use triple quotes (`"""`) and let you write multi-line strings naturally:

```java
// JAVA 15+: Same thing, readable
String json = """
        {
          "name": "Alice",
          "age": 30,
          "address": {
            "city": "New York"
          }
        }
        """;
```

---

## Key Rules

1. **Start with `"""` on a NEW LINE** (the opening `"""` must be followed by a newline)
2. **End with `"""`** on its own line
3. **Indentation is relative** — the closing `"""` determines the left margin
4. **Trailing spaces** are preserved unless you add `\s` to strip them

```java
// Indentation is stripped relative to closing """
String html = """
        <html>
            <body>
                <p>Hello</p>
            </body>
        </html>
        """;
// Result: "<html>\n    <body>\n        <p>Hello</p>\n    </body>\n</html>"

// Line continuation with \ (backslash)
String singleLine = """
        This is a very long line that \
        continues on the next physical line \
        but appears as one line in the string.
        """;
// Result: "This is a very long line that continues on the next physical line but appears as one line in the string."
```

---

## Line-by-Line Walkthrough

```java
public class TextBlocksDemo {
    public static void main(String[] args) {
        // Line 1: SQL query — no more concatenation
        String query = """
                SELECT u.id, u.name, u.email
                FROM users u
                INNER JOIN orders o ON u.id = o.user_id
                WHERE o.created_at > ?
                  AND u.status = 'ACTIVE'
                ORDER BY u.name ASC
                LIMIT 100
                """;
        System.out.println(query);

        // Line 2: HTML template
        String html = """
                <div class="card">
                    <h2>%s</h2>
                    <p>%s</p>
                    <span class="badge">%s</span>
                </div>
                """.formatted("Product Name", "Description here", "NEW");
        // .formatted() works with text blocks (Java 15+)

        // Line 3: JSON with variables
        String name = "Alice";
        int age = 30;
        String json = """
                {
                    "name": "%s",
                    "age": %d,
                    "active": true
                }
                """.formatted(name, age);

        // Line 4: YAML configuration
        String yaml = """
                server:
                  port: 8080
                  host: localhost
                database:
                  url: jdbc:postgresql://localhost:5432/mydb
                  pool:
                    size: 10
                    timeout: 30s
                """;

        // Line 5: String formatting with \s (escape-trailing-space)
        String padded = """
                Line 1\s
                Line 2\s
                Line 3\s
                """;
        // \s replaces the trailing whitespace + newline with a single space

        // Line 6: Line continuation
        String csvHeader = """
                id,name,email,\
                department,salary,\
                hire_date
                """;
        // Result: "id,name,email,department,salary,hire_date"

        // Line 7: Combining with switch
        String protocol = "HTTPS";
        String config = switch (protocol) {
            case "HTTP" -> """
                    protocol: http
                    port: 80
                    secure: false
                    """;
            case "HTTPS" -> """
                    protocol: https
                    port: 443
                    secure: true
                    """;
            default -> throw new IllegalArgumentException("Unknown: " + protocol);
        };
    }
}
```

---

## Real-World Scenarios

### Scenario 1: SQL query builder

```java
public String buildUserQuery(String status, int minAge) {
    return """
            SELECT id, name, email, age
            FROM users
            WHERE status = '%s'
              AND age >= %d
            ORDER BY name
            """.formatted(status, minAge);
}
```

### Scenario 2: Email template

```java
public String orderConfirmation(String customerName, String orderId, double total) {
    return """
            Dear %s,

            Your order #%s has been confirmed.
            Total: $%.2f

            Thank you for your purchase!

            Best regards,
            The Store Team
            """.formatted(customerName, orderId, total);
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Opening `"""` not on new line | Syntax error | Always put `"""` on its own line |
| Wrong indentation | Extra spaces in string | Align closing `"""` with desired left margin |
| Using `\n` inside text block | Redundant | Text blocks already preserve line breaks |
| Forgetting `.formatted()` | Can't use `String.format()` directly | Use `.formatted(args)` method |
