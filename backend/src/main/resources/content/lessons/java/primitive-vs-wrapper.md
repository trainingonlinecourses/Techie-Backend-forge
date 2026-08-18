---
title: Primitives vs Wrappers — Autoboxing, Nulls and Performance
summary: int vs Integer, when autoboxing happens, the wrapper pitfalls that cause NPEs, and the nullability conventions organizations enforce.
order: 25
minutes: 18
topics: [primitives, wrappers, autoboxing, npe, nullability, integer-cache, performance]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/autoboxing.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Integer.html
---

# Primitives vs Wrappers — Autoboxing, Nulls and Performance

## The concept: two parallel type systems

Java has **eight primitives** (`int`, `long`, `double`, `boolean`, `char`, `byte`, `short`, `float`) — raw machine values, fast, but not objects. Every primitive has a **wrapper class** (`Integer`, `Long`, `Double`, `Boolean`, …) that boxes the value in an object. You need wrappers when a value must be:

- an element of a generic collection (`List<Integer>` — generics can't use primitives),
- `null`-able (primitives can't be null),
- passed where an `Object` is required.

**Autoboxing/unboxing** is the compiler inserting the conversion automatically:

```java
Integer a = 42;          // autobox: int 42  → Integer.valueOf(42)
int b = a;               // unbox:   Integer → a.intValue()
Integer c = null;
int d = c;               // NullPointerException at runtime — unboxing a null
```

The conversion is invisible in source but real at runtime. That invisibility is exactly why wrapper misuse is a top NPE source.

## How we use it in an organization: the nullability rule

Production codebases adopt a strict convention, enforced in review and by static analysis (SpotBugs, Error Prone):

- **Primitives for values that can never be null** — counters, ids (as `long`), flags, computed numbers.
- **Wrappers only at boundaries that require null** — JSON fields that may be absent, database columns that are `NULL`, optional query parameters.

```java
// Scenario: an analytics endpoint. "sessions" is always present, "avgDurationSec"
// is null when a user has no sessions.
public record Analytics(long sessions, Integer avgDurationSec) {}

// Usage — unbox only after a null check
long s = a.sessions();                 // safe — primitive
Integer avg = a.avgDurationSec();      // may be null
long safeAvg = avg == null ? 0 : avg;  // explicit null handling
```

**The classic NPE in the wild:**

```java
// Long total = orderRepo.sumRevenue();  // NULL when no orders exist
Long total = orderRepo.sumRevenue();
// ...
return total / orderCount;              // NPE if total is null — unboxing happens here!
```

JPA/Hibernate returns `Long` (nullable) for aggregate queries. Any arithmetic unboxes it. The org rule: `sum()`/`count()` results are treated as nullable, checked, and defaulted — never used directly in arithmetic.

## The Integer cache — and why `==` on wrappers lies

`Integer.valueOf` caches `-128..127`, so:

```java
Integer a = 100, b = 100;   // same cached instance
System.out.println(a == b); // true  — both are the SAME cached object
Integer c = 200, d = 200;   // two separate objects (outside cache)
System.out.println(c == d); // false — different instances!
```

Comparing wrappers with `==` compares **references**, and the result depends on the cache range — pure luck from the reader's perspective. The rules:

- Compare primitives with `==`; compare wrappers with `.equals()` or unbox first.
- Never rely on the cache; it's an implementation detail.

## Performance: boxing has real cost

Each autobox allocates an object. In a hot loop that's garbage pressure plus unboxing overhead:

```java
// WRONG — boxes and unboxes in every iteration
long sum = 0;
for (Long n : bigListOfLongs) {   // unboxes each read
    sum += n;
}

// RIGHT — keep primitives in primitive containers
long[] raw = ...;                 // long[] is contiguous primitives, zero boxing
for (long n : raw) sum += n;
```

For numeric-heavy code (analytics, aggregations), prefer primitive arrays and `IntStream`/`LongStream` over `List<Integer>`/`List<Long>`. This matters most in batch jobs that process millions of rows.

## Scenarios teams hit

- **Jackson and missing JSON fields:** `@JsonProperty` on a primitive `int` fails deserialization when the field is absent (it can't default cleanly); a `Integer` receives `null`. DTOs at REST boundaries use wrappers; domain internals use primitives.
- **JPA `@Column(nullable = false)`:** the column says non-null, but the entity field should still be primitive `int`/`long` — unless the schema genuinely allows NULL, in which case wrapper is correct.
- **`Optional` vs wrapper:** `Optional<Integer>` is a double-wrap anti-pattern; use `OptionalInt` for streams of primitives, or plain nullable wrappers at boundaries.
- **Boolean vs boolean in queries:** `Boolean` can be null, which in SQL is a three-valued logic trap (`WHERE flag = ?` with null never matches). Use `boolean` primitives unless tri-state is genuinely intended.

## Key takeaways

- Primitives for guaranteed-non-null values; wrappers only at nullable boundaries (JSON, DB, params).
- Autoboxing/unboxing is where NPEs hide — check null before unboxing.
- Compare wrappers with `.equals()`, never `==` (cache makes `==` lie).
- Boxing allocates: use primitive arrays/streams in hot numeric paths.
- Let Jackson/JPA nullability drive the choice at boundaries; keep internals primitive.
