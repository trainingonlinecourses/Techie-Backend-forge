---
title: NumberFormatException — Parsing Failures and Safe Conversion
summary: What causes NumberFormatException, safe parsing with try-catch, optional-based parsing, input validation patterns, and locale-aware number parsing.
order: 5
minutes: 10
topics: [numberformatexception, parsing, validation, optional, locale, safe-conversion]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/NumberFormatException.html
---

## The Concept, From Zero

`NumberFormatException` is thrown when you try to parse a string that isn't a valid number. It's one of the most common runtime exceptions in Java.

```java
int num = Integer.parseInt("42");   // OK
int bad = Integer.parseInt("abc");  // NumberFormatException!
int also = Integer.parseInt("12.5"); // NumberFormatException — no decimals for int
```

---

## Safe Parsing Patterns

### Try-Catch

```java
try {
    int value = Integer.parseInt(input);
} catch (NumberFormatException e) {
    System.out.println("Invalid number: " + input);
}
```

### Optional-Based

```java
Optional<Integer> parsed = Optional.ofNullable(input)
    .filter(s -> !s.isBlank())
    .flatMap(s -> {
        try { return Optional.of(Integer.parseInt(s)); }
        catch (NumberFormatException e) { return Optional.empty(); }
    });

int value = parsed.orElse(0);  // default to 0
```

### Apache Commons / Guava

```java
// Apache Commons Lang
int value = NumberUtils.toInt(input, -1);  // returns -1 if invalid

// Google Guava
try {
    int value = Ints.tryParse(input);  // returns null if invalid
} catch (Exception e) { ... }
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class NumberParsingDemo {
    public static void main(String[] args) {
        // 1. Common failure cases
        String[] inputs = {"42", "abc", "12.5", "", null, "  42  ", "1,000"};
        for (String input : inputs) {
            System.out.println("Parsing: \"" + input + "\"");
            System.out.println("  parseInt: " + safeParseInt(input));
            System.out.println("  parseLong: " + safeParseLong(input));
        }

        // 2. Locale-aware parsing
        String european = "1.234,56";
        java.text.NumberFormat fmt = java.text.NumberFormat.getInstance(Locale.GERMANY);
        try {
            Number num = fmt.parse(european);
            System.out.println("German format: " + num.doubleValue());  // 1234.56
        } catch (java.text.ParseException e) {
            System.out.println("Parse error: " + e.getMessage());
        }

        // 3. Parsing with validation
        String age = "25";
        if (isValidAge(age)) {
            System.out.println("Valid age: " + Integer.parseInt(age));
        }
    }

    static int safeParseInt(String s) {
        if (s == null || s.isBlank()) return -1;
        try {
            return Integer.parseInt(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    static long safeParseLong(String s) {
        if (s == null || s.isBlank()) return -1L;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return -1L;
        }
    }

    static boolean isValidAge(String s) {
        try {
            int age = Integer.parseInt(s.trim());
            return age >= 0 && age <= 150;
        } catch (NumberFormatException e) {
            return false;
        }
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Parsing without try-catch | Unhandled exception | Always wrap in try-catch |
| Using `==` to compare parsed strings | Compares objects not values | Use `.equals()` |
| Not trimming whitespace | " 42 " fails parseInt | Trim before parsing |
| Ignoring locale | "1,234" fails in US locale | Use locale-aware parsing |
| Parsing user input without validation | Security risk (injection) | Validate range after parsing |
