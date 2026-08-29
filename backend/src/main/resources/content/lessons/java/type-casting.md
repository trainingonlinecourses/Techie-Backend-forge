---
title: Type Casting — Widening, Narrowing, Autoboxing and Unboxing
summary: When Java promotes numbers automatically, when it truncates silently, how autoboxing creates hidden object allocations, and the integer-cache trap that makes == lie.
order: 56
minutes: 18
topics: [casting, widening, narrowing, autoboxing, unboxing, promotion, Integer cache, object allocation]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/autoboxing.html
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html
---

# Type Casting — Widening, Narrowing, Autoboxing and Unboxing

## The concept: type conversions are everywhere

Every time you pass a `long` to an `int` parameter, assign a `double` to a `float`, or put a primitive into a collection, Java performs a type conversion. Some conversions are safe and invisible (widening), others lose data silently (narrowing), and autoboxing creates hidden objects that hurt performance in tight loops. Understanding these conversions prevents subtle bugs — especially the Integer cache, where `==` on wrapped integers *appears* to work until it doesn't.

## Widening conversions — safe and invisible

A widening conversion goes from a smaller type to a larger type. Java does these automatically — no cast needed:

```java
int i = 42;
long l = i;          // int → long (32-bit → 64-bit): safe, no data loss
double d = l;        // long → double: safe for most values, but may lose precision for very large longs
float f = 42;        // int → float: may lose precision for large ints (float has only 24-bit mantissa)

// Widening promotion order:
// byte → short → int → long → float → double
// char → int → long → float → double
```

**The org trap:** `long → float` and `long → double` are widening but can lose precision. A `long` with value `9_000_000_000_000_000_001L` becomes `9.0E18f` — the trailing `1` is lost. If exact values matter (money, IDs), use `BigDecimal` instead of `float`/`double`.

```java
long big = 9_000_000_000_000_000_001L;
float f = big;              // 9.0E18f — lost precision
System.out.println(big == (long) f);  // false — the round-trip is lossy
```

## Narrowing conversions — truncation you must request

A narrowing conversion goes from a larger type to a smaller type. Java requires an explicit cast because data may be lost:

```java
long l = 1000L;
int i = (int) l;           // safe: 1000 fits in int
long big = 3_000_000_000L;
int truncated = (int) big; // overflow: -1294967296 — silent truncation!

double d = 3.99;
int whole = (int) d;       // 3 — truncates, does NOT round
int rounded = (int) Math.round(d);  // 4 — use Math.round for rounding
```

**The bytes trap:** `byte` is signed (-128 to 127). Casting an `int` > 127 to `byte` wraps around:

```java
byte b = (byte) 200;       // -56 — binary representation is 11001000, which is -56 as signed byte
byte b2 = (byte) 128;      // -128 — wraps to negative
// Always mask for unsigned interpretation: int unsigned = b & 0xFF;  → 200
```

## Autoboxing — convenience with a cost

Autoboxing wraps a primitive in its wrapper class automatically. Unboxing does the reverse:

```java
Integer boxed = 42;           // autobox: int 42 → Integer.valueOf(42)
int unboxed = boxed;          // unbox: Integer → int
List<Integer> nums = new ArrayList<>();
nums.add(42);                 // autobox: int → Integer
int first = nums.get(0);     // unbox: Integer → int

// In expressions, mixed primitives and wrappers cause repeated boxing/unboxing:
Integer a = 10;
Integer b = 20;
Integer sum = a + b;          // unbox a, unbox b, add ints, autobox result — 3 hidden operations
```

**Performance in loops:** Autoboxing inside a tight loop allocates thousands of objects:

```java
// BAD — allocates 10M Integer objects
Long total = 0L;
for (int i = 0; i < 10_000_000; i++) {
    total += i;              // unbox total, add, autobox result — garbage collector churns
}

// GOOD — primitive accumulates, no objects created
long total = 0L;
for (int i = 0; i < 10_000_000; i++) {
    total += i;
}
```

