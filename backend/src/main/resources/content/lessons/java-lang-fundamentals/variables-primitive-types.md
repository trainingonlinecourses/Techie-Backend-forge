---
title: Variables and Primitive Types — The Building Blocks of State
summary: Every Java program stores data in variables, and every variable has a type. The eight primitive types — byte, short, int, long, float, double, char, boolean — are the only types that are not objects. This lesson explains each one, the ranges they cover, the default values they get, and the mistakes that come from treating them as interchangeable.
order: 4
minutes: 22
topics: [variables, primitives, int, long, float, double, char, boolean, byte, short, default-values, memory]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html#jls-4.2
---

## The Concept, From Zero

A variable in Java is a named location that holds a value. The name and the type are fixed when you declare the variable; the value can change (unless the variable is `final`). The type is the contract: it says what kind of value the variable can hold and what operations are legal on it.

Java has two families of types:

1. **Primitive types** — the eight built-in types above. They are not objects. They hold their value directly, not a reference to an object. There are only eight of them, and the language defines them, not you.
2. **Reference types** — everything else. A class type, an interface type, an array type, an enum. A variable of a reference type holds a reference (like a pointer, but safer) to an object, or `null` if it refers to nothing.

This lesson is about the eight primitives, because they are the foundation. Every other type is built on top of them or replaces them.

### The Eight Primitives

The eight primitive types are:

| Type | Size (bits) | Range / Values | Literal Example |
|---|---|---|---|
| `byte` | 8 | -128 to 127 | `10` |
| `short` | 16 | -32,768 to 32,767 | `100` |
| `int` | 32 | about -2 billion to +2 billion | `42` |
| `long` | 64 | about -9×10¹⁸ to +9×10¹⁸ | `100L` |
| `float` | 32 | about ±3.4×10³⁸, 6-7 significant digits | `3.14f` |
| `double` | 64 | about ±1.7×10³⁰⁸, 15-17 significant digits | `3.14` |
| `char` | 16 | 0 to 65535 (Unicode code units) | `'A'` |
| `boolean` | not specified by the JLS (usually 1 bit in practice) | `true` or `false` | `true` |

The sizes matter because they tell you what range of values a variable can hold. If you need to store a number larger than 2 billion, `int` is not enough — you need `long`. If you need a Unicode character, you need `char`, which is 16 bits and can hold a UTF-16 code unit.

A common beginner mistake is to think of `char` as "a small integer." It is a 16-bit unsigned integer under the hood, but its purpose is to hold a character, and its literals are written in single quotes. You can do arithmetic on a `char`, but you usually should not — that is a sign you are using the wrong type for the job.

### Default Values — What You Get If You Do Not Assign Anything

When you declare a field (a variable that belongs to a class, outside any method) and do not assign it a value, Java gives it a default.

| Type | Default |
|---|---|
| `byte` | `0` |
| `short` | `0` |
| `int` | `0` |
| `long` | `0L` |
| `float` | `0.0f` |
| `double` | `0.0d` (or just `0.0`) |
| `char` | `'\u0000'` (the null character) |
| `boolean` | `false` |

These defaults are why a field like `private int count;` is legal without assignment — Java fills it with `0` when the object is created. For local variables (variables declared inside a method), there is no default — you must assign a value before you use them, or the compiler complains.


**What this code does — step by step:**

1. fields get default values
2. `int count;` — 0
3. `boolean active;` — false
4. `char c;` — '\u0000'
5. local variables: NO default — must be assigned first
6. `int x;` — not assigned. System.out.println(x); // compilation error — variable x might not have been initialized
7. `int y = 0;` — assigned — OK

The same code, clean:

```java
class Demo {
    int count;
    boolean active;
    char c;
}

public class Main {
    public static void main(String[] args) {
        int x;
        int y = 0;
        System.out.println(y);
    }
}
```

This distinction between fields and local variables is important. Fields are part of an object and are given defaults so that an object is always in a valid state even if you only set some of its fields. Local variables live only inside a method and the compiler enforces that you assign them before use, which catches bugs earlier.

### Literals — How You Write a Value in Code

