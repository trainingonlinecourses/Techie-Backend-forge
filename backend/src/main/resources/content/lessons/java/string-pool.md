---
title: The String Constant Pool — Why == Fails and Intern Saves Memory
summary: How Java's string interning works, the heap vs pool distinction, when == gives wrong answers, String.intern(), and why modern code avoids the pool for performance.
order: 62
minutes: 20
topics: [string-pool, string-intern, string-literal, heap-string, ==-vs-equals, string-caching]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/String.html#intern--
  - https://docs.oracle.com/javase/tutorial/java/data/strings.html
---

# The String Constant Pool — Why == Fails and Intern Saves Memory

## The concept — what IS the string pool?

Java maintains a special area of memory called the **String Constant Pool** (also called the "intern pool" or "string intern pool"). When you write a string **literal** like `"Hello"`, Java doesn't create a new object every time. Instead, it checks the pool:

1. If `"Hello"` already exists in the pool → Java returns the **same reference** (no new object created).
2. If `"Hello"` doesn't exist → Java creates it in the pool and returns that reference.

This saves memory because programs typically reuse the same strings thousands of times (class names, keywords, database column names, etc.).

### Beginner mental model

Imagine a shared dictionary in a library. When someone asks for the word "hello," the librarian doesn't create a new dictionary — they point to the existing one. That's what the string pool does. `String.intern()` is like asking the librarian to add your word to the shared dictionary.

### The critical rule

- **String literals** (`"Hello"`) go in the pool automatically.
- **String objects** (`new String("Hello")`) always create a new object on the heap, bypassing the pool.

This is why `"Hello" == "Hello"` is `true` (same pool reference) but `new String("Hello") == new String("Hello")` is `false` (different heap objects).

## How it works in code

```java
// LITERALS — both point to the SAME pool entry
String a = "Hello";          // creates "Hello" in the pool, a points to it
String b = "Hello";          // pool already has "Hello", b points to the SAME entry
System.out.println(a == b);   // true — same reference
System.out.println(a.equals(b)); // true — same characters

// NEW KEYWORD — always creates a separate heap object
String c = new String("Hello");  // new object on the heap, NOT in pool
String d = new String("Hello");  // another new object on the heap
System.out.println(c == d);       // false — two different objects!
System.out.println(c.equals(d));  // true — same characters, different objects

// MIXED — literal and new are never the same reference
System.out.println(a == c);       // false — pool vs heap
System.out.println(a.equals(c));  // true — same characters
```

**Why does this matter?** Because if your code uses `==` to compare strings (a very common beginner bug), it works for literals but breaks when strings come from user input, databases, or network — those are always heap objects.

## String.intern() — manually entering the pool

```java
String userinput = new String("Hello");   // heap object (from database, API, etc.)
String literal = "Hello";                  // pool reference

System.out.println(userinput == literal);  // false — different objects

// intern() checks the pool: if "Hello" exists, returns pool reference
String interned = userinput.intern();
System.out.println(interned == literal);   // true — now both point to pool entry
```

**How intern() works step by step:**
1. JVM checks if the string's content already exists in the pool.
2. If yes → returns the existing pool reference (discards the heap object).
3. If no → adds the string to the pool, then returns that reference.

## The hidden cost — memory leak trap

```java
// DANGER: intern() in a loop can fill the pool and crash the JVM
for (int i = 0; i < 1_000_000; i++) {
    String unique = new String("user-" + i);  // each is unique content
    unique.intern();   // adds to pool — but pool has limited memory!
    // After ~500K unique strings, you get OutOfMemoryError: Metaspace
}
```

**Why this happens:** The pool lives in Metaspace (native memory), which is limited. Each interned string stays forever (or until GC runs a Full GC). In a loop creating millions of unique strings, the pool explodes.

## Modern Java — the pool is less important

Since Java 7+, strings are stored in the heap (not a separatePermGen space). This means:
- GC can collect unused interned strings.
- The performance benefit of interning is smaller because heap allocation is fast.
- Most teams **avoid** `intern()` and use `equals()` everywhere.

