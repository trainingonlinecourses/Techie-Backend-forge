---
title: Wrapper Classes — Autoboxing, Caching & the Integer Trap
summary: Primitive-to-object conversion, the Integer cache trap, NullPointerException on unboxing, and why equals() beats == for wrapper comparison.
order: 22
minutes: 18
topics: [wrapper-classes, autoboxing, unboxing, integer-cache, equals-vs-operator, null-safety]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/autoboxing.html
  - https://docs.oracle.com/javase/tutorial/java/data/wrapperclasses.html
---

# Java Wrapper Classes — Deep Dive

## What Are Wrapper Classes?

In Java, there are 8 **primitive types**: `int`, `double`, `boolean`, `char`, `byte`, `short`, `long`, `float`. These are simple values stored directly on the stack — fast, but they are NOT objects. That means:

- You **cannot** call methods on them (`42.toString()` won't compile)
- You **cannot** put them in collections (`ArrayList<int>` is illegal)
- They **don't** participate in the object-oriented features like inheritance

**Wrapper classes** solve this by providing an **object representation** of each primitive. Java provides 8 wrapper classes, one for each primitive:

| Primitive | Wrapper Class | Size |
|-----------|--------------|------|
| `int` | `Integer` | 4 bytes |
| `double` | `Double` | 8 bytes |
| `boolean` | `Boolean` | 1 bit (but uses ~1 byte) |
| `char` | `Character` | 2 bytes |
| `byte` | `Byte` | 1 byte |
| `short` | `Short` | 2 bytes |
| `long` | `Long` | 8 bytes |
| `float` | `Float` | 4 bytes |

### Why Do We Need Them?

**Scenario 1: Collections only accept objects**

```java
// This does NOT compile — primitives cannot be used in generics
// ArrayList<int> numbers = new ArrayList<>();  // ❌ Compiler error

// But this works — Integer is an object
ArrayList<Integer> numbers = new ArrayList<>();  // ✅ Works fine
numbers.add(42);  // Autoboxing: int → Integer happens automatically
```

**Scenario 2: Methods that return null**

A primitive cannot be `null`. But sometimes you need to indicate "no value":

```java
// If a method returns 0, is that a valid result or "not found"?
int findUserAge(String name) {
    return -1;  // What if -1 is a valid age? Confusing!
}

// Using a wrapper, we can return null to mean "not found"
Integer findUserAge(String name) {
    return null;  // Clearly means "user not found" — no ambiguity
}
```

---

## Autoboxing and Unboxing

Since Java 5, Java can **automatically** convert between primitives and their wrapper classes:

- **Autoboxing**: primitive → wrapper (e.g., `int` → `Integer`)
- **Unboxing**: wrapper → primitive (e.g., `Integer` → `int`)

```java
// Autoboxing: Java automatically wraps the int into an Integer
Integer a = 42;          // Compiler does: Integer.valueOf(42)

// Unboxing: Java automatically unwraps the Integer to an int
int b = a;              // Compiler does: a.intValue()

// Works in arithmetic too
Integer x = 10;
Integer y = 20;
int sum = x + y;        // Both unboxed to int, added, result stored in int

// Works in collections
List<Double> prices = new ArrayList<>();
prices.add(9.99);       // Autoboxed: double → Double
double first = prices.get(0);  // Unboxed: Double → double
```

### How Autoboxing Works Under the Hood

When you write `Integer a = 42;`, the compiler translates it to:

```java
Integer a = Integer.valueOf(42);  // This is what actually runs
```

And when you write `int b = a;`, the compiler translates it to:

```java
int b = a.intValue();  // This is what actually runs
```

### The `valueOf()` Method and Integer Cache

This is where it gets interesting — and where many bugs hide.

```java
// The Integer class has an internal cache for values -128 to 127
// Integer.valueOf(100) returns the SAME object every time
// Integer.valueOf(200) creates a NEW object every time

Integer a = 100;
Integer b = 100;
System.out.println(a == b);  // true — same cached object!

Integer c = 200;
Integer d = 200;
System.out.println(c == d);  // false — different objects!
```

**Why?** To save memory. Numbers between -128 and 127 are used so frequently that caching them avoids millions of unnecessary object allocations.

### The `==` vs `equals()` Trap

```java
Integer a = 127;
Integer b = 127;
System.out.println(a == b);      // true — within cache range
System.out.println(a.equals(b)); // true — correct comparison

Integer c = 128;
Integer d = 128;
System.out.println(c == d);      // FALSE — different objects!
System.out.println(c.equals(d)); // true — always use .equals() for objects

// For short, byte, and char: same cache range (-128 to 127)
Short s1 = 127;
Short s2 = 127;
System.out.println(s1 == s2);  // true

// For Long and Integer: cache range -128 to 127
// For Float and Double: NO cache at all!
Float f1 = 1.0f;
Float f2 = 1.0f;
System.out.println(f1 == f2);  // false — Float has no cache!
```

**Rule of thumb**: ALWAYS use `.equals()` to compare wrapper objects. NEVER use `==`.

---

## Common Pitfalls

### 1. NullPointerException on Unboxing

```java
Integer a = null;
int b = a;  // 💥 NullPointerException!
// Java tries to call a.intValue() on null
```

This is one of the most common bugs in Java. It often happens in collections:

```java
Map<String, Integer> ages = new HashMap<>();
ages.put("Alice", 25);
ages.put("Bob", null);  // Null is a valid value in a HashMap

// 💥 NullPointerException if Bob's age is unboxed
int bobAge = ages.get("Bob");
```

**Safe way to handle this:**

```java
Integer bobAge = ages.get("Bob");  // Use Integer, not int
if (bobAge != null) {
    int age = bobAge;  // Safe to unbox now
}
```

### 2. Performance Cost of Autoboxing

```java
// ❌ Bad: creates 10,000,000 Integer objects (one per loop iteration)
Long sum = 0L;
for (long i = 0; i < 10_000_000L; i++) {
    sum += i;  // Unbox sum → long, add, Autobox result → Long
}

// ✅ Good: uses primitive long, no object creation
long sum = 0L;
for (long i = 0; i < 10_000_000L; i++) {
    sum += i;  // All primitive arithmetic, no boxing overhead
}
```

### 3. The `parseInt` vs `valueOf` Distinction

```java
// parseInt returns a primitive int
int num1 = Integer.parseInt("42");    // returns int: 42

// valueOf returns an Integer object
Integer num2 = Integer.valueOf("42"); // returns Integer: 42

// Both throw NumberFormatException for invalid input
Integer.parseInt("abc");  // 💥 NumberFormatException
```

---

## Useful Utility Methods

Every wrapper class provides conversion and parsing methods:

```java
// String → primitive
int i = Integer.parseInt("42");
double d = Double.parseDouble("3.14");
boolean b = Boolean.parseBoolean("true");

// String → wrapper object
Integer iObj = Integer.valueOf("42");
Double dObj = Double.valueOf("3.14");

// Primitive → String
String s1 = String.valueOf(42);        // "42"
String s2 = Integer.toString(42);       // "42"
String s3 = 42 + "";                    // "42" (concatenation trick)

// Wrapper → primitive
int x = Integer.valueOf("42").intValue();  // 42

// Constants
int maxInt = Integer.MAX_VALUE;  // 2,147,483,647
int minInt = Integer.MIN_VALUE;  // -2,147,483,648
int bits = Integer.SIZE;         // 32 bits
int bytes = Integer.BYTES;       // 4 bytes

// Bit operations
int reversed = Integer.reverse(0b1010);     // Bit reversal
int leadingZeros = Integer.numberOfLeadingZeros(16);  // 27
```

---

## In an Organization

### Scenario 1: API Response Handling

```java
// In a REST API, you often need to distinguish between "not provided" and "zero"
public class UserUpdateRequest {
    private Integer age;   // Integer, not int — so null means "not provided"
    private String name;

    // If we used int, we couldn't tell if the user sent 0 or didn't send anything
}

// Controller
@PostMapping("/users/{id}")
public User update(@PathVariable Long id, @RequestBody UserUpdateRequest req) {
    User user = repository.findById(id);

    // Only update age if it was actually provided
    if (req.getAge() != null) {    // null check works because it's Integer
        user.setAge(req.getAge());
    }
    return repository.save(user);
}
```

### Scenario 2: Database Nullable Columns

```java
@Entity
public class Employee {
    @Id
    private Long id;

    private String name;

    // use Integer, not int — database column might be NULL
    private Integer bonusPoints;  // ✅ Can be null
    // private int bonusPoints;   // ❌ Would NPE if DB column is NULL

    public void applyBonus() {
        if (bonusPoints != null && bonusPoints > 100) {
            giveExtraPerk();
        }
        // If we used int, bonusPoints would default to 0
        // and we'd give extra perks to employees with no bonus!
    }
}
```

### Scenario 3: Cache Key Confusion

```java
// ❌ Bug: Integer cache makes == unreliable in Maps
Map<Integer, String> cache = new HashMap<>();
Integer key1 = new Integer(200);
Integer key2 = new Integer(200);

cache.put(key1, "value");
System.out.println(cache.get(key2));  // null! Different objects, different hash codes

// ✅ Fix: use valueOf() or autoboxing to get cached instances
Integer key3 = Integer.valueOf(200);  // or just: Integer key3 = 200;
Integer key4 = Integer.valueOf(200);
cache.put(key3, "value");
System.out.println(cache.get(key4));  // "value" — same cached object
```

---

## Quick Reference

| Operation | Code |
|-----------|------|
| Primitive → Wrapper (autobox) | `Integer x = 42;` |
| Wrapper → Primitive (unbox) | `int x = integerObj;` |
| String → Primitive | `int x = Integer.parseInt("42");` |
| String → Wrapper | `Integer x = Integer.valueOf("42");` |
| Primitive → String | `String s = String.valueOf(42);` |
| Compare wrappers | `a.equals(b)` — NEVER `==` |
| Get max/min | `Integer.MAX_VALUE`, `Integer.MIN_VALUE` |
| Get bits | `Integer.SIZE` (32), `Integer.BYTES` (4) |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `==` to compare wrappers | Returns false for values outside cache (-128 to 127) | Always use `.equals()` |
| Unboxing null Integer | NullPointerException | Check for null before unboxing |
| Autoboxing in tight loops | Creates millions of objects, GC pressure | Use primitives in hot loops |
| Using `int` for nullable DB columns | NPE when column is null | Use `Integer` |
| `Integer i = 128; Integer j = 128; i == j` | false — cache miss | Use `.equals()` or `valueOf()` |
| `long l = Integer.MAX_VALUE + 1` | Silent overflow! | Use `long` throughout: `(long) Integer.MAX_VALUE + 1` |
