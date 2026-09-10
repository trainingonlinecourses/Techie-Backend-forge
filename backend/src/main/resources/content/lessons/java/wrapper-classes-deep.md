---
title: Wrapper Classes — Autoboxing, Caching & the Integer Trap
summary: Primitive-to-object conversion, the Integer cache trap, NullPointerException on unboxing, and why equals() beats == for wrapper comparison.
order: 86
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


**What this code does — step by step:**

1. This does NOT compile — primitives cannot be used in generics. ArrayList<int> numbers = new ArrayList<>(); // ❌ Compiler error
2. But this works — Integer is an object
3. `ArrayList<Integer> numbers = new ArrayList<>();` — ✅ Works fine
4. `numbers.add(42);` — Autoboxing: int → Integer happens automatically

The same code, clean:

```java
ArrayList<Integer> numbers = new ArrayList<>();
numbers.add(42);
```

**Scenario 2: Methods that return null**

A primitive cannot be `null`. But sometimes you need to indicate "no value":

// If a method returns 0, is that a valid result or "not found"?
int findUserAge(String name) {
    return -1;  // What if -1 is a valid age? Confusing!
}

// Using a wrapper, we can return null to mean "not found"
Integer findUserAge(String name) {
    return null;  // Clearly means "user not found" — no ambiguity
}

---

## Autoboxing and Unboxing

Since Java 5, Java can **automatically** convert between primitives and their wrapper classes:

- **Autoboxing**: primitive → wrapper (e.g., `int` → `Integer`)
- **Unboxing**: wrapper → primitive (e.g., `Integer` → `int`)


**What this code does — step by step:**

1. Autoboxing: Java automatically wraps the int into an Integer
2. `Integer a = 42;` — Compiler does: Integer.valueOf(42)
3. Unboxing: Java automatically unwraps the Integer to an int
4. `int b = a;` — Compiler does: a.intValue()
5. Works in arithmetic too
6. `int sum = x + y;` — Both unboxed to int, added, result stored in int
7. Works in collections
8. `prices.add(9.99);` — Autoboxed: double → Double
9. `double first = prices.get(0);` — Unboxed: Double → double

The same code, clean:

```java
Integer a = 42;

int b = a;

Integer x = 10;
Integer y = 20;
int sum = x + y;

List<Double> prices = new ArrayList<>();
prices.add(9.99);
double first = prices.get(0);
```

### How Autoboxing Works Under the Hood

When you write `Integer a = 42;`, the compiler translates it to:

Integer a = Integer.valueOf(42);  // This is what actually runs

And when you write `int b = a;`, the compiler translates it to:

int b = a.intValue();  // This is what actually runs

### The `valueOf()` Method and Integer Cache

This is where it gets interesting — and where many bugs hide.


**What this code does — step by step:**

1. The Integer class has an internal cache for values -128 to 127. Integer.valueOf(100) returns the SAME object every time. Integer.valueOf(200) creates a NEW object every time
2. `System.out.println(a == b);` — true — same cached object!
3. `System.out.println(c == d);` — false — different objects!

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Integer a = 100;
        Integer b = 100;
        System.out.println(a == b);

        Integer c = 200;
        Integer d = 200;
        System.out.println(c == d);
    }
}
```

**Why?** To save memory. Numbers between -128 and 127 are used so frequently that caching them avoids millions of unnecessary object allocations.

### The `==` vs `equals()` Trap


**What this code does — step by step:**

1. `System.out.println(a == b);` — true — within cache range
2. `System.out.println(a.equals(b));` — true — correct comparison
3. `System.out.println(c == d);` — FALSE — different objects!
4. `System.out.println(c.equals(d));` — true — always use .equals() for objects
5. For short, byte, and char: same cache range (-128 to 127)
6. `System.out.println(s1 == s2);` — true
7. For Long and Integer: cache range -128 to 127. For Float and Double: NO cache at all!
8. `System.out.println(f1 == f2);` — false — Float has no cache!

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Integer a = 127;
        Integer b = 127;
        System.out.println(a == b);
        System.out.println(a.equals(b));

        Integer c = 128;
        Integer d = 128;
        System.out.println(c == d);
        System.out.println(c.equals(d));

        Short s1 = 127;
        Short s2 = 127;
        System.out.println(s1 == s2);

        Float f1 = 1.0f;
        Float f2 = 1.0f;
        System.out.println(f1 == f2);
    }
}
```

**Rule of thumb**: ALWAYS use `.equals()` to compare wrapper objects. NEVER use `==`.

---

## Common Pitfalls

### 1. NullPointerException on Unboxing

Integer a = null;
int b = a;  // 💥 NullPointerException!
// Java tries to call a.intValue() on null

This is one of the most common bugs in Java. It often happens in collections:

Map<String, Integer> ages = new HashMap<>();
ages.put("Alice", 25);
ages.put("Bob", null);  // Null is a valid value in a HashMap

