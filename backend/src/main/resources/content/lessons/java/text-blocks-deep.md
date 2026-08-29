---
title: Text Blocks — Multi-Line Strings in Java
summary: Triple-quoted strings for HTML, SQL, and JSON templates, indentation handling, escape sequences, and .formatted() for dynamic content.
order: 30
minutes: 14
topics: [text-blocks, multi-line-strings, triple-quotes, string-formatting, template-literals]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-3.html#jls-3.7
  - https://www.javaguides.net/2020/09/java-text-blocks.html
---

# Java Text Blocks — Multi-Line Strings

## What Are Text Blocks?

Before Java 13, writing multi-line strings in Java was painful:

```java
// Old way — ugly escape sequences everywhere
String html = "<html>\n" +
              "  <body>\n" +
              "    <p>Hello, World!</p>\n" +
              "  </body>\n" +
              "</html>";

// Old way — with concatenation
String sql = "SELECT id, name, email " +
             "FROM users " +
             "WHERE age > 18 " +
             "ORDER BY name";

// Old way — with \n everywhere
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"age\": 25\n" +
              "}";
```

**Text Blocks** (Java 13+, stable in Java 15+) fix this with triple quotes `"""`:

```java
// New way — clean, readable, no escape sequences!
String html = """
              <html>
                <body>
                  <p>Hello, World!</p>
                </body>
              </html>
              """;

String sql = """
             SELECT id, name, email
             FROM users
             WHERE age > 18
             ORDER BY name
             """;

String json = """
              {
                "name": "Alice",
                "age": 25
              }
              """;
```

---

## How Text Blocks Work

### Basic Syntax

```java
// Opening: """ followed by a newline
// Content: the multi-line string
// Closing: """ on its own line
String text = """
              Line 1
              Line 2
              Line 3
              """;
```

### Indentation Handling

Java uses the **closing `"""`** to determine the indentation:

```java
// The closing """ determines the left margin
String message = """
                 Hello
                 World
                 """;
// Result: "Hello\nWorld\n" (NOT "                 Hello\n                 World\n")

// The closing """ is at column 14, so 14 spaces are stripped from each line
String indented = """
                  First line
                    Second line (indented by 2)
                  Third line
                  """;
// Result: "First line\n  Second line (indented by 2)\nThird line\n"
```

### No Newline at the End

```java
// The closing """ being on its own line means NO trailing newline
String s1 = """
            Hello
            """;
// s1 = "Hello\n"

// If you WANT a trailing newline, add a blank line before """
String s2 = """
            Hello

            """;
// s2 = "Hello\n\n"
```

---

## Common Use Cases

### 1. HTML/XML Templates

```java
String emailTemplate = """
                       <html>
                         <body>
                           <h1>Welcome, %s!</h1>
                           <p>Your account has been created.</p>
                           <p>Login at: <a href="%s">Click here</a></p>
                         </body>
                       </html>
                       """;

String html = String.format(emailTemplate, "Alice", "https://app.example.com");
```

### 2. SQL Queries

```java
String query = """
               SELECT u.id, u.name, u.email, o.total
               FROM users u
               JOIN orders o ON u.id = o.user_id
               WHERE o.created_at >= :startDate
                 AND o.status = 'COMPLETED'
               ORDER BY o.total DESC
               LIMIT :limit
               """;

// Use with Spring Data JPA
@Query(value = """
               SELECT u.id, u.name, u.email, o.total
               FROM users u
               JOIN orders o ON u.id = o.user_id
               WHERE o.created_at >= :startDate
                 AND o.status = 'COMPLETED'
               ORDER BY o.total DESC
               """, nativeQuery = true)
List<Object[]> findCompletedOrdersSince(@Param("startDate") LocalDateTime startDate);
```

### 3. JSON Templates

```java
String requestJson = """
                     {
                       "name": "%s",
                       "email": "%s",
                       "settings": {
                         "theme": "dark",
                         "notifications": true
                       }
                     }
                     """;

String payload = String.format(requestJson, "Alice", "alice@example.com");
```

### 4. Code Generation

```java
String javaClass = """
                   package com.example;

                   public class %s {
                       private final String name;

                       public %s(String name) {
                           this.name = name;
                       }

                       public String getName() {
                           return name;
                       }
                   }
                   """;

String className = "User";
String code = String.format(javaClass, className, className);
```

### 5. Markdown / Documentation

```java
String readme = """
                # %s

                ## Description
                %s

                ## Installation
                ```bash
                git clone https://github.com/%s/%s.git
                cd %s
                mvn install
                ```

                ## Usage
                Run with: `java -jar %s.jar`
                """;
```

---

## Escape Sequences in Text Blocks

Text blocks support special escape sequences:

### `\s` — Preserve Trailing Spaces

```java
String spaced = """
                Hello\s
                World\s
                """;
// Both lines have a trailing space before the newline
// "Hello \nWorld \n"
```

