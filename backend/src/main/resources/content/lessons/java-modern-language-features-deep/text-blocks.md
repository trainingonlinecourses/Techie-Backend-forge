---
title: Text Blocks — Multiline Strings Without the Escaping Nightmare
summary: A text block is a multiline string literal delimited by three double-quote characters. It lets you write HTML, JSON, SQL, and other structured text directly in Java code without escaping every newline and quote. This lesson explains the syntax, how indentation is stripped, when escaping is still needed, and the situations where a text block is cleaner than a regular string — and when it is not.
order: 4
minutes: 16
topics: [text-blocks, strings, multiline, escaping, formatted, json, sql, html, jls]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/strings.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-3.html#jls-3.10.7
---

## The Concept, From Zero

Before text blocks, writing a multiline string in Java was painful. You had to write one long line, or you had to concatenate several lines with `+` and `\n`, and every double-quote inside the string had to be escaped with a backslash.

// The old way — painful escaping and concatenation
String json = "{\n" +
              "  \"name\": \"Alice\",\n" +
              "  \"email\": \"alice@example.com\"\n" +
              "}";

This is hard to read, hard to maintain, and hard to change. If you add a field, you have to edit multiple lines and make sure the indentation and escaping are still correct. The code does not look like the data it represents.

A **text block** solves this. It is a string literal delimited by three double-quote characters (`"""`), and it can span multiple lines. Inside a text block, you do not need to escape normal characters, and newlines are part of the string.

// The text block way — the string looks like the data
String json = """
    {
        "name": "Alice",
        "email": "alice@example.com"
    }
    """;

The text block starts with `"""` and ends with `"""`. Everything between them is the string content. The newlines you type are part of the string. The double-quotes inside do not need escaping because the delimiter is three quotes, so a single `"` inside is just a quote character, not the end of the string.

This is a preview feature in Java 13 and 14, and a standard feature in Java 15 and later. If you are on Java 15 or newer, you can use it directly. If you are on an older version, you cannot.

### How a Text Block Is Processed

When the compiler sees a text block, it processes the content in two main ways: **incidental whitespace removal** and **escape processing**.

#### Incidental Whitespace Removal

The content of a text block includes the newlines and the spaces that are part of your source code's indentation. The compiler strips the **incidental** leading whitespace so that the string content reflects the logical indentation you intend, not the indentation of the source file.

The rule is: the compiler finds the line with the least amount of leading whitespace among all the non-empty content lines (including the line with the closing `"""`), and it removes that amount of whitespace from the beginning of every line. What remains is the string content.

// The text block is indented to match the surrounding code.
// The compiler strips the common leading whitespace.
String html = """
    <!DOCTYPE html>
    <html>
        <body>
            <p>Hello</p>
        </body>
    </html>
    """;

In this example, the source lines inside the text block are indented to align with the surrounding code. The compiler finds the minimum indentation among the lines (the lines with `<html>`, `<body>`, etc. have more indentation, but the line with `"""` and the lines with the HTML tags all contribute to the common whitespace calculation) and strips it. The resulting string starts at the first non-whitespace character of each line after stripping.

The closing `"""` matters. Where you put it controls how much whitespace is stripped. If you put the closing `"""` at the start of a line with no leading whitespace, the minimum indentation is zero, and no whitespace is stripped — every line keeps its indentation exactly as you typed it. If you indent the closing `"""` to match the content, the common indentation is stripped.

This is a common source of confusion. The position of the closing delimiter controls the stripping. A good habit is to put the closing `"""` on its own line, aligned with the content you want to be leftmost, and to preview the resulting string if the exact whitespace matters.

#### Escape Processing

Text blocks still process escape sequences. `\n` is still a newline, `\t` is a tab, `\\` is a backslash, and `\"` is a double-quote. Even though you do not need to escape a `"` in most cases (because the delimiter is `"""`), you can still write `\"` if you want, and you still need `\\` to get a literal backslash and `\n` to get a newline.

This means a text block is not a "raw string." It still understands escape sequences. If you want a literal backslash followed by a `n`, you write `\\n`. If you want the actual characters backslash and `n`, that is `\\n`.

There is also a new escape sequence that is especially useful in text blocks: `\s`. This is a single space. It is used to prevent the stripping of trailing whitespace on a line. Normally, trailing whitespace on a line in a text block is removed. If you want a line to end with a space, you write `\s` at the end.

// \s prevents stripping of trailing whitespace on a line
String spaces = """
    line one   \s
    line two   \s
    """;

### When a Text Block Is Cleaner

Text blocks are especially clean for:

- **JSON, JSON-like data, and configuration snippets.**
- **HTML, XML, and other markup.**
- **SQL statements** that span multiple lines and are easier to read with indentation.
- **File paths and multiline messages** that are easier to read as a block.
- **Test data** — multiline expected output in assertions, for example.

They are less useful for short, single-line strings. If the string fits comfortably on one line, a regular string literal is fine. A text block is not a replacement for every string — it is a tool for multiline, structured text.

