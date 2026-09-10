---
title: String New Methods — Everyday String Operations Made Easy
summary: strip(), isBlank(), lines(), repeat(), and how they replace verbose pre-Java 11 patterns.
order: 4
minutes: 15
topics: [string, strip, isblank, lines, repeat, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/lang/String.html
---

## The Concept, From Zero

Java 11 added several frequently-needed String methods. Before Java 11, developers wrote verbose one-liners for common operations that other languages handled natively.

---

## The New Methods

### strip() — Unicode-aware trimming


**What this code does — step by step:**

1. PRE-JAVA 11: Only removes ASCII whitespace
2. `"  hello  ".trim()` — "hello"
3. JAVA 11: Also removes Unicode whitespace (non-breaking spaces, etc.)
4. `"  hello  ".strip()` — "hello"
5. `"  hello  ".stripLeading()` — "hello "
6. `"  hello  ".stripTrailing()` — " hello"
7. `"\u2000hello\u2000".strip()` — "hello" (trim() would NOT remove \u2000)

The same code, clean:

```java
"  hello  ".trim()

"  hello  ".strip()
"  hello  ".stripLeading()
"  hello  ".stripTrailing()
"\u2000hello\u2000".strip()
```

### isBlank() — Check for empty or whitespace-only


**What this code does — step by step:**

1. PRE-JAVA 11
2. `"".isEmpty()` — true
3. `"   ".isEmpty()` — false! — has whitespace
4. `"   ".trim().isEmpty()` — true — but verbose
5. JAVA 11
6. `"".isBlank()` — true
7. `"   ".isBlank()` — true — includes whitespace-only
8. `"  hello  ".isBlank()` — false

The same code, clean:

```java
"".isEmpty()
"   ".isEmpty()
"   ".trim().isEmpty()

"".isBlank()
"   ".isBlank()
"  hello  ".isBlank()
```

### lines() — Split on line breaks


**What this code does — step by step:**

1. PRE-JAVA 11
2. `String[] lines = "line1\nline2\nline3".split("\\n");` — regex-based
3. JAVA 11
4. `Stream<String> lines = "line1\nline2\nline3".lines();` — returns a Stream
5. Handles \n, \r\n, and \r
6. `"line1\r\nline2\nline3".lines().toList();` — ["line1", "line2", "line3"]

The same code, clean:

```java
String[] lines = "line1\nline2\nline3".split("\\n");

Stream<String> lines = "line1\nline2\nline3".lines();
List<String> lineList = "line1\nline2\nline3".lines().toList();

"line1\r\nline2\nline3".lines().toList();
```

### repeat() — Repeat a string N times


**What this code does — step by step:**

1. PRE-JAVA 11
2. `String repeated = String.join("", Collections.nCopies(5, "-"));` — "-----"
3. JAVA 11
4. `"-".repeat(5)` — "-----"
5. `"abc".repeat(3)` — "abcabcabc"
6. `" ".repeat(10)` — " "

The same code, clean:

```java
String repeated = String.join("", Collections.nCopies(5, "-"));

"-".repeat(5)
"abc".repeat(3)
" ".repeat(10)
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. --- strip() ---
2. `System.out.println(padded.strip());` — "Hello, World!"
3. `System.out.println(padded.stripLeading());` — "Hello, World! "
4. `System.out.println(padded.stripTrailing());` — " Hello, World!"
5. `System.out.println(padded.trim());` — "Hello, World!" (same for ASCII)
6. Unicode example
7. `String unicodePadded = "\u00A0Hello\u00A0";` — \u00A0 = non-breaking space
8. `System.out.println(unicodePadded.strip());` — "Hello" — trim() would fail
9. --- isBlank() ---
10. `System.out.println("".isBlank());` — true
11. `System.out.println("   ".isBlank());` — true
12. `System.out.println(" a ".isBlank());` — false
13. `System.out.println("hello".isBlank());` — false
14. Practical use: filtering empty lines
15. `.filter(line -> !line.isBlank())` — remove empty/whitespace lines
16. ["name,age", "Alice,30", "Bob,25"]
17. --- lines() ---
18. `System.out.println(lines);` — [First line, Second line, Third line]
19. Process each line
20. --- repeat() ---
21. `System.out.println("=".repeat(50));` — "=================================================="
22. `System.out.println("  ".repeat(4) + "Indented");` — " Indented"
23. `System.out.println("-".repeat(20));` — "--------------------"
24. Practical: generating SQL placeholders
25. `System.out.println(placeholders);` — "?, ?, ?, ?, ?"
26. "SELECT * FROM users WHERE id IN (?, ?, ?, ?, ?)"

The same code, clean:

```java
public class StringMethodsDemo {
    public static void main(String[] args) {
        String padded = "   Hello, World!   ";
        System.out.println(padded.strip());
        System.out.println(padded.stripLeading());
        System.out.println(padded.stripTrailing());
        System.out.println(padded.trim());

        String unicodePadded = "\u00A0Hello\u00A0";
        System.out.println(unicodePadded.strip());

        System.out.println("".isBlank());
        System.out.println("   ".isBlank());
        System.out.println(" a ".isBlank());
        System.out.println("hello".isBlank());

        String csv = "name,age\n\nAlice,30\n\nBob,25\n";
        var dataLines = csv.lines()
            .filter(line -> !line.isBlank())
            .toList();

        String multiline = "First line\nSecond line\nThird line";
        var lines = multiline.lines().toList();
        System.out.println(lines);

        multiline.lines()
            .map(String::strip)
            .filter(line -> !line.isBlank())
            .forEach(System.out::println);

        System.out.println("=".repeat(50));
        System.out.println("  ".repeat(4) + "Indented");
        System.out.println("-".repeat(20));

        int count = 5;
        String placeholders = "?, ".repeat(count).stripTrailing();
        System.out.println(placeholders);

        String sql = "SELECT * FROM users WHERE id IN (" + placeholders + ")";
        System.out.println(sql);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Parsing configuration files


**What this code does — step by step:**

1. `return Files.readString(configFile).lines()` — Java 11: lines()
2. `.map(String::strip)` — Java 11: strip()
3. `.filter(line -> !line.isBlank())` — Java 11: isBlank()
4. `.filter(line -> !line.startsWith("#"))` — skip comments
5. `.filter(line -> line.contains("="))` — key=value pairs

The same code, clean:

```java
public Map<String, String> parseConfig(Path configFile) throws IOException {
    return Files.readString(configFile).lines()
        .map(String::strip)
        .filter(line -> !line.isBlank())
        .filter(line -> !line.startsWith("#"))
        .filter(line -> line.contains("="))
        .collect(Collectors.toMap(
            line -> line.substring(0, line.indexOf("=")).strip(),
            line -> line.substring(line.indexOf("=") + 1).strip()
        ));
}
```

### Scenario 2: Generating formatted output

public String formatTable(List<String[]> rows, int[] columnWidths) {
    StringBuilder sb = new StringBuilder();
    for (int i = 0; i < columnWidths.length; i++) {
        sb.append("-".repeat(columnWidths[i]));  // Java 11: repeat()
        if (i < columnWidths.length - 1) sb.append("+");
    }
    sb.append("\n");
    // ... format rows
    return sb.toString();
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `trim()` instead of `strip()` | Doesn't handle Unicode whitespace | Use `strip()` in Java 11+ |
| Using `isEmpty()` where `isBlank()` is needed | `"  ".isEmpty()` is false | Use `isBlank()` for whitespace check |
| Splitting with `split("\n")` | Misses `\r\n` on Windows | Use `lines()` which handles all line endings |

## References

- [dev.java — the official OpenJDK site](https://dev.java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/11/docs/api/)