A literal is the way you write a value directly in the source code. Each primitive type has its own literal syntax.

- **`int`** — just write the number: `42`, `0`, `-7`, `1_000_000` (underscores are allowed since Java 7 for readability).
- **`long`** — write the number with an `L` suffix: `100L`, `9_223_372_036_854_775_807L`. The `L` (or `l`, but uppercase is clearer) tells the compiler this is a `long`, not an `int`.
- **`float`** — write a decimal with an `f` or `F` suffix: `3.14f`, `2.5F`. Without the suffix, `3.14` is a `double`, and assigning it to a `float` without casting causes a compilation error.
- **`double`** — write a decimal: `3.14`, `2.5`, `1.0e10` (scientific notation). The default decimal literal is `double`.
- **`char`** — single quotes around a single character: `'A'`, `'€'`, `'\n'`. Escape sequences are allowed.
- **`boolean`** — only `true` or `false`. These are the only two boolean literals, and they are not numbers — you cannot write `if (1)` in Java; it must be `if (true)` or `if (x > 0)`.


**What this code does — step by step:**

1. `int     i = 42;` — int literal
2. `long    l = 42L;` — long literal — the L matters
3. `float   f = 3.14f;` — float literal — the f matters
4. `double  d = 3.14;` — double literal (default)
5. `char    c = 'A';` — char literal
6. `boolean b = true;` — boolean literal
7. `int     million = 1_000_000;` — underscores for readability (Java 7+)

The same code, clean:

```java
int     i = 42;
long    l = 42L;
float   f = 3.14f;
double  d = 3.14;
char    c = 'A';
boolean b = true;
int     million = 1_000_000;
```

The suffixes matter because of the type system. `3.14` is a `double`. Writing `float f = 3.14;` is a compilation error because a `double` literal does not fit into a `float` without an explicit cast (and even then, you lose precision). Writing `float f = 3.14f;` is correct.

The same goes for integers: `long l = 100;` is fine because `100` is an `int` literal and it fits in a `long`. But `int i = 100L;` is an error because a `long` literal does not fit into an `int` without a cast.

### The Integer Types — byte, short, int, long

These four types hold whole numbers of different sizes. The choice between them is about range and memory, not about precision — all integer arithmetic in Java is exact within the type's range.

- **`byte`** — 8 bits, -128 to 127. Useful for large arrays of small numbers where memory matters, or for raw binary data. In practice, many teams just use `int` for everything and ignore `byte` except when reading binary streams.
- **`short`** — 16 bits, -32,768 to 32,767. Rarely used in modern Java; it exists for compatibility with older APIs and for packing data tightly.
- **`int`** — 32 bits, about -2.1 billion to +2.1 billion. The default integer type. Most counters, indices, and general numbers are `int`.
- **`long`** — 64 bits. Used when the value exceeds the `int` range — timestamps, large IDs, distances in small units.

A key rule: integer arithmetic wraps around on overflow. If you add 1 to `Integer.MAX_VALUE` (2,147,483,647), you get `Integer.MIN_VALUE` (-2,147,483,648) — not an error. This is a common source of bugs.

```java
int max = Integer.MAX_VALUE;   // 2,147,483,647
int overflow = max + 1;        // -2,147,483,648 — wraps, does not throw
System.out.println(overflow);   // -2147483648
```

The JVM does not throw on integer overflow by default. In safety-critical code, you can check for overflow explicitly or use `Math.addExact`, which throws an `ArithmeticException` on overflow:

```java
int safe = Math.addExact(max, 1);   // throws ArithmeticException — overflow
```

### The Floating-Point Types — float, double

`float` and `double` hold decimal numbers, but they do it in binary floating-point, which means many decimal values cannot be represented exactly. This is the source of the classic "why is 0.1 + 0.2 not 0.3?" surprise.

```java
public class Main {

    public static void main(String[] args) {
        double a = 0.1;
        double b = 0.2;
        System.out.println(a + b);          // 0.30000000000000004 — not 0.3
    }
}
```

This is not a Java problem — it is how binary floating-point works, and it affects Python, C, JavaScript, and most languages. The fix for money and other exact decimal values is `BigDecimal`, not `float` or `double`.

