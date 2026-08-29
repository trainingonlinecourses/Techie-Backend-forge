---
title: String Comparison — equals, ==, compareTo and ContentEquals
summary: Why == fails on strings, the equals/equalsIgnoreCase/compareTo/contentEquals family, locale-aware comparison, and the identity-comparison pattern.
order: 37
minutes: 18
topics: [string-comparison, equals, compareto, contentequals, equalsignorecase, locale, identity]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/text/Collator.html
---

# String Comparison — equals, ==, compareTo and ContentEquals

## The concept: strings are objects; == compares references

The single most common beginner bug in Java — and it appears in production code far more often than it should:

```java
String a = "hello";
String b = new String("hello");
System.out.println(a == b);       // false!  two different objects
System.out.println(a.equals(b));  // true    same characters
```

`==` on two references asks "are these the *same object*?" — it does not compare content. Strings compare content with **`equals`** (and the variants below). The confusion persists because the **string pool** makes `==` *appear* to work for literals: `"hello" == "hello"` is true (both point at the pooled literal), so the bug hides until a string comes from user input, a database, or `new`.

**The org rule:** **never compare strings with `==`** — except the one legitimate case at the bottom of this lesson. `equals` always, or a `null`-safe `Objects.equals(a, b)`.

## The comparison family — picking the right one

```java
// Content equality — the default
a.equals(b)                              // exact, case-sensitive

// Case-insensitive content equality
a.equalsIgnoreCase(b)                    // "Status" vs "status" → equal

// Ordering — for sorting and range checks
a.compareTo(b)                           // <0, 0, >0 — lexicographic (unicode), case-sensitive
a.compareToIgnoreCase(b)                 // ordering without case weight

// Same content as a CharSequence (StringBuilder, char[]) — avoids building a String
a.contentEquals(new StringBuilder("hello"))   // true — compares without toString()

// null-safe comparison
Objects.equals(a, b)                     // true if both null; equals if both non-null
```

**`equals` vs `compareTo`:** `equals` answers "same value?"; `compareTo` answers "which comes first?" — it's what `TreeSet`/`TreeMap`/`Collections.sort` and the `Comparator` interface use. Two strings can be `equals` and still have `compareTo != 0`? No — for `String`, `compareTo == 0` implies `equals` (it's consistent), but don't rely on that for arbitrary types.

## How we use it in an organization: the scenarios

**Scenario 1 — status/state matching.** The canonical org code:

```java
if ("PAID".equals(order.getStatus())) { ... }          // literal FIRST — null-safe!
if (order.getStatus().equals("PAID")) { ... }           // NPE if status is null!

// The literal-first idiom ("Yoda") exists for a reason: "PAID".equals(x) never NPEs
```

Teams standardize on **`"constant".equals(variable)`** so a null variable can't throw. Same pattern for `case`-style matching with `equalsIgnoreCase` when input case varies (user-typed values, external codes).

**Scenario 2 — ordering with collation.** `compareTo` is *code-point* ordering — not human/alphabetical for accented text:

```java
// Wrong for user-facing sorting: "é" vs "e", "ä" vs "a" order by code point, not language
list.sort(Comparator.comparing(Person::name));          // code-point order — ok for ASCII codes

// Right for display: locale-aware collation
Collator collator = Collator.getInstance(Locale.GERMAN);
list.sort(Comparator.comparing(Person::name, collator::compare));
```

The org rule: **ASCII/code/identifier ordering → `compareTo`; human-language sorting → `Collator`.** For backend code comparing status codes, ids, or enum names, `compareTo` is correct.

**Scenario 3 — the identity-comparison exception.** There is *one* legitimate `==` on strings: when you've **guaranteed interning** — `String.intern()` or literals — and want reference equality for speed:

```java
// Rare, deliberate — a hot path comparing pooled literals
if (status == Status.PAID_NAME) { ... }   // only safe if both are interned/literals
```

This is an optimization for ultra-hot loops; teams generally ban it in review because the guarantee is fragile. Use `equals`.

**Scenario 4 — input normalization before comparison.** The robust pattern: normalize once at the boundary, then compare confidently:

```java
// In a request DTO setter / validator:
String normalized = raw.trim().toLowerCase(Locale.ROOT);   // Locale.ROOT avoids Turkish-i surprises
if (normalized.equals("admin")) { ... }
```

`toLowerCase()` *without* a locale uses the default locale — the classic **Turkish-i bug** (`"I".toLowerCase()` becomes `ı` in Turkish locale). Always pass `Locale.ROOT` for code/identifier normalization.

## Pitfalls

- **`==` on strings from different sources** — DB, JSON, user input are *not* pooled; `==` fails. `equals` everywhere.
- **`equals` without null guard** — `variable.equals(...)` NPEs on null; use the literal-first or `Objects.equals` form.
- **`compareTo` for user-facing sorting** — code-point order isn't language order; use `Collator`.
- **Locale-less case folding** — `toLowerCase()`/`equalsIgnoreCase` use locale rules; for codes use `Locale.ROOT`.
- **`contentEquals` vs `equals`** — `contentEquals` takes a `CharSequence` (StringBuilder etc.) without allocating a String; `equals` requires a `String`.

## Key takeaways

- `==` compares references, not content — never use it for strings except deliberate interned-identity.
- The family: `equals`, `equalsIgnoreCase`, `compareTo`, `contentEquals`, `Objects.equals`.
- Literal-first (`"PAID".equals(x)`) is the null-safe org standard.
- Human-language ordering needs `Collator`; code/identifier ordering uses `compareTo`.
- Normalize at the boundary with `Locale.ROOT` to avoid locale bugs.
