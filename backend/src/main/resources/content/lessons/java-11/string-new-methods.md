---
title: String New Methods — Everyday String Operations Made Easy
summary: strip(), isBlank(), lines(), repeat(), and how they replace verbose pre-Java 11 patterns.
order: 3
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

```java
// PRE-JAVA 11: Only removes ASCII whitespace
"  hello  ".trim()                    // "hello"

// JAVA 11: Also removes Unicode whitespace (non-breaking spaces, etc.)
"  hello  ".strip()                   // "hello"
"  hello  ".stripLeading()            // "hello  "
"  hello  ".stripTrailing()           // "  hello"
"\u2000hello\u2000".strip()           // "hello"  (trim() would NOT remove \u2000)
```

### isBlank() — Check for empty or whitespace-only

```java
// PRE-JAVA 11
"".isEmpty()                           // true
"   ".isEmpty()                        // false! — has whitespace
"   ".trim().isEmpty()                 // true — but verbose

// JAVA 11
"".isBlank()                           // true
"   ".isBlank()                        // true — includes whitespace-only
"  hello  ".isBlank()                  // false
```

### lines() — Split on line breaks

```java
// PRE-JAVA 11
String[] lines = "line1\nline2\nline3".split("\\n");  // regex-based

// JAVA 11
Stream<String> lines = "line1\nline2\nline3".lines();  // returns a Stream
List<String> lineList = "line1\nline2\nline3".lines().toList();

// Handles \n, \r\n, and \r
"line1\r\nline2\nline3".lines().toList();  // ["line1", "line2", "line3"]
```

### repeat() — Repeat a string N times

```java
// PRE-JAVA 11
String repeated = String.join("", Collections.nCopies(5, "-"));  // "-----"

// JAVA 11
"-".repeat(5)                          // "-----"
"abc".repeat(3)                        // "abcabcabc"
" ".repeat(10)                         // "          "
```

---

## Line-by-Line Walkthrough

```java
public class StringMethodsDemo {
    public static void main(String[] args) {
        // --- strip() ---
        String padded = "   Hello, World!   ";
        System.out.println(padded.strip());           // "Hello, World!"
        System.out.println(padded.stripLeading());    // "Hello, World!   "
        System.out.println(padded.stripTrailing());   // "   Hello, World!"
        System.out.println(padded.trim());             // "Hello, World!" (same for ASCII)

        // Unicode example
        String unicodePadded = "\u00A0Hello\u00A0";   // \u00A0 = non-breaking space
        System.out.println(unicodePadded.strip());    // "Hello" — trim() would fail

        // --- isBlank() ---
        System.out.println("".isBlank());             // true
        System.out.println("   ".isBlank());          // true
        System.out.println(" a ".isBlank());          // false
        System.out.println("hello".isBlank());        // false

        // Practical use: filtering empty lines
        String csv = "name,age\n\nAlice,30\n\nBob,25\n";
        var dataLines = csv.lines()
            .filter(line -> !line.isBlank())           // remove empty/whitespace lines
            .toList();
        // ["name,age", "Alice,30", "Bob,25"]

        // --- lines() ---
        String multiline = "First line\nSecond line\nThird line";
        var lines = multiline.lines().toList();
        System.out.println(lines);  // [First line, Second line, Third line]

        // Process each line
        multiline.lines()
            .map(String::strip)
            .filter(line -> !line.isBlank())
            .forEach(System.out::println);

        // --- repeat() ---
        System.out.println("=".repeat(50));           // "=================================================="
        System.out.println("  ".repeat(4) + "Indented");  // "        Indented"
        System.out.println("-".repeat(20));            // "--------------------"

        // Practical: generating SQL placeholders
        int count = 5;
        String placeholders = "?, ".repeat(count).stripTrailing();
        System.out.println(placeholders);              // "?, ?, ?, ?, ?"

        String sql = "SELECT * FROM users WHERE id IN (" + placeholders + ")";
        System.out.println(sql);
        // "SELECT * FROM users WHERE id IN (?, ?, ?, ?, ?)"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Parsing configuration files

```java
public Map<String, String> parseConfig(Path configFile) throws IOException {
    return Files.readString(configFile).lines()         // Java 11: lines()
        .map(String::strip)                             // Java 11: strip()
        .filter(line -> !line.isBlank())                // Java 11: isBlank()
        .filter(line -> !line.startsWith("#"))          // skip comments
        .filter(line -> line.contains("="))             // key=value pairs
        .collect(Collectors.toMap(
            line -> line.substring(0, line.indexOf("=")).strip(),
            line -> line.substring(line.indexOf("=") + 1).strip()
        ));
}
```

### Scenario 2: Generating formatted output

```java
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
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `trim()` instead of `strip()` | Doesn't handle Unicode whitespace | Use `strip()` in Java 11+ |
| Using `isEmpty()` where `isBlank()` is needed | `"  ".isEmpty()` is false | Use `isBlank()` for whitespace check |
| Splitting with `split("\n")` | Misses `\r\n` on Windows | Use `lines()` which handles all line endings |