```java
import java.math.BigDecimal;

public class Main {

    public static void main(String[] args) {

        BigDecimal x = new BigDecimal("0.1");
        BigDecimal y = new BigDecimal("0.2");
        System.out.println(x.add(y));        // 0.3 exactly
    }
}
```

Use `double` for measurements, scientific calculations, and cases where tiny imprecision is acceptable. Use `BigDecimal` for money, percentages that must be exact, and any calculation where the decimal value matters exactly.

### The char Type

`char` is a 16-bit unsigned value that holds a UTF-16 code unit. In the Basic Multilingual Plane (the most common characters), one `char` is one character. For characters outside the Basic Multilingual Plane — like many emoji — a single character is represented by two `char` values (a surrogate pair).

This means a Java `String`'s `length()` is the number of `char`s, not the number of visible characters. An emoji can have `length()` 2.

```java
String emoji = "😀";
System.out.println(emoji.length());   // 2 — one emoji, two char values (surrogate pair)
```

Do not use `char` as a small integer. If you need a small integer, use `short` or `byte`. If you need a character, use `char`. If you need a string, use `String`. The types are not interchangeable even though they all hold numbers under the hood.

### The boolean Type

`boolean` holds `true` or `false`. It is the type of every condition. Unlike C and some other languages, Java does not let you use numbers as booleans — `if (1)` is an error, and you must write `if (true)` or `if (x > 0)`.

```java
public class Main {

    public static void main(String[] args) {
        boolean isLoggedIn = true;
        boolean hasAccess = user.getRoles().contains("ADMIN");

        if (isLoggedIn && hasAccess) {
            System.out.println("welcome");
        }

        // This is an error in Java:
        // if (1) { ... }   // compilation error — int cannot be converted to boolean
    }
}
```

`boolean` values are the result of comparisons: `x > 0`, `name.equals("Alice")`, `list.isEmpty()`, `number % 2 == 0`. Every condition in every `if`, `while`, `for`, and `switch` boils down to a `boolean`.

### Type Conversion — When Java Auto-Converts and When It Does Not

Java allows some automatic conversions between primitives, called **widening primitive conversions**. These are safe because the destination type can hold all values of the source type.


**What this code does — step by step:**

1. `short   s = b;` — OK — byte fits in short
2. `int     i = s;` — OK
3. `long    l = i;` — OK
4. `float   f = i;` — OK — int to float (can lose precision for very large ints)
5. `double  d = f;` — OK

The same code, clean:

```java
byte    b = 5;
short   s = b;
int     i = s;
long    l = i;
float   f = i;
double  d = f;
```

Narrowing conversions — going the other way — are not automatic, because they can lose information.

```java
int i = 1000;
// short s = i;        // compilation error — int might not fit in short
short s = (short) i;   // explicit cast — the compiler says "I trust you"
```

For integers, narrowing casts truncate. For floating-point, casting to an integer discards the fractional part.

```java
double d = 3.99;
int n = (int) d;   // 3 — not 4, the fractional part is discarded
```

### Variable Scope — Where a Variable Lives

A variable's scope is the region of the program where it is accessible.

- **Class-level fields** — visible to all methods in the class (subject to access modifiers like `private`). They live as long as the object lives.
- **Method parameters** — visible throughout the method.
- **Local variables** — visible from their declaration to the end of the block `{ ... }` they are in. A variable declared in an `if` block is not visible after the `if`.


**What this code does — step by step:**

1. `int outside = 1;` — visible throughout the method
2. `int inside = 2;` — visible only inside this if block
3. `System.out.println(outside);` — OK — outside is in scope
4. `System.out.println(outside);` — OK. System.out.println(inside); // compilation error — inside is out of scope

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        public void process() {
            int outside = 1;

            if (true) {
                int inside = 2;
                System.out.println(outside);
            }

            System.out.println(outside);
        }
    }
}
```

Shadowing happens when a local variable or parameter has the same name as a field. The local one hides the field inside its scope, which is a common source of bugs.

```java
class User {
    private String name = "default";