### `\` — Line Continuation (End the Line)

```java
String singleLine = """
                    This is a very long \
                    line that continues \
                    on the next line\
                    but appears as one line in output.
                    """;
// Result: "This is a very long line that continues on the next linebut appears as one line in output."
// Note: NO spaces around "linebut" — the \ eats the newline AND surrounding whitespace
```

### `\"` — Double Quotes Inside Text Block

```java
String withQuotes = """
                    She said, \"Hello!\" and left.
                    """;
// Result: She said, "Hello!" and left.
```

### `\\` — Literal Backslash

```java
String path = """
              C:\\Users\\Alice\\Documents
              """;
// Result: C:\Users\Alice\Documents
```

---

## Text Blocks vs String Concatenation

```java
// ❌ Old way — hard to read, easy to make mistakes
String xml = "<root>\n" +
             "  <name>" + user.getName() + "</name>\n" +
             "  <email>" + user.getEmail() + "</email>\n" +
             "</root>";

// ✅ New way — readable, clean
String xml = """
             <root>
               <name>%s</name>
               <email>%s</email>
             </root>
             """.formatted(user.getName(), user.getEmail());

// ✅ Or with String.format
String xml = String.format("""
                           <root>
                             <name>%s</name>
                             <email>%s</email>
                           </root>
                           """, user.getName(), user.getEmail());
```

---

## Text Blocks with Formatted Strings

### The `.formatted()` Method (Java 15+)

```java
String template = """
                  {
                    "user": {
                      "name": "%s",
                      "age": %d,
                      "active": %b
                    }
                  }
                  """;

// .formatted() is a convenience method on String
String json = template.formatted("Alice", 25, true);
```

### Multiple Arguments

```java
String report = """
                Monthly Report
                ===============
                Period: %s to %s
                Total Orders: %d
                Revenue: $%,.2f
                Average Order: $%,.2f
                """;

String result = report.formatted(
    "2024-01-01", "2024-01-31",
    1234,
    45678.90,
    37.01
);
```

---

## In an Organization

### Scenario 1: REST API Documentation

```java
// Generating OpenAPI/Swagger descriptions
public class ApiDocs {
    public static String getUserDescription() {
        return """
               ## Get User by ID

               Retrieves a user's profile information.

               ### Path Parameters
               - `id` (Long, required): The user's unique identifier

               ### Response
               - 200: User found
               - 404: User not found
               - 500: Server error

               ### Example Request
               ```
               GET /api/users/123
               Authorization: Bearer <token>
               ```

               ### Example Response
               ```json
               {
                 "id": 123,
                 "name": "Alice",
                 "email": "alice@example.com"
               }
               ```
               """;
    }
}
```

### Scenario 2: Email Templates

```java
@Service
public class EmailService {
    public String buildWelcomeEmail(String name, String activationLink) {
        return """
               <html>
               <head>
                 <style>
                   body { font-family: Arial, sans-serif; }
                   .button { background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
                 </style>
               </head>
               <body>
                 <h2>Welcome, %s!</h2>
                 <p>Thank you for registering. Please activate your account:</p>
                 <a href="%s" class="button">Activate Account</a>
                 <p>If you didn't register, ignore this email.</p>
               </body>
               </html>
               """.formatted(name, activationLink);
    }
}
```

### Scenario 3: Database Migration Scripts

```java
public class MigrationScripts {
    public static String createUsersTable() {
        return """
               CREATE TABLE users (
                   id BIGSERIAL PRIMARY KEY,
                   username VARCHAR(50) UNIQUE NOT NULL,
                   email VARCHAR(100) UNIQUE NOT NULL,
                   password_hash VARCHAR(255) NOT NULL,
                   role VARCHAR(20) DEFAULT 'USER',
                   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                   updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
               );

               CREATE INDEX idx_users_email ON users(email);
               CREATE INDEX idx_users_username ON users(username);
               """;
    }
}
```

### Scenario 4: Log Message Formatting

```java
public class AuditLogger {
    public void logUserAction(String userId, String action, String details) {
        String logMessage = """
                            AUDIT: User Action
                            ─────────────────
                            User:    %s
                            Action:  %s
                            Details: %s
                            Time:    %s
                            ─────────────────
                            """.formatted(userId, action, details, LocalDateTime.now());
        logger.info(logMessage);
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting the closing `"""` must be on its own line | Compilation error | Always put `"""` on a new line |
| Confused about indentation | Extra whitespace in output | Align the closing `"""` to the desired left margin |
| Using `==` to compare text blocks | Text blocks are String objects, `==` compares references | Use `.equals()` or `.strip().equals()` |
| Mixing `\n` with text blocks | Redundant newlines | Text blocks already handle newlines |
| Text block with only one line | Just use a regular string | Reserve text blocks for multi-line content |
| Forgetting `.formatted()` for dynamic content | Placeholder strings appear literally | Always call `.formatted()` or `String.format()` |