The pool still exists and still saves memory for repeated literals. But explicit `intern()` calls are rare in modern code — they're a micro-optimization that can cause bugs if misused.

## How we use it in organizations

### Scenario 1: Why == fails with database strings

A common production bug: comparing a string from a database with a literal:

```java
public class OrderService {
    private static final String STATUS_ACTIVE = "ACTIVE";  // literal — in pool

    public boolean isActive(Order order) {
        // BUG: order.getStatus() comes from the database — it's a heap object
        // == will be FALSE even though the content is "ACTIVE"!
        return order.getStatus() == STATUS_ACTIVE;  // WRONG!

        // CORRECT: use equals()
        return STATUS_ACTIVE.equals(order.getStatus());  // RIGHT!
    }
}
```

**Why this is the #1 string bug:** Every ORMs (Hibernate, JPA) returns new String objects for every column value. They're never in the pool. `==` works in unit tests (where you use literals) but fails in production (where data comes from the database). The fix: **always use `.equals()` for string comparison**.

### Scenario 2: Enums already solve this — don't intern status strings

```java
// BAD: stringly-typed status (pool issues, typos, == comparison bugs)
public class Order {
    private String status;  // "ACTIVE", "SHIPPED", "CANCELLED"
}

// GOOD: enum (== works perfectly, no typos possible, type-safe)
public enum OrderStatus {
    ACTIVE, SHIPPED, CANCELLED, REFUNDED
}

public class Order {
    private OrderStatus status;  // OrderStatus.ACTIVE — no string issues ever
}

// Now == is perfectly safe
if (order.getStatus() == OrderStatus.ACTIVE) { ... }
```

### Scenario 3: Interning for memory optimization in large datasets

When processing millions of strings with many duplicates (like log file analysis), interning can save significant memory:

```java
public class LogProcessor {
    private static final int EXPECTED_UNIQUE_LEVELS = 5;

    public List<LogEntry> processLines(List<String> lines) {
        List<LogEntry> entries = new ArrayList<>();

        for (String line : lines) {
            String level = extractLevel(line);    // "INFO", "WARN", "ERROR", etc.
            // Only 5 unique levels but millions of lines — intern saves massive memory
            String internedLevel = level.intern();

            String message = extractMessage(line);
            entries.add(new LogEntry(internedLevel, message));
        }
        return entries;
        // Without intern: 10 million String objects for "INFO" alone
        // With intern: only 1 String object for "INFO", shared by all entries
    }
}
```

**When this is actually useful:**
- Processing CSV/JSON files with millions of rows and few unique values in certain columns.
- Building in-memory caches where the same key strings appear repeatedly.
- Memory-constrained environments where every byte counts.

### Scenario 4: equals() vs == in production code

```java
public class UserService {
    public User findByRole(String roleInput) {
        // User input comes from HTTP request — always heap string
        // NEVER use == here!
        return users.stream()
            .filter(u -> u.getRole().equals(roleInput))  // content comparison
            .findFirst()
            .orElse(null);
    }

    // For enums, == is safe and faster
    public boolean isAdmin(User user) {
        return user.getRole() == Role.ADMIN;  // enum comparison — OK!
    }
}
```

## Decision guide

| Situation | Use | Why |
|---|---|---|
| Comparing user input, DB values, API responses | `.equals()` | These are heap strings, never in pool |
| Comparing enum values | `==` | Enums are singletons, `==` is safe and faster |
| Comparing string literals in your own code | Either works | Same pool reference — but `.equals()` is safer habit |
| Memory optimization with millions of duplicate strings | `.intern()` | Pool deduplicates automatically |
| Short-lived strings in tight loops | Don't intern | GC overhead of managing interned strings > memory savings |

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `==` to compare strings from databases/APIs | Always `false` — silent logic bug |
| Interning user-supplied strings in a loop | Metaspace OutOfMemoryError |
| Using `intern()` instead of an enum for status codes | Unnecessary complexity + pool pollution |
| Forgetting that `"a" + "b"` creates a new literal, not interned | Works fine (compiler optimizes), but `new String("ab")` wouldn't be |
| Switching from `==` to `.equals()` on enums | Wasteful `.equals()` when `==` is correct and faster |