    public void setName(String name) {   // parameter shadows the field
        // name = name;   // Oops — assigns the parameter to itself
        this.name = name;  // 'this.name' is the field; 'name' is the parameter
    }
}
```

## A Code Example — Declaring and Using Variables

This example shows the eight primitives being declared, used, and printed, plus a few of the rules in action.


**What this code does — step by step:**

1. Fields — get default values if not assigned
2. `byte    byteField;` — 0
3. `short   shortField;` — 0
4. `int     intField;` — 0
5. `long    longField;` — 0L
6. `float   floatField;` — 0.0f
7. `double  doubleField;` — 0.0
8. `char    charField;` — '\u0000'
9. `boolean boolField;` — false
10. Local variables — must be assigned before use
11. `long    l = 100_000_000_000L;` — underscores for readability; L suffix
12. `float   f = 3.14f;` — f suffix required
13. `double  d = 2.718;` — default decimal literal
14. `char    c = 'A';` — char literal
15. `boolean flag = true;` — only true or false
16. Type conversions
17. `int fromLong = (int) l;` — narrowing cast
18. `double fromInt = i;` — widening — automatic
19. `float fromDouble = (float) d;` — narrowing cast
20. Integer overflow does not throw
21. `System.out.println("overflow: " + overflow);` — -2147483648
22. Safe addition
23. `int safe = Math.addExact(Integer.MAX_VALUE, 1);` — throws ArithmeticException
24. Floating-point imprecision
25. `System.out.println("0.1 + 0.2 = " + sum);` — 0.30000000000000004
26. boolean conditions
27. char is a number under the hood
28. `char nextLetter = (char) (c + 1);` — 'B'

The same code, clean:

```java
public class PrimitivesDemo {
    byte    byteField;
    short   shortField;
    int     intField;
    long    longField;
    float   floatField;
    double  doubleField;
    char    charField;
    boolean boolField;

