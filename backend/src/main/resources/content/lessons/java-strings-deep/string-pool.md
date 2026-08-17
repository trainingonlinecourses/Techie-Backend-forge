---
title: The String Pool and intern()
module: java-strings-deep
order: 2
minutes: 24
topics: ["string pool", "intern", "heap vs pool", "memory", "literals"]
docs:
  - title: "String.intern()"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html#intern()"
---

# The String Pool and intern()

## The Concept: Why Reuse Identical Strings?

Imagine a library where every patron writes their name on the membership card — and every time they visit, a new card is printed even though the name is identical to last time. Over a year, the library would drown in hundreds of identical cards. A sensible librarian would keep **one card per name** and hand out a copy of the reference to that card.

The Java **string pool** (also called the *intern pool*) does exactly this. It is a special area of memory (historically part of the permanent generation, now in the heap) that holds one canonical copy of every **string literal** your program uses.

When your code contains the literal `"hello"` twice:

```java
String a = "hello";
String b = "hello";
```

the JVM does **not** create two objects. It checks the pool, finds the existing `"hello"`, and makes both `a` and `b` point at that **same object**.

## How the Pool Works

### The Rule for Literals

Any string written directly in source code between double quotes is a **literal**. At class-loading time, the JVM:

1. Checks the pool for a string equal to this literal.
2. If present, reuses that object (no new allocation).
3. If absent, creates the object and stores it in the pool.

Because of this, `a == b` in the example above is `true` — they literally reference the same object.

### The Rule for Runtime Strings

Strings created at **runtime** — with `new`, or built by concatenation of variables, or returned from methods — are **not** automatically pooled:

```java
String a = "hello";              // pooled
String b = new String("hello");  // NOT pooled — a fresh object on the heap
String c = a + "!";              // runtime concatenation → new object
```

`b` is a brand-new object even though its content equals the pooled `"hello"`. So:

- `a == b` → `false` (different objects, same text)
- `a.equals(b)` → `true` (same text)

## The Code Walkthrough

```java
public class PoolDemo {

    public static void main(String[] args) {
        // 1. Literals are pooled
        String s1 = "hello";
        String s2 = "hello";
        System.out.println(s1 == s2);            // true — same pooled object

        // 2. 'new' always creates a fresh object
        String s3 = new String("hello");
        System.out.println(s1 == s3);            // false — different objects
        System.out.println(s1.equals(s3));       // true — same text

        // 3. Runtime concatenation of literals is folded at compile time
        String s4 = "hel" + "lo";                // compiler folds to "hello"
        System.out.println(s1 == s4);            // true — same literal after folding

        // 4. Concatenation with a variable happens at runtime → new object
        String part = "lo";
        String s5 = "hel" + part;
        System.out.println(s1 == s5);            // false — runtime result not pooled

        // 5. intern() explicitly pools a runtime string
        String s6 = s5.intern();
        System.out.println(s1 == s6);            // true — now the pooled object
    }
}
```

### Walking Through Each Part

**Part 1 (`s1`, `s2`):** Both are literals, so both reference the single pooled `"hello"` object. `==` is `true`.

**Part 2 (`s3`):** `new String("hello")` forces a new heap object. Even though the literal `"hello"` is inside the constructor argument (that literal itself is pooled), the `new` creates a separate object. This is why `==` fails while `.equals()` succeeds. Rule of thumb: **you almost never need `new String(...)`** — it defeats pooling.

**Part 3 (`s4`):** The compiler performs *constant folding*. `"hel" + "lo"` is a compile-time constant expression, so the compiled bytecode contains just the literal `"hello"`. It therefore resolves to the same pooled object. `==` is `true`.

**Part 4 (`s5`):** `"hel" + part` involves a variable, so the JVM cannot fold it at compile time. At runtime it produces a new object (internally using `StringBuilder`). The result is not pooled, so `==` is `false`.

**Part 5 (`s6`):** `intern()` manually asks the pool: *"do you already have text equal to mine?"* The pool says yes and returns the canonical pooled object. Now `s6` and `s1` reference the same object, so `==` is `true`.

## When Should You Use intern()?

**Almost never, unless you have a very specific, measured need.**

The pool is great for literals, but `intern()` on arbitrary runtime strings has costs:

- **Memory pressure:** every unique interned string lives for the life of the JVM (it's referenced by the pool) — it can never be garbage collected.
- **Performance:** `intern()` must do a lookup in a global table with locking under the hood, so it can *slow down* your program if overused.
- **Hash collisions:** the pool is backed by a hash structure; a large pool degrades lookup.

A legitimate case: a domain where the set of distinct string values is small and bounded (like a fixed set of status codes in a long-running service) — but even then, `enum` is usually the better answer.

## Common Beginner Pitfalls

1. **`new String("x")` everywhere.** Just use the literal `"x"`. `new String` buys you nothing but a wasted object.
2. **Comparing with `==` because "pooling makes it work".** It works only for literals (and folded constants). Production code should compare strings with `.equals()` — always.
3. **Assuming every concatenation is pooled.** Only compile-time constants are. Runtime results are fresh objects.

## Key Takeaways

- The string pool holds one canonical object per distinct literal.
- Literals reuse pooled objects; `new String(...)` and runtime concatenation do not.
- `intern()` manually pools a runtime string, but it's rarely worth it.
- Always compare string content with `.equals()`, never `==`.