## The Integer cache trap — == lies

Java caches `Integer` objects for values -128 to 127. This makes `==` *appear* to work for small numbers but fail for large ones:

```java
Integer a = 127;
Integer b = 127;
System.out.println(a == b);   // true — both point to the cached instance

Integer c = 128;
Integer d = 128;
System.out.println(c == d);   // false — different objects, == checks identity not value
System.out.println(c.equals(d));  // true — always use .equals() for wrapper comparison
```

**The org rule:** never use `==` to compare `Integer`, `Long`, `Double`, or any wrapper type. Always use `.equals()`. Autoboxed values in ternaries and method returns may or may not be cached.

```java
// This cache behavior makes == unreliable across JVM implementations:
Integer x = methodReturn128();
Integer y = methodReturn128();
// x == y depends on whether the method returns cached or new instances
```

## char ↔ int conversions

`char` is a 16-bit unsigned type (UTF-16). It converts freely to `int` but narrowing requires a cast:

```java
char c = 'A';
int ascii = c;           // widening: 65 — char → int is safe
char back = (char) 65;   // narrowing: 'A' — int → char requires cast
char next = (char) (c + 1);  // 'B' — arithmetic on chars produces ints, need cast back

// This is how you iterate a range of characters:
for (char ch = 'a'; ch <= 'z'; ch++) {
    System.out.print(ch);
}
```

## Type casting with generics — the erasure shadow

Generic type parameters are erased at runtime. You can't cast to a parameterized type, but you can cast to a raw type:

```java
List<String> names = List.of("Alice", "Bob");

// This compiles but throws ClassCastException at runtime:
// Object obj = names;
// List<Integer> wrong = (List<Integer>) obj;  // compile-time unchecked, runtime ClassCastException

// Safe: cast to raw type, then inspect elements
Object obj = names;
List raw = (List) obj;          // raw type cast — safe
String first = (String) raw.get(0);  // element-level cast — safe

// The instanceof trick with generics (Java 16+ pattern matching helps here)
if (obj instanceof List<?> list && list.size() > 0 && list.get(0) instanceof String s) {
    System.out.println("First string: " + s);
}
```

## Common org scenarios

**Payment service:** casting `long` cents to `BigDecimal` without losing precision:

```java
// WRONG: double loses cents
BigDecimal amount = new BigDecimal(19.99);  // may be 19.9899999...

// RIGHT: start from String or long
BigDecimal amount = new BigDecimal("19.99");
BigDecimal fromCents = BigDecimal.valueOf(1999L).movePointLeft(2);  // exact: 19.99
```

**Configuration parsing:** safe integer parsing with defaults:

```java
public static int safeInt(String value, int defaultValue) {
    try {
        return Integer.parseInt(value);  // throws if not a number
    } catch (NumberFormatException e) {
        return defaultValue;
    }
}
// Usage: int port = safeInt(config.get("server.port"), 8080);
```

**Enum from int:** the reverse of ordinal:

```java
public static <E extends Enum<E>> E fromOrdinal(Class<E> enumType, int ordinal) {
    E[] values = enumType.getEnumConstants();
    if (ordinal < 0 || ordinal >= values.length) {
        throw new IllegalArgumentException("Invalid ordinal: " + ordinal);
    }
    return values[ordinal];
}
```

## Key takeaways

- Widening (`int → long → double`) is safe and automatic; narrowing (`long → int`) requires an explicit cast and may truncate.
- `long → float` and `long → double` are widening but can lose precision for large values.
- Autoboxing wraps primitives in objects — avoid in hot loops; prefer `long` over `Long` for accumulators.
- Never use `==` on wrapper types; always `.equals()`. The Integer cache (-128 to 127) makes `==` unreliable.
- Cast `byte` values to `int` with `& 0xFF` when treating them as unsigned.
