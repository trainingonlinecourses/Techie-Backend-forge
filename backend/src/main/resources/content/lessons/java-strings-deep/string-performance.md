---
title: String Performance — Pitfalls and Patterns
module: java-strings-deep
order: 5
minutes: 24
topics: ["performance", "substring", "split", "regex", "deduplication", "compact strings"]
docs:
  - title: "Compact Strings (JEP 254)"
    url: "https://openjdk.org/jeps/254"
---

# String Performance — Pitfalls and Patterns

## The Concept: Strings Are Cheap to Use, Expensive to Abuse

Strings look like a simple value type, but under the hood every one is a heap object with an array of characters. A program that builds and copies strings carelessly can spend more time allocating, copying, and garbage-collecting than doing actual work. This lesson is about the **specific patterns** where string code goes from fast to slow — and what to do instead.

The four classic trouble spots:

1. **Concatenation in loops** — quadratic copying (solved by `StringBuilder`, previous lesson).
2. **`split` / `replaceAll` with regex** — regex compilation on every call.
3. **`substring` copies** — in modern Java, `substring` copies the characters, so slicing huge strings repeatedly is O(n) each time.
4. **Duplicate strings in memory** — hundreds of thousands of identical strings (e.g., status labels read from a file) each occupy their own object.

## How Modern Java Stores Strings (Compact Strings)

Since Java 9 (JEP 254), a `String` stores characters as **bytes** in either Latin-1 (1 byte per char) or UTF-16 (2 bytes per char), choosing whichever fits. If every character in the string fits in one byte (typical for English text), the string uses **half the memory** of the old design. This is automatic — you just benefit. It also means the internal array is `byte[]`, not `char[]` (a fact that matters only if you're doing reflection-based tricks, which you shouldn't).

## The Code Walkthrough

```java
import java.util.Arrays;
import java.util.regex.Pattern;

public class StringPerfDemo {

    public static void main(String[] args) {
        // --- Pattern 1: precompile regex ---
        // SLOW: compiles the regex on every call
        long t0 = System.nanoTime();
        for (int i = 0; i < 10_000; i++) {
            "a,b,c".split(",");          // "," is fine, but complex regexes are NOT
        }
        long t1 = System.nanoTime();

        // FAST: compile once, reuse
        Pattern COMMA = Pattern.compile(",");
        for (int i = 0; i < 10_000; i++) {
            COMMA.split("a,b,c");
        }
        long t2 = System.nanoTime();
        System.out.println("regex-per-call: " + (t1 - t0) / 1_000_000 + "ms");
        System.out.println("precompiled:    " + (t2 - t1) / 1_000_000 + "ms");

        // --- Pattern 2: split is regex — use indexOf for simple splits ---
        String line = "user:pass:host:port";
        // Fast manual split on a simple delimiter
        int first = line.indexOf(':');
        String user = line.substring(0, first);
        String rest = line.substring(first + 1);
        System.out.println(user);   // user

        // --- Pattern 3: building output once, not piecemeal ---
        // SLOW: one String per iteration (do not do this)
        // String out = "";
        // for (...) { out += row; }        // quadratic!

        // FAST: build in a list, join once
        java.util.List<String> rows = java.util.List.of("r1", "r2", "r3");
        String out = String.join("\n", rows);   // single pass join
        System.out.println(out);

        // --- Pattern 4: deduplicate repeated identical strings ---
        // Simulates reading 100k identical status labels
        // Without dedup: 100k objects. With intern(): 1 object.
        String label = new String("ACTIVE");   // simulate data from a file
        String pooled = label.intern();        // collapse to one canonical object
        System.out.println(pooled == "ACTIVE"); // true — same object now
    }
}
```

### Walking Through Each Part

**Pattern 1 — precompile the regex.** `String.split`, `replaceAll`, `matches` all take a *regex string*. Each call compiles it into an internal pattern object — that compilation is expensive (it builds an automaton). The fix: `Pattern.compile(regex)` once, store it in a static field, and call `pattern.split(...)`. For a regex used in a hot loop this is often a **10–100× speedup**. For trivial delimiters like `","`, Java has a fast path (it's not really regex), but don't rely on that for anything more complex.

**Pattern 2 — `split` is always regex.** Even `","` goes through the regex machinery (with a fast-path optimization). When you're splitting on a plain literal, you can beat it with `indexOf` + `substring` — especially when you only need the **first** field rather than all of them. `indexOf` scans once; `split` allocates an array plus a substring per field.

**Pattern 3 — `String.join`.** For a known collection of parts, `String.join(delim, parts)` builds the result in one pass with a single `StringBuilder` internally. This replaces both the manual loop-with-`+=` and the manual builder ceremony for simple cases.

**Pattern 4 — interning duplicates.** When the same string value appears thousands of times (status codes, country names, enum-like labels from a database), each is a separate object. `intern()` collapses them to one canonical instance. But as noted in the string-pool lesson, **use with care**: interned strings are never collected, so only intern strings from a small bounded set.

## The substring Trap (Why It's Different Now)

**Old Java (≤ 7u6):** `substring` shared the parent's character array, just with different offsets — so `"a very long text".substring(0, 5)` kept a reference to the *entire* original array. Holding one small substring could pin megabytes of the original string in memory.

**Modern Java:** `substring` copies the needed characters into a new array. This is safer (no memory pinning) but means **each substring is an O(n) copy**. If you slice a large string into many small pieces, you pay a copy per slice. When that matters, the standard remedy is to work with offsets/lengths over the original (e.g., `CharSequence` views or parsing with indexes) rather than materializing dozens of substrings.

## String Deduplication in the GC (Free Win)

The JVM flag `-XX:+UseStringDeduplication` (used with G1 GC) automatically deduplicates strings that are **about to become garbage**: when two strings have identical content, the GC merges them, freeing one backing array. This is a *passive* optimization that requires no code changes and can shrink heap usage meaningfully in string-heavy apps. Enable it on the command line:

```
java -XX:+UseStringDeduplication -jar app.jar
```

## When to Reach for Alternatives

| Need | Use | Why |
|---|---|---|
| Heavy text processing / streaming | `StringReader`, `BufferedReader`, `InputStreamReader` | No giant intermediate strings |
| Large documents, many appends across methods | `StringBuilder` passed around (carefully) | In-place mutation |
| Binary data | `byte[]` / `ByteBuffer` | No charset conversion overhead |
| Bounded set of known values | `enum` (not strings) | Type safety + no allocation |

## Common Beginner Pitfalls

1. **`+=` inside a loop** — quadratic; hoist a `StringBuilder`.
2. **Complex regex in a hot path without `Pattern.compile`** — compile once.
3. **Using `split` when you only need the first field** — `indexOf`/`substring` is faster and clearer.
4. **Slicing huge strings into many substrings** — each slice copies; consider index-based parsing.
5. **Interning arbitrary user input** — unbounded pool growth, memory leak.

## Key Takeaways

- Concatenation in loops is the #1 string performance killer — use `StringBuilder`.
- Precompile regexes with `Pattern.compile` for repeated use.
- `split` is regex; use `indexOf` for simple literal splits when you need few fields.
- `String.join` builds lists of parts in one pass.
- Modern `substring` copies — slice sparingly.
- Compact strings (Java 9+) halve memory for Latin-1 text automatically; `-XX:+UseStringDeduplication` is a free win.
