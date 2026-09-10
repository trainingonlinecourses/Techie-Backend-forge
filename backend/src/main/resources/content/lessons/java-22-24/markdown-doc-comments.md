---
title: Java 23 — Markdown Documentation Comments (JEP 467)
summary: Java 23 lets you write javadoc comments in Markdown with /// instead of HTML tags. Your API documentation becomes as easy to write as a README — and renders beautifully.
order: 2
minutes: 7
topics: [Java 23, JEP 467, Documentation, Tooling]
docs:
  - url: https://openjdk.org/jeps/467
    title: JEP 467 — Markdown Documentation Comments
capstone: false
---

## The idea in one sentence

For 25+ years, documentation comments meant memorizing HTML: `<p>`, `@param`, `<code>`. **Java 23 (JEP 467)** adds a second syntax — `///` comments written in **Markdown** — so documenting code feels like writing a README.

## What this code does — step by step

1. Lines starting with `///` are documentation comments in Markdown (note: **three** slashes, not two).
2. Inside them you write plain Markdown: `#` headings, `*` lists, backticks for code — no HTML tags needed.
3. The old `/** ... */` style keeps working; the two can coexist in the same codebase.
4. `javadoc` renders both; IDEs show both on hover.

```java
/// A tiny utility for converting temperatures.
///
/// ### Example
///
/// ```java
/// double f = Convert.cToF(100);  // 212.0
/// ```
///
/// *See also: [Convert.cToF](#cToF(double))*
public class Convert {

    /// Converts Celsius to Fahrenheit.
    ///
    /// * `celsius` — the temperature in °C
    /// * returns the temperature in °F
    static double cToF(double celsius) {
        return celsius * 9 / 5 + 32;
    }

    public static void main(String[] args) {
        // The docs above describe this call — hover it in an IDE to see them.
        System.out.println("Step 1: 100°C is " + cToF(100) + "°F");
        System.out.println("Step 2: 0°C is " + cToF(0) + "°F");
        // Step 3: run `javadoc Convert.java` to generate the HTML/Markdown docs.
    }
}
```

## Why this matters for learners

- **Read real code faster**: the JDK's own sources are migrating to `///` — you'll meet them everywhere.
- **Write docs you actually maintain**: Markdown is what you already write in GitHub PRs.
- **No angle-bracket escaping**: documenting generics no longer means fighting HTML.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Writing `//` instead of `///` | It's just a normal comment — javadoc ignores it | Use three slashes |
| Mixing HTML tags inside `///` | Renders literally as text | Use Markdown syntax |
| Expecting older javadoc toolchains to render it | Pre-23 tools skip `///` comments | Generate docs with JDK 23+ |

## Try it yourself

Change the temperature conversion to feet→meters, write `///` docs for your new method with one list item and one code fence, then run it.

## References

- [OpenJDK — JEP 467](https://openjdk.org/jeps/467)
- [dev.java — the official OpenJDK site](https://dev.java/)
- [inside.java — the Java team at Oracle](https://inside.java/)