    public static void main(String[] args) {

        byte    b = 10;
        short   s = 1000;
        int     i = 42;
        long    l = 100_000_000_000L;
        float   f = 3.14f;
        double  d = 2.718;
        char    c = 'A';
        boolean flag = true;

        System.out.println("byte:    " + b);
        System.out.println("short:   " + s);
        System.out.println("int:     " + i);
        System.out.println("long:    " + l);
        System.out.println("float:   " + f);
        System.out.println("double:  " + d);
        System.out.println("char:    " + c);
        System.out.println("boolean: " + flag);

        int fromLong = (int) l;
        double fromInt = i;
        float fromDouble = (float) d;

        int overflow = Integer.MAX_VALUE + 1;
        System.out.println("overflow: " + overflow);

        int safe = Math.addExact(Integer.MAX_VALUE, 1);

        double sum = 0.1 + 0.2;
        System.out.println("0.1 + 0.2 = " + sum);

        boolean isEven = i % 2 == 0;
        System.out.println("is " + i + " even? " + isEven);

        char nextLetter = (char) (c + 1);
        System.out.println("next after 'A': " + nextLetter);
    }
}
```

Line by line:

- **`byte b = 10;`** — a `byte` variable. The literal `10` is an `int`, but it fits in a `byte`, so the assignment is allowed (within range).
- **`long l = 100_000_000_000L;`** — the `L` suffix makes it a `long` literal. The underscores are ignored — they are for readability. Without the `L`, the number would be an `int` literal and too large, causing a compilation error.
- **`float f = 3.14f;`** — the `f` suffix makes it a `float` literal. Without it, `3.14` is a `double` and the assignment would be an error.
- **`char c = 'A';`** — a `char` literal in single quotes.
- **`boolean flag = true;`** — a boolean literal. Note: only `true` and `false` are valid; you cannot write `boolean flag = 1;`.
- **`System.out.println(...)`** — prints each variable. Java automatically converts primitives to their string representation for concatenation.
- **`int fromLong = (int) l;`** — an explicit narrowing cast. The compiler requires it because information might be lost. Here, the value fits, so it is safe, but the cast is still required.
- **`double fromInt = i;`** — a widening conversion, automatic. `int` fits in `double`.
- **`int overflow = Integer.MAX_VALUE + 1;`** — demonstrates wrap-around overflow. No error, no exception — just a negative number.
- **`int safe = Math.addExact(...)`** — the safe version that throws on overflow.
- **`double sum = 0.1 + 0.2;`** — the classic floating-point imprecision example.
- **`char nextLetter = (char) (c + 1);`** — `char` arithmetic. `'A' + 1` is evaluated as an `int`, so we cast back to `char` to get `'B'`.

## Where This Shows Up in an Organization

In a backend team, the primitive types show up everywhere. Database IDs that fit in a normal range are `int`; large IDs from distributed systems are often `long`; timestamps are `long`; flags are `boolean`; single characters are `char`; and everything that is not one of these is a reference type.

The choice between `float` and `double` matters in data pipelines. If you are averaging sensor readings and small imprecision is fine, `double` is plenty. If you are accumulating money, you reach for `BigDecimal` — and the difference between the two is the difference between a reconciliation that balances and one that is off by a few cents after a million transactions.

Integer overflow is a real bug in production. A counter that increments once per request and wraps after 2 billion requests has overflowed. A `long` pushes that out to about 9 quintillion requests — far enough for most systems, but not forever. In a high-throughput service, the team might check the counter's range or use `Math.addExact` in critical paths.

The `char` and UTF-16 detail shows up when validating input lengths. A form field limited to 10 "characters" might hold 20 `char`s if the user types emoji — so if you are checking `str.length() <= 10`, you might reject valid input or accept too much, depending on what you mean by "character." For user-visible character counts, you need `codePointCount`, not `length`.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Writing `float f = 3.14;` | Forgets that 3.14 is a double literal | Add the `f` suffix: `float f = 3.14f;` |
| Writing `long l = 9223372036854775807;` | Forgets the `L` suffix on a large literal | Add `L`: `long l = 9223372036854775807L;` |
| Using `float` or `double` for money | It is the default numeric type for many people | Use `BigDecimal` for exact decimal arithmetic, especially money |
| Assuming `0.1 + 0.2 == 0.3` | Floating-point arithmetic is exact in decimal, not binary | Compare with a tolerance: `Math.abs(a + b - 0.3) < 1e-9` |
| Expecting `boolean` to convert from an `int` | C and JavaScript allow `if (1)` | Java requires a boolean expression: `if (x > 0)` |
| Forgetting to assign a local variable before use | Fields get defaults; locals do not | Always assign local variables before reading them |
| Using `char` as a small integer | `char` is a 16-bit unsigned integer under the hood, so it "works" | Use `short` or `byte` for small integers; reserve `char` for characters |
| Assuming `String.length()` counts visible characters | `length()` counts `char` values, and emoji are two `char`s | Use `codePointCount(0, str.length())` for user-perceived character counts |
| Integer overflow surprises | The JVM wraps silently on overflow | Use `Math.addExact`/`subtractExact`/`multiplyExact` for safety-critical arithmetic |

## For the Practice Lab

In the lab, you will see a starter `VariablesExercise.java` with several deliberate bugs: a `float` assigned from a `double` literal without the `f` suffix, a `long` assigned a large literal without the `L` suffix, a `boolean` used in an arithmetic expression, a local variable read before assignment, and an integer overflow waiting to happen. Fix each bug, then add a small section that demonstrates `Math.addExact` throwing on overflow and a `BigDecimal` addition that stays exact — that is the moment the difference between `double` and `BigDecimal` becomes concrete.

## Summary

Java has eight primitive types: `byte`, `short`, `int`, `long` (integers), `float`, `double` (floating-point), `char` (16-bit Unicode), and `boolean` (true/false). They are not objects and hold their values directly. Fields get default values (0, 0.0, false, '\u0000'); local variables do not and must be assigned before use. Integer arithmetic wraps on overflow silently unless you use `Math.addExact`; floating-point arithmetic is not exact for many decimal values, so money belongs in `BigDecimal`. The `char` type is a 16-bit Unicode code unit, not a small integer, and a `String`'s `length()` counts `char` values, not visible characters. The choice of primitive is a choice about range, precision, memory, and correctness — and getting it wrong is how subtle production bugs happen.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/specs/jvms/se21/html/)