// A text block for a SQL query — readable and close to the real SQL
String query = """
    SELECT u.id, u.name, u.email
    FROM users u
    JOIN orders o ON o.user_id = u.id
    WHERE u.status = 'active'
      AND o.total > ?
    ORDER BY o.total DESC
    LIMIT 10
    """;

// A text block for JSON in a test assertion
String expected = """
    {
        "id": 1,
        "name": "Alice",
        "roles": ["admin", "user"]
    }
    """;

### When You Still Need Escaping

You still need to escape in a few cases:

- **A backslash that should be literal** — write `\\`.
- **A newline you want to insert explicitly** — write `\n`.
- **A double-quote inside text that might be ambiguous** — you usually do not need to escape a `"` in a text block, but if you have three quotes in a row inside the content, you need to escape at least one of them to avoid ending the block prematurely.
- **A trailing space you want to keep** — use `\s`.

// Escaping still matters in a text block
String path = """
    C:\\Users\\Alice\\Documents
    """;   // backslash must be escaped: \\ -> \

String withQuote = """
    He said, "hello"
    """;   // single quotes are fine inside a text block

String tricky = """
    a\"\"\"b
    """;   // three consecutive quotes — escape one to avoid ending the block

### The Indentation Gotcha

The most common mistake with text blocks is misunderstanding the indentation stripping. The compiler does not strip all indentation — it strips the **minimum** indentation across all lines (including the closing delimiter line). If you put the closing `"""` at the very left margin (no indentation), the minimum indentation is zero, and no whitespace is stripped — every line keeps its source-code indentation, which is usually not what you want.


**What this code does — step by step:**

1. WRONG: closing delimiter at the left margin — no stripping
2. The minimum indentation here is the 4 spaces before <html>, so 4 spaces are stripped from every line. If you put """ on its own line with ZERO leading spaces, the minimum is 0 and NOTHING is stripped.
3. CORRECT: closing delimiter aligned with the content you want to be leftmost
4. Minimum indentation is 4 spaces — stripped from every line. Result: <html> starts at column 0, <body> at column 4, etc.

The same code, clean:

```java
String wrong = """
    <html>
        <body>
            <p>Hello</p>
        </body>
    </html>
    """;   // closing delimiter indented — but wait, the leftmost line is "<html>" which has 4 spaces

String correct = """
    <html>
        <body>
            <p>Hello</p>
        </body>
    </html>
    """;   // the closing """ is indented 4 spaces — same as <html>
