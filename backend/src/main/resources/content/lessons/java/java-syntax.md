---
title: Language Fundamentals
summary: Types, operators, control flow and the primitives vs objects distinction that underpins every Java API.
order: 2
minutes: 15
topics: [types, primitives, control-flow, strings]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
---

# Language Fundamentals

## Primitives vs objects

Java has **8 primitives** (value semantics, stored on the stack) and **objects** (reference semantics, on the heap):

| Primitive | Size | Example |
|---|---|---|
| `boolean` | 1 bit | `true` |
| `byte` / `short` / `int` / `long` | 1 / 2 / 4 / 8 bytes | `42`, `42L` |
| `float` / `double` | 4 / 8 bytes | `3.14f`, `3.14` |
| `char` | 2 bytes | `'A'` |

```java
int count = 10_000;            // underscores improve readability
long big  = 9_000_000_000L;    // L suffix for long
double price = 19.99;
boolean active = true;

String name = "backend";       // String is an OBJECT (immutable, pooled)
String other = name;           // both references point to the SAME object
```

Autoboxing converts between primitives and their wrappers (`int ↔ Integer`) — but **never use `==` on wrappers**:

```java
Integer a = 127, b = 127;
System.out.println(a == b);        // true  (cache -128..127)
Integer c = 200, d = 200;
System.out.println(c == d);        // false! use c.equals(d)
```

## Operators and control flow

```java
int total = a + b * 2;                 // precedence: * before +
boolean ok = (total > 100) && !expired || isVip;   // && before ||

// switch — modern arrow syntax (no fall-through, no break)
String tier = switch (total) {
    case 0, 1 -> "bronze";
    case 2, 3 -> "silver";
    default   -> "gold";
};

// for-each is the default loop
for (String t : tags) { if (t.isBlank()) continue; }

// streams over imperative loops in most cases (see java-streams lesson)
```

## Strings: immutable and pooled

`String` is **immutable**: every "change" creates a new object. That makes strings safe to share, cacheable for hashing, and security-friendly.

```java
// WRONG in a loop — O(n²) copies
String csv = "";
for (int i = 0; i < 10_000; i++) csv += i + ",";

// RIGHT — StringBuilder mutates in place
StringBuilder sb = new StringBuilder(64_000);
for (int i = 0; i < 10_000; i++) sb.append(i).append(',');
String result = sb.toString();
// StringBuffer = synchronized StringBuilder (only when shared across threads)
```

Key `String` methods used daily: `isBlank()`, `strip()` (vs legacy `trim()`), `contains`, `startsWith`, `matches`, `formatted`, `split`, `join`.

```java
String email = "  ALEX@EXAMPLE.COM ";
email.strip().toLowerCase().endsWith("@example.com");   // true
```

> **Why it matters (organizational view)** — Most bugs in code review come from primitive-vs-object identity, string concatenation in loops, and switch fall-through. Coding standards (always `equals` on wrappers, `StringBuilder` in loops, arrow-switch only) eliminate whole bug classes before they reach production.

## Key takeaways

- Primitives are values; everything else is a reference — `==` compares references on objects.
- Use wrapper `.equals()`, never `==`, and prefer primitives in hot code.
- `String` is immutable — build strings with `StringBuilder`.
- Prefer arrow `switch` and for-each; they remove entire classes of mistakes.

**Official docs:** [Primitive data types](https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html) · [String API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html)
