---
title: Java 23–24 — The Rest of the Train (Primitive Patterns, Module Imports, Compact Files)
summary: A quick tour of the remaining Java 23 and 24 highlights: primitive type patterns (5th preview), import Java.base.*, and compact source files that let beginners write real programs without the ceremony.
order: 5
minutes: 9
topics: [Java 23, Java 24, Primitive Patterns, Module Imports, Compact Source Files]
docs:
  - url: https://openjdk.org/projects/jdk/24/
    title: JDK 24 — all JEPs
capstone: false
---

## The idea in one sentence

Not every feature needs a full lesson. Java 23 and 24 shipped a batch of quality-of-life changes that make Java easier to *start* with and nicer to *write* — here are the three you'll meet first.

## What this code does — step by step

1. **Module import declarations (JEP 511)**: `import module java.base;` pulls in everything from the `java.base` module — no more ten-line import blocks for `List`, `Map`, `Path`, `Instant` and friends.
2. **Compact source files (JEP 512)**: on Java 25 (preview in 23/24) a `main` method can live directly in a class with no `public static void main(String[] args)` ceremony and no explicit class declaration.
3. **Primitive patterns (JEP 507)**: `switch` can now match on primitive values with guards — `case int i when i > 0`.

```java
// NOTE: run with JDK 23+ for import module, JDK 25 for the truly compact form.
// The browser simulator runs the classic equivalent below.

// 1. Module imports — one line replaces many:
//    import module java.base;   // java.util.*, java.time.*, java.nio.* ... all in

// 2. Compact source file (JDK 25+):
//    void main() {
//        IO.println("no class, no String[] args ceremony");
//    }

public class ModernBasicsDemo {
    public static void main(String[] args) {
        // 3. Primitive patterns with guards (pattern matching for switch, extended
        //    by JEP 507 to primitive types — preview in 23–25):
        int score = 85;
        String grade = switch (score) {
            case int i when i >= 90 -> "A";
            case int i when i >= 80 -> "B";
            case int i when i >= 70 -> "C";
            default -> "keep practicing";
        };
        System.out.println("Step 1: score " + score + " earns grade " + grade);

        // 4. What compact files + module imports mean together: a first program that
        //    used to be 7 lines of ceremony becomes 1 line of logic.
        System.out.println("Step 2: 'public class ... main(String[] args)' — ceremony you'll stop writing");
    }
}
```

## The one-paragraph version history

Java 1 (1995): applets and `Applet` classes. Java 5: generics, enums, for-each. Java 8: lambdas and streams — the biggest shift in the language's history. Java 9: modules. Java 11 & 17: LTS cleanups, `var`, records, sealed types. Java 21: virtual threads — the biggest runtime shift since Java 8. Java 22–26: the *learnability* releases — underscores, Markdown docs, gatherers, compact files — plus AOT performance.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Using `import module` on JDK 21 | Compile error | Feature is Java 22+ (final in 25) |
| Writing `void main()` without enabling previews | Compile error before Java 25 | Use the classic `main` form |
| Treating preview features as stable API | Code breaks at the next release | Learn them, pin your build, migrate when finalized |

## Try it yourself

Extend the grade switch with an `A+` band at 97+, then rewrite it with `if/else` and compare which reads better. Run with **Ctrl+Enter**.

## References

- [OpenJDK](https://openjdk.org/projects/jdk/24/)
- [dev.java — the official OpenJDK site](https://dev.java/)
- [inside.java — the Java team at Oracle](https://inside.java/)