```

The fix is simple: always indent the closing `"""` to match the leftmost line of content you want in the final string, and preview the result if the exact whitespace matters.

### A Code Example — Text Blocks in Action

This example shows text blocks for JSON, HTML, SQL, and a multiline message, plus the common gotchas.


**What this code does — step by step:**

1. === JSON — a text block that looks like the real JSON ===
2. === HTML — readable markup, no escaping the tags ===
3. === SQL — a readable query with indentation ===
4. === A single-line text block — also works, but usually a regular string is fine ===
5. `System.out.println(single);` — "a short string" — note: includes the trailing newline
6. === Escaping — backslash still needs escaping ===
7. `System.out.println(path);` — C:\Users\Alice
8. === Three consecutive quotes — escape one to avoid ending the block ===
9. === Trailing whitespace — use \s to keep it ===
10. `System.out.println("[" + padded.split("\n")[0] + "]");` — shows trailing spaces are kept
11. === The indentation gotcha — closing delimiter position matters ===. If the closing """ is at column 0, NO whitespace is stripped.
12. The first line is "<html>" with no leading spaces (4 spaces stripped)
13. If we put """ at column 0:
14. The first line is " <html>" — 4 leading spaces remain

The same code, clean:

```java
public class TextBlockDemo {
    public static void main(String[] args) {

        String json = """
            {
                "user": "Alice",
                "email": "alice@example.com",
                "roles": ["admin", "user"]
            }
            """;
        System.out.println(json);

        String html = """
            <!DOCTYPE html>
            <html>
                <head><title>Home</title></head>
                <body>
                    <h1>Hello, World</h1>
                </body>
            </html>
            """;
        System.out.println(html);

        String sql = """
            SELECT id, name, email
            FROM users
            WHERE status = ?
              AND created_at > ?
            ORDER BY created_at DESC
            """;

        String single = """
            a short string
            """;
        System.out.println(single);

        String path = """
            C:\\Users\\Alice
            """;
        System.out.println(path);

        String threeQuotes = """
            He said, \"\"\"hello\"\"\"
            """;
        System.out.println(threeQuotes);

        String padded = """
            column1  \s
            column2  \s
            """;
        System.out.println("[" + padded.split("\n")[0] + "]");

        String gotcha = """
            <html>
                <body>
                    <p>Hello</p>
                </body>
            </html>
            """;   // closing """ is indented 4 spaces → minimum 4 spaces stripped
        System.out.println("gotcha first line: '" + gotcha.split("\n")[0] + "'");

        String gotcha2 = """
            <html>
                <body>
                    <p>Hello</p>
                </body>
            </html>
""";   // closing """ at column 0 → minimum indentation is 0 → NO stripping
        System.out.println("gotcha2 first line: '" + gotcha2.split("\n")[0] + "'");
    }
}
```

Line by line:

- **`String json = """ ... """;`** — a text block for JSON. The content is indented to match the code, but the compiler strips the common indentation, so the resulting string has `{"user":` starting at column 0.
- **`String html = """ ... """;`** — a text block for HTML. No escaping of `<` or `>` or `"`. The newlines are part of the string.
- **`String sql = """ ... """;`** — a readable SQL query. The indentation makes the query easy to read and maintain.
- **`String single = """ ... """;`** — a text block can be a single line, but it still includes the newline after the opening `"""` and before the closing `"""`. The result is `"a short string\n"`. For a single-line string, a regular literal is usually cleaner.
- **`String path = """ ... """;`** — backslashes must still be escaped. `\\` becomes `\` in the resulting string.
- **`String threeQuotes = """ ... """;`** — three consecutive double-quotes inside a text block would end the block, so you escape at least one of them: `\"\"\"`.
- **`\s`** — keeps trailing whitespace on a line. Without it, trailing spaces are stripped.
- **Indentation gotcha** — the closing `"""` position controls stripping. In `gotcha`, the closing `"""` is indented 4 spaces, matching the `<html>` line, so 4 spaces are stripped from every line. In `gotcha2`, the closing `"""` is at column 0, so the minimum indentation is 0 and no whitespace is stripped — the first line keeps its 4 leading spaces.

## Where This Shows Up in an Organization

In a backend team, text blocks appear in several places.

First, **SQL queries embedded in Java code.** A long SQL query is much more readable as a text block than as a concatenated string. You can format it like the SQL you would write in a database tool, with indentation that reflects the structure of the query. This is a big readability win.

String query = """
    SELECT u.id, u.name, o.total, o.created_at
    FROM users u
    JOIN orders o ON o.user_id = u.id
    WHERE u.status = :status
      AND o.created_at >= :since
    ORDER BY o.created_at DESC
    """;

Second, **JSON and JSON-like test data.** When you write a test that checks a JSON response, the expected JSON is much cleaner as a text block. You can format it with indentation and not worry about escaping every quote.

String expected = """
    {
        "id": 1,
        "name": "Alice",
        "email": "alice@example.com"
    }
    """;

Third, **embedded documents and templates.** Small HTML templates, email bodies, RFC 7807 problem details, and other structured text are clearer as text blocks.

One caution: text blocks are for **static** text. If you need to build dynamic text with variables, use `String.formatted()` (Java 15+) or a template engine for larger templates. A text block with too many embedded variables becomes hard to read — the point of a text block is that the static structure is visible and clean.

// Build dynamic text with formatted()
String greeting = """
    Hello, %s!
    Welcome to %s.
    Your account was created on %s.
    """.formatted("Alice", "BackendForge", "2025-01-15");

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Putting the closing `"""` at column 0 and getting unexpected leading whitespace | Not understanding that the closing delimiter controls stripping | Indent the closing `"""` to match the leftmost content line you want, and preview the result |
| Expecting a single-line text block to have no newline | A text block always includes the newlines between the opening and closing delimiters | For a single-line string without a trailing newline, use a regular string literal, or trim the result |
| Trying to use a text block on Java 14 or older | Text blocks became standard in Java 15 | Check the Java version; on older versions, use concatenation or a separate tool |
| Overusing text blocks for dynamic content | A text block with many embedded variables loses the readability benefit | Use `String.formatted()` or a template engine for dynamic content; reserve text blocks for static structured text |
| Forgetting that `\\` is still needed for a literal backslash | Text blocks process escape sequences | Write `\\` for a literal backslash, `\n` for a newline, `\"` for a literal quote (even though it is usually optional) |
| Embedding a literal `"""` inside a text block and not escaping one of them | Three consecutive quotes would end the block | Escape at least one quote: `\"\"\"` |
| Using text blocks for very long templates where a real template engine would be better | A text block is fine for short to medium structured text | For large templates (emails, reports, pages), use a template engine like Thymeleaf, FreeMarker, or Mustache |

## For the Practice Lab

In the lab, you will see a helper that builds an HTML email body using string concatenation with explicit `\n` and escaped quotes. Rewrite it as a text block, then add a JSON payload as a text block. Then break the indentation deliberately by moving the closing `"""` to column 0 and observe the extra leading whitespace in the output. Finally, add a `\s` to one line to preserve trailing spaces and print the result with visible markers so you can see the difference.

## Summary

A text block is a multiline string literal delimited by `"""`. It is cleaner than concatenation and escaping for JSON, HTML, SQL, and other structured multiline text. The compiler strips incidental leading whitespace based on the minimum indentation across all lines, including the closing delimiter — so the position of the closing `"""` controls the result. Escape sequences still apply: `\\` for a backslash, `\n` for a newline, `\"` for a quote (usually optional inside a text block but needed for three consecutive quotes), and `\s` to preserve trailing whitespace. Text blocks are standard in Java 15 and later. Use them for static structured text; use `String.formatted()` or a template engine for dynamic content.