// 💥 NullPointerException if Bob's age is unboxed
int bobAge = ages.get("Bob");

**Safe way to handle this:**

Integer bobAge = ages.get("Bob");  // Use Integer, not int
if (bobAge != null) {
    int age = bobAge;  // Safe to unbox now
}

### 2. Performance Cost of Autoboxing

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

### 3. The `parseInt` vs `valueOf` Distinction


**What this code does — step by step:**

1. parseInt returns a primitive int
2. `int num1 = Integer.parseInt("42");` — returns int: 42
3. valueOf returns an Integer object
4. `Integer num2 = Integer.valueOf("42");` — returns Integer: 42
5. Both throw NumberFormatException for invalid input
6. `Integer.parseInt("abc");` — 💥 NumberFormatException

The same code, clean:

```java
int num1 = Integer.parseInt("42");

Integer num2 = Integer.valueOf("42");

Integer.parseInt("abc");
```

---

## Useful Utility Methods

Every wrapper class provides conversion and parsing methods:


**What this code does — step by step:**

1. String → primitive
2. String → wrapper object
3. Primitive → String
4. `String s1 = String.valueOf(42);` — "42"
5. `String s2 = Integer.toString(42);` — "42"
6. `String s3 = 42 + "";` — "42" (concatenation trick)
7. Wrapper → primitive
8. `int x = Integer.valueOf("42").intValue();` — 42
9. Constants
10. `int maxInt = Integer.MAX_VALUE;` — 2,147,483,647
11. `int minInt = Integer.MIN_VALUE;` — -2,147,483,648
12. `int bits = Integer.SIZE;` — 32 bits
13. `int bytes = Integer.BYTES;` — 4 bytes
14. Bit operations
15. `int reversed = Integer.reverse(0b1010);` — Bit reversal
16. `int leadingZeros = Integer.numberOfLeadingZeros(16);` — 27

The same code, clean:

```java
int i = Integer.parseInt("42");
double d = Double.parseDouble("3.14");
boolean b = Boolean.parseBoolean("true");

Integer iObj = Integer.valueOf("42");
Double dObj = Double.valueOf("3.14");

String s1 = String.valueOf(42);
String s2 = Integer.toString(42);
String s3 = 42 + "";

int x = Integer.valueOf("42").intValue();

int maxInt = Integer.MAX_VALUE;
int minInt = Integer.MIN_VALUE;
int bits = Integer.SIZE;
int bytes = Integer.BYTES;

int reversed = Integer.reverse(0b1010);
int leadingZeros = Integer.numberOfLeadingZeros(16);
```

---

## In an Organization

### Scenario 1: API Response Handling


**What this code does — step by step:**

1. In a REST API, you often need to distinguish between "not provided" and "zero"
2. `private Integer age;` — Integer, not int — so null means "not provided"
3. If we used int, we couldn't tell if the user sent 0 or didn't send anything
4. Controller
5. Only update age if it was actually provided
6. `if (req.getAge() != null) {` — null check works because it's Integer

The same code, clean:

```java
public class UserUpdateRequest {
    private Integer age;
    private String name;

}

@PostMapping("/users/{id}")
public User update(@PathVariable Long id, @RequestBody UserUpdateRequest req) {
    User user = repository.findById(id);

    if (req.getAge() != null) {
        user.setAge(req.getAge());
    }
    return repository.save(user);
}
```

### Scenario 2: Database Nullable Columns


**What this code does — step by step:**

1. use Integer, not int — database column might be NULL
2. `private Integer bonusPoints;` — ✅ Can be null. Private int bonusPoints; // ❌ Would NPE if DB column is NULL
3. If we used int, bonusPoints would default to 0. And we'd give extra perks to employees with no bonus!

The same code, clean:

```java
@Entity
public class Employee {
    @Id
    private Long id;

    private String name;

    private Integer bonusPoints;

    public void applyBonus() {
        if (bonusPoints != null && bonusPoints > 100) {
            giveExtraPerk();
        }
    }
}
```

### Scenario 3: Cache Key Confusion


**What this code does — step by step:**

1. ❌ Bug: Integer cache makes == unreliable in Maps
2. `System.out.println(cache.get(key2));` — null! Different objects, different hash codes
3. ✅ Fix: use valueOf() or autoboxing to get cached instances
4. `Integer key3 = Integer.valueOf(200);` — or just: Integer key3 = 200;
5. `System.out.println(cache.get(key4));` — "value" — same cached object

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Map<Integer, String> cache = new HashMap<>();
        Integer key1 = new Integer(200);
        Integer key2 = new Integer(200);

        cache.put(key1, "value");
        System.out.println(cache.get(key2));

        Integer key3 = Integer.valueOf(200);
        Integer key4 = Integer.valueOf(200);
        cache.put(key3, "value");
        System.out.println(cache.get(key4));
    }
}
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

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
