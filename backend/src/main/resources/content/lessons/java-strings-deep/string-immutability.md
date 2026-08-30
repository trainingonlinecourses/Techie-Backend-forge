---
title: Why Strings Are Immutable
module: java-strings-deep
order: 1
minutes: 22
topics: ["immutability", "String internals", "security", "caching", "value objects"]
summary: Imagine you write your name on a piece of paper. Now imagine that any program running on your computer could quietly erase part of your name and wr...
docs:
  - title: "String (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html"
---

# Why Strings Are Immutable

## The Concept: What Does "Immutable" Even Mean?

Imagine you write your name on a piece of paper. Now imagine that any program running on your computer could quietly erase part of your name and write something else on that same paper — and every other copy of your name in the system would change too. That would be chaos, right?

An **immutable object** is the opposite: once it is created, its contents can **never change**. If you want a different value, you don't edit the old object — you create a brand-new object with the new value, and the old one stays exactly as it was forever.

`String` in Java is immutable. When you write:

```java
String name = "Sateesh";
name = name.toUpperCase();   // this does NOT change the original
```

you might think `name` changed from `"Sateesh"` to `"SATEESH"`. But what actually happens is:

1. The original `String` object holding `"Sateesh"` is untouched.
2. `toUpperCase()` creates a **completely new** `String` object holding `"SATEESH"`.
3. The variable `name` is *re-pointed* to the new object.

## Why Did the Language Designers Choose This?

### 1. Security

`String` is used everywhere for sensitive data: usernames, file paths, class names, database URLs. If a `String` could be mutated in place, a malicious method could take the string you passed it, mutate it silently, and the caller would never know. With immutability, when you pass a `String` to a method, you are **guaranteed** it comes back unchanged. This is a hard guarantee you can build security logic on.

### 2. Thread Safety

In multi-threaded programs, multiple threads often share the same `String` (like a configuration value). If `String` were mutable, two threads could race to modify it and corrupt its state. Because it's immutable, any number of threads can read the same `String` simultaneously with **zero synchronization** — there is nothing to corrupt.

### 3. Caching

Because a `String` can't change, the JVM is free to **reuse** the same object for equal values (the *string pool* — covered in the next lesson). If strings were mutable, reusing them would be dangerous: changing one reference would change all of them.

### 4. Safe as a Map Key / Hash Code

`HashMap` and `HashSet` store objects by their `hashCode()`. If an object's hash changes after it's inserted, the map breaks (you can no longer find the entry). Since a `String`'s hash is computed from its contents and the contents never change, the hash is stable forever — the JVM even caches the hash after the first computation.

## The Code Walkthrough

Let's look at real code and trace exactly what happens:

```java
public class ImmutabilityDemo {

    public static void main(String[] args) {
        // Step 1: a String object is created
        String a = "hello";
        String b = a;              // b points to the SAME object as a

        // Step 2: "modify" a through a method call
        String c = a.concat(" world");

        System.out.println("a = " + a);   // prints: hello
        System.out.println("b = " + b);   // prints: hello  (b still sees the original)
        System.out.println("c = " + c);   // prints: hello world

        // Step 3: prove a and b reference the same (unchanged) object
        System.out.println(a == b);       // prints: true  (same object)

        // Step 4: a String method NEVER mutates its receiver
        String d = a.toUpperCase();
        System.out.println(a);            // still: hello
        System.out.println(d);            // HELLO — a brand-new object
    }
}
```

### Walking Through Each Line

**Line-by-line:**

- `String a = "hello";` — The JVM creates (or reuses from the pool) a `String` object containing exactly `"hello"`. The variable `a` holds a *reference* to it, like a remote control pointing at the object.

- `String b = a;` — No new string is created. `b` is a second remote control pointing at the **same** object. This is cheap and safe precisely because the object can't change — sharing is harmless.

- `String c = a.concat(" world");` — Here is the key moment. `concat` **cannot** append to `a`'s object, so it allocates a new `String` containing `"hello world"` and returns it. `a`'s object still contains `"hello"`. The old object is not modified — it's simply no longer referenced by `c` (and becomes eligible for garbage collection if nothing else uses it).

- `a == b` — The `==` operator on objects compares *references* (do both variables point at the same object?), not contents. Since `b` was assigned from `a` directly, both point at the same object, so this is `true`. (Never use `==` to compare string *contents* — use `.equals()`.)

- `a.toUpperCase()` — Same story: returns a new object `"HELLO"`. The receiver `a` is untouched, as the print proves.

## What About "Mutable" Strings?

Sometimes you genuinely need to build or modify text incrementally — in a loop, for example. That's what `StringBuilder` is for (next lesson). The point of this lesson is: **the `String` class itself never mutates**. The APIs that look like mutation (`concat`, `replace`, `substring`, `toUpperCase`, `trim`, ...) all return new objects.

```java
// Looks like mutation, is actually 3 objects
String s = "a";
s = s + "b";   // new object "ab"
s = s + "c";   // new object "abc"
```

Each `+` creates a new `String`. For one-off concatenations that's fine; inside a loop of thousands of iterations it wastes memory — which is exactly the problem `StringBuilder` solves.

## Common Beginner Pitfalls

1. **Thinking `==` compares text.** It compares references. `new String("hi") == "hi"` is `false` even though the text is equal. Always use `.equals()`.
2. **Expecting methods to change the original.** `String s = "abc"; s.replace('a','x');` without reassigning does nothing you can observe — the result is discarded.
3. **Using `+` in a loop.** Each iteration allocates. Use `StringBuilder` for loops (see next lesson).

## Key Takeaways

- Immutability means an object's state can never change after creation.
- `String` is immutable for security, thread safety, caching, and safe hashing.
- Every `String` method that "changes" text actually returns a **new** object.
- The original object is never modified — variables are just re-pointed.
- Use `.equals()` for content comparison, never `==`.
