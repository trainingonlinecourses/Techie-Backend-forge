---
title: StringBuilder, StringBuffer & StringJoiner — Efficient String Building
summary: Why string concatenation in loops is slow, StringBuilder vs StringBuffer (thread-safety cost), StringJoiner for delimiters, and the org patterns.
order: 35
minutes: 17
topics: [stringbuilder, stringbuffer, stringjoiner, string-concatenation, mutable-string, delimiter]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/StringBuilder.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/StringJoiner.html
---

# StringBuilder, StringBuffer & StringJoiner — Efficient String Building

## The concept: strings are immutable; concatenation copies

`String` is immutable — every `+` creates a **new** string by copying both operands. In a loop, that's O(n²):

```java
// WRONG — each iteration allocates a new String and copies everything so far
String csv = "";
for (Order o : orders) {
    csv += o.id() + ",";        // O(n²) copies — a 100k-order loop is 10^10 char copies
}

// RIGHT — one mutable buffer, appends in place
StringBuilder csv = new StringBuilder(orders.size() * 8);   // pre-size: avoid regrowth
for (Order o : orders) {
    csv.append(o.id()).append(',');
}
```

The single-threaded **`StringBuilder`** is the standard mutable string builder. **`StringBuffer`** is its thread-safe twin — every method synchronized — which costs performance for zero benefit in single-threaded code. **The org rule: `StringBuilder` by default; `StringBuffer` only for genuinely shared, mutable, multi-threaded buffers (nearly never).**

## When + is fine (and when it isn't)

- **`+` on a single expression** — the compiler optimizes constant and single-line concatenations into one `StringBuilder` anyway: `"Order " + id + " created"` compiles to a single builder append chain. No need to hand-roll.
- **`+` in a loop** — the compiler creates a *new* builder each iteration, so the O(n²) cost returns. This is the case to convert to an explicit builder.
- **The review rule:** concatenation in a loop → `StringBuilder`; everything else → plain `+` for readability.

## StringJoiner and Collectors.joining — delimiters done right

Building "a, b, c" or "key=value" strings by hand is error-prone (the trailing-delimiter bug). The standard tools:

```java
// StringJoiner — explicit prefix/suffix/delimiter
StringJoiner joiner = new StringJoiner(", ", "[", "]");   // delimiter, prefix, suffix
joiner.add("a").add("b").add("c");
joiner.toString();                        // "[a, b, c]" — no trailing comma, ever

// Collectors.joining — the stream form (the one teams use most)
String csv = orders.stream()
    .map(o -> String.valueOf(o.id()))
    .collect(Collectors.joining(", "));   // "1, 2, 3" — handles empty → ""

// Joining with prefix/suffix and a transform:
String ids = orders.stream()
    .map(Order::id)
    .map(String::valueOf)
    .collect(Collectors.joining(", ", "(", ")"));
```

`Collectors.joining` is the modern default for building delimited strings from collections — it's null-safe (empty collection → `""`), has no trailing-delimiter bug, and reads clearly.

## How we use it in an organization: the scenarios

**Scenario 1 — building a large export/CSV/SQL-IN clause.** The hot-path builder:

```java
public String buildCsv(List<Order> orders) {
    StringBuilder sb = new StringBuilder(orders.size() * 12);   // pre-sized
    sb.append("id,status,amount").append('\n');
    for (Order o : orders) {
        sb.append(o.id()).append(',')
          .append(o.status()).append(',')
          .append(o.amount()).append('\n');
    }
    return sb.toString();
}
```

**Scenario 2 — dynamic SQL/log filters.** Composing a query fragment from variable conditions:

```java
StringBuilder where = new StringBuilder(" WHERE 1=1");     // the "1=1" trick keeps ANDs uniform
if (status != null) where.append(" AND status = ?");
if (from != null)   where.append(" AND created_at >= ?");
```

**Scenario 3 — log message assembly.** SLF4J parameters (`log.info("Order {} for {}", id, user)`) avoid string building entirely — the logger formats lazily. Teams ban `log.info("..." + id + "...")` in favor of parameterized logging (see the logging lesson).

**Scenario 4 — StringBuilder as a stack/scratch buffer.** StringBuilder's `append`/`deleteCharAt`/`reverse` make it a convenient mutable char buffer for incremental algorithms (parsing, dedup, reversing).

## Pitfalls

- **StringBuilder with no initial capacity in hot loops** — regrowth copies the buffer (amortized fine, but pre-size when the target size is known).
- **`StringBuffer` "for safety"** — synchronized methods on a single-threaded path are pure overhead; the org default is `StringBuilder`.
- **Manual delimiter handling** — `if (i > 0) sb.append(",")` is the trailing-comma bug farm; `StringJoiner`/`Collectors.joining` exist precisely for this.
- **`toString()` in the loop** — converting the builder back to a String each iteration defeats the purpose; build once, convert once.
- **Concatenation of many small pieces** — fine; the compiler's single-expression optimization covers it. Don't over-engineer.

## Key takeaways

- Strings are immutable; `+` in loops is O(n²) — use a mutable builder there.
- `StringBuilder` is the default; `StringBuffer`'s thread-safety costs and is almost never needed.
- `StringJoiner`/`Collectors.joining` handle delimiters, prefixes, and empty collections correctly.
- Pre-size builders when you know the target size; convert to String once at the end.
- Parameterized logging beats string concatenation in log statements.
