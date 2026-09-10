---
title: Java Language Fundamentals — Types, Operators, Control Flow, and Strings
summary: Everything a beginner needs to know about Java basics: primitives vs objects, type system, operators with precedence rules, every control flow statement explained, and String handling with line-by-line code walkthroughs.
order: 48
minutes: 35
topics: [types, primitives, control-flow, strings, operators, autoboxing, switch, loops]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/datatypes.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/operatorts.html
---

# Java Language Fundamentals — Types, Operators, Control Flow, and Strings

## What is a type? Why does Java care?

In Java, **every variable has a type**. The type tells Java two things:
1. How much memory to allocate (an `int` gets 4 bytes, a `double` gets 8 bytes).
2. What operations are allowed (you can add two `int`s but not an `int` and a `String`).

This is called **static typing** — Java checks types at compile time, before your program runs. If you try to assign a `String` to an `int` variable, the compiler stops you immediately. This catches thousands of bugs before they ever reach production.

**Beginner mental model:** Think of types like containers. A `int` box can only hold whole numbers. A `String` box can only hold text. You can't pour water (String) into a solid box (int) — the compiler won't let you.

## Primitives vs Objects — the most important distinction in Java

Java has **8 primitive types** and everything else is an **object** (reference type).

### The 8 primitives

| Primitive | Size | What it holds | Example | Default |
|---|---|---|---|---|
| `byte` | 1 byte | Small integers (-128 to 127) | `byte b = 100;` | `0` |
| `short` | 2 bytes | Medium integers (-32K to 32K) | `short s = 30000;` | `0` |
| `int` | 4 bytes | Regular integers (most common) | `int count = 42;` | `0` |
| `long` | 8 bytes | Large integers | `long big = 9_000_000_000L;` | `0L` |
| `float` | 4 bytes | Decimal (single precision) | `float pi = 3.14f;` | `0.0f` |
| `double` | 8 bytes | Decimal (double precision, default) | `double price = 19.99;` | `0.0` |
| `char` | 2 bytes | Single character | `char c = 'A';` | `'\u0000'` |
| `boolean` | 1 bit | true or false | `boolean ok = true;` | `false` |


**What this code does — step by step:**

1. `int age = 25;` — Creates an int variable named 'age' with value 25. Java allocates 4 bytes on the stack for this
2. `long population = 8_000_000_000L;` — The 'L' suffix tells Java this is a long, not an int. Without 'L', Java treats 8000000000 as int and gives an error. The underscores are just for readability — Java ignores them
3. `double price = 19.99;` — double is the default decimal type — no suffix needed
4. `float pi = 3.14f;` — 'f' suffix required — without it, Java treats 3.14 as double. And won't fit a double into a float variable
5. `char grade = 'A';` — Single quotes for char (one character). Char is actually a number — 'A' is Unicode 65. You can do: int asciiValue = grade; // gives 65
6. `boolean isActive = true;` — Only two values: true or false. Used in conditions: if (isActive) { ... }

The same code, clean:

```java
int age = 25;

long population = 8_000_000_000L;

double price = 19.99;
float pi = 3.14f;

char grade = 'A';

boolean isActive = true;
```

### Objects — everything else


**What this code does — step by step:**

1. String is an OBJECT (not a primitive)
2. `String name = "Alice";` — Double quotes for String (can be multiple characters)
3. `String other = name;` — This copies the REFERENCE, not the value! Both 'name' and 'other' point to the SAME "Alice" object
4. Objects live on the HEAP (shared memory area). Primitives live on the STACK (per-thread memory)
5. Wrapper classes — objects that wrap primitives
6. `Integer count = 42;` — Autoboxing: int → Integer automatically
7. `int raw = count;` — Unboxing: Integer → int automatically
8. Why wrappers exist: generics don't work with primitives. List<int> numbers; // COMPILE ERROR — generics need objects
9. `List<Integer> numbers = List.of(1, 2, 3);` — Works — Integer is an object

The same code, clean:

```java
String name = "Alice";
String other = name;


Integer count = 42;
int raw = count;

List<Integer> numbers = List.of(1, 2, 3);
```

### The critical difference: == on primitives vs objects


**What this code does — step by step:**

1. PRIMITIVES: == compares values (what you expect)
2. `System.out.println(a == b);` — true — both are 10
3. OBJECTS: == compares REFERENCES (memory addresses), not values!
4. `System.out.println(s1 == s2);` — true — BUT only because both point to the same pool entry!
5. `System.out.println(s1 == s3);` — FALSE! s3 is a new object on the heap
6. `System.out.println(s1.equals(s3));` — true — use .equals() to compare values
7. This is the #1 beginner mistake in Java. RULE: ALWAYS use .equals() for objects, NEVER == (except for enums)

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int a = 10;
        int b = 10;
        System.out.println(a == b);

        String s1 = "Hello";
        String s2 = "Hello";
        System.out.println(s1 == s2);

        String s3 = new String("Hello");
        System.out.println(s1 == s3);
        System.out.println(s1.equals(s3));
    }
}
```

## Operators — what you can do with values

### Arithmetic operators


**What this code does — step by step:**

1. `System.out.println(a + b);` — 13 — addition
2. `System.out.println(a - b);` — 7 — subtraction
3. `System.out.println(a * b);` — 30 — multiplication
4. `System.out.println(a / b);` — 3 — INTEGER division (truncates decimal!)
5. `System.out.println(a % b);` — 1 — modulo (remainder): 10 = 3*3 + 1
6. WARNING: integer division truncates
7. `System.out.println(7 / 2);` — 3, NOT 3.5! Both operands are int
8. `System.out.println(7.0 / 2);` — 3.5 — one operand is double, so result is double
9. `System.out.println((double) 7 / 2);` — 3.5 — explicit cast also works

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int a = 10, b = 3;

        System.out.println(a + b);
        System.out.println(a - b);
        System.out.println(a * b);
        System.out.println(a / b);
        System.out.println(a % b);

        System.out.println(7 / 2);
        System.out.println(7.0 / 2);
        System.out.println((double) 7 / 2);
    }
}
```

### Comparison operators — produce boolean results


**What this code does — step by step:**

1. `System.out.println(x == y);` — false — equal?
2. `System.out.println(x != y);` — true — not equal?
3. `System.out.println(x > y);` — false — greater than?
4. `System.out.println(x < y);` — true — less than?
5. `System.out.println(x >= 5);` — true — greater than or equal?
6. `System.out.println(x <= 5);` — true — less than or equal?

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int x = 5, y = 10;

        System.out.println(x == y);
        System.out.println(x != y);
        System.out.println(x > y);
        System.out.println(x < y);
        System.out.println(x >= 5);
        System.out.println(x <= 5);
    }
}
```

### Logical operators — combine boolean conditions


**What this code does — step by step:**

1. && (AND): both must be true
2. `System.out.println(age18 && hasTicket);` — false (hasTicket is false)
3. || (OR): at least one must be true
4. `System.out.println(hasTicket || isVip);` — true (isVip is true)
5. ! (NOT): reverses the boolean
6. `System.out.println(!hasTicket);` — true (NOT false = true)
7. Short-circuit evaluation: Java stops as soon as it knows the answer. In (A && B), if A is false, B is never evaluated. In (A || B), if A is true, B is never evaluated
8. `if (s != null && s.length() > 0) {` — safe! s.length() never runs if s is null

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        boolean age18 = true;
        boolean hasTicket = false;
        boolean isVip = true;

        System.out.println(age18 && hasTicket);

        System.out.println(hasTicket || isVip);

        System.out.println(!hasTicket);

        String s = null;
        if (s != null && s.length() > 0) {
            System.out.println(s);
        }
    }
}
```

### Assignment operators


**What this code does — step by step:**

1. `int x = 10;` — basic assignment
2. `x += 5;` — same as x = x + 5; now x is 15
3. `x -= 3;` — same as x = x - 3; now x is 12
4. `x *= 2;` — same as x = x * 2; now x is 24
5. `x /= 4;` — same as x = x / 4; now x is 6
6. `x %= 4;` — same as x = x % 4; now x is 2 (remainder of 6/4)

The same code, clean:

```java
int x = 10;

x += 5;
x -= 3;
x *= 2;
x /= 4;
x %= 4;
```

## Control flow — making decisions and repeating

### if / else if / else


**What this code does — step by step:**

1. `if (score >= 90) {` — First condition checked
2. `} else if (score >= 80) {` — Only checked if first was false
3. `} else if (score >= 70) {` — Only checked if all above were false
4. `} else {` — Always runs if nothing above matched
5. Output: "Grade: B"
6. Ternary operator — shorthand for simple if/else
7. `String result = (score >= 60) ? "Pass" : "Fail";` — If condition is true, "Pass"; else "Fail"

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        int score = 85;

        if (score >= 90) {
            System.out.println("Grade: A");
        } else if (score >= 80) {
            System.out.println("Grade: B");
        } else if (score >= 70) {
            System.out.println("Grade: C");
        } else {
            System.out.println("Grade: F");
        }

        String result = (score >= 60) ? "Pass" : "Fail";
    }
}
```

### switch — multi-way branching


**What this code does — step by step:**

1. OLD STYLE (pre-Java 14) — fall-through bugs are common
2. `break;` — MUST remember break! Without it, falls through to next case
3. MODERN STYLE (Java 14+) — arrow syntax, NO fall-through, NO break needed
4. Switch can also RETURN values (expression switch)
5. `case "MONDAY", "FRIDAY", "SUNDAY" -> 6;` — "MONDAY" has 6 letters
6. `case "TUESDAY" -> 7;` — "TUESDAY" has 7 letters
7. `case "WEDNESDAY" -> 9;` — "WEDNESDAY" has 9 letters

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        String day = "MONDAY";
        switch (day) {
            case "MONDAY":
            case "TUESDAY":
            case "WEDNESDAY":
            case "THURSDAY":
            case "FRIDAY":
                System.out.println("Weekday");
                break;
            case "SATURDAY":
            case "SUNDAY":
                System.out.println("Weekend");
                break;
            default:
                System.out.println("Unknown");
        }

        String type = switch (day) {
            case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
            case "SATURDAY", "SUNDAY" -> "Weekend";
            default -> "Unknown";
        };

        int numLetters = switch (day) {
            case "MONDAY", "FRIDAY", "SUNDAY" -> 6;
            case "TUESDAY" -> 7;
            case "WEDNESDAY" -> 9;
            case "THURSDAY", "SATURDAY" -> 8;
            default -> throw new IllegalArgumentException("Unknown day: " + day);
        };
    }
}
```

### Loops — repeating actions


**What this code does — step by step:**

1. FOR LOOP: when you know how many times to repeat
2. `for (int i = 0; i < 5; i++) {` — i starts at 0, runs while i < 5, increments i each time
3. `System.out.println("Count: " + i);` — prints 0, 1, 2, 3, 4
4. ENHANCED FOR-EACH: when you want to visit every element
5. `for (String fruit : fruits) {` — fruit takes each value in the array
6. `System.out.println(fruit);` — prints "Apple", "Banana", "Cherry"
7. WHILE LOOP: when you don't know how many times
8. `while (count < 5) {` — runs as long as condition is true
9. `count++;` — MUST increment! Otherwise infinite loop
10. DO-WHILE: runs at least ONCE, then checks condition
11. `input++;` — simulate getting input
12. `} while (input < 5);` — check happens AFTER the loop body
13. BREAK: exit the loop immediately
14. `if (i == 5) break;` — stop when i reaches 5
15. `System.out.println(i);` — prints 0, 1, 2, 3, 4
16. CONTINUE: skip to next iteration
17. `if (i % 2 == 0) continue;` — skip even numbers
18. `System.out.println(i);` — prints 1, 3, 5, 7, 9

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        for (int i = 0; i < 5; i++) {
            System.out.println("Count: " + i);
        }

        String[] fruits = {"Apple", "Banana", "Cherry"};
        for (String fruit : fruits) {
            System.out.println(fruit);
        }

        int count = 0;
        while (count < 5) {
            System.out.println(count);
            count++;
        }

        int input = 0;
        do {
            System.out.println("Processing: " + input);
            input++;
        } while (input < 5);

        for (int i = 0; i < 100; i++) {
            if (i == 5) break;
            System.out.println(i);
        }

        for (int i = 0; i < 10; i++) {
            if (i % 2 == 0) continue;
            System.out.println(i);
        }
    }
}
```

## Strings — the most used object in Java

### String is immutable

String s = "Hello";
s.concat(" World");                  // Returns a NEW string "Hello World"
System.out.println(s);               // Still "Hello"! The original is unchanged
s = s.concat(" World");              // NOW s points to "Hello World" (new object)

**Why immutable?** Because strings are shared everywhere. If one thread could change a string, all threads seeing that string would break. Immutability makes strings thread-safe by design.

### String building — don't concatenate in loops


**What this code does — step by step:**

1. BAD: O(n²) — creates a new String object on every concatenation
2. `result += i + ",";` — Creates a NEW String every time. After 10000 iterations, you've created 10000 intermediate strings. Total memory: ~50MB of wasted garbage
3. GOOD: O(n) — StringBuilder modifies the same buffer
4. `StringBuilder sb = new StringBuilder();` — Creates a resizable character buffer
5. `sb.append(i).append(",");` — Appends to the SAME buffer (no new objects)
6. `String result = sb.toString();` — Convert buffer to String once at the end
7. Total memory: ~100KB — same result, 500x less garbage

The same code, clean:

```java
String result = "";
for (int i = 0; i < 10000; i++) {
    result += i + ",";
}

StringBuilder sb = new StringBuilder();
for (int i = 0; i < 10000; i++) {
    sb.append(i).append(",");
}
String result = sb.toString();
```

### Essential String methods


**What this code does — step by step:**

1. .strip() — removes leading/trailing whitespace (better than .trim())
2. `String clean = email.strip();` — "Alice@Example.COM"
3. .toLowerCase() / .toUpperCase() — case conversion
4. `String lower = clean.toLowerCase();` — "alice@example.com"
5. .contains() — check if substring exists
6. `boolean hasAt = clean.contains("@");` — true
7. .startsWith() / .endsWith() — prefix/suffix check
8. `boolean isCom = clean.endsWith(".COM");` — true (case-sensitive!)
9. .split() — break string into array
10. `String[] parts = csv.split(",");` — ["Alice", "30", "NYC"]
11. `String name = parts[0];` — "Alice"
12. `int age = Integer.parseInt(parts[1]);` — 30 (convert String to int)
13. .join() — combine array into string
14. `String joined = String.join(" | ", parts);` — "Alice | 30 | NYC"
15. .length() — number of characters
16. `int len = "Hello".length();` — 5
17. .charAt() — get character at position
18. `char first = "Hello".charAt(0);` — 'H'
19. .substring() — extract part of string
20. `String sub = "Hello World".substring(6);` — "World" (from index 6 to end)
21. `String sub2 = "Hello World".substring(0, 5);` — "Hello" (from 0 to 5, exclusive)

The same code, clean:

```java
String email = "  Alice@Example.COM  ";

String clean = email.strip();

String lower = clean.toLowerCase();

boolean hasAt = clean.contains("@");

boolean isCom = clean.endsWith(".COM");

String csv = "Alice,30,NYC";
String[] parts = csv.split(",");
String name = parts[0];
int age = Integer.parseInt(parts[1]);

String joined = String.join(" | ", parts);

int len = "Hello".length();

char first = "Hello".charAt(0);

String sub = "Hello World".substring(6);
String sub2 = "Hello World".substring(0, 5);
```

## Autoboxing — the automatic wrapper conversion


**What this code does — step by step:**

1. Autoboxing: primitive → wrapper (happens automatically)
2. `Integer num = 42;` — Java automatically converts int 42 to Integer.valueOf(42)
3. Unboxing: wrapper → primitive (happens automatically)
4. `int raw = num;` — Java automatically calls num.intValue()
5. The Integer cache trap — why == fails for some values
6. `System.out.println(a == b);` — true — Java caches Integers from -128 to 127
7. `System.out.println(c == d);` — FALSE! Values > 127 are not cached
8. `System.out.println(c.equals(d));` — true — use .equals() for reliable comparison
9. Autoboxing in collections
10. `numbers.add(42);` — Java auto-converts int 42 to Integer
11. `int value = numbers.get(0);` — Java auto-converts Integer back to int

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Integer num = 42;

        int raw = num;

        Integer a = 127;
        Integer b = 127;
        System.out.println(a == b);

        Integer c = 200;
        Integer d = 200;
        System.out.println(c == d);
        System.out.println(c.equals(d));

        List<Integer> numbers = new ArrayList<>();
        numbers.add(42);
        int value = numbers.get(0);
    }
}
```

## How we use it in organizations

### Scenario 1: Type safety prevents production bugs


**What this code does — step by step:**

1. WITHOUT type checking (JavaScript-style — dangerous). Function process(orderId) — orderId could be a String, Number, null, anything
2. WITH Java's type system
3. `public void processOrder(OrderId orderId) {` — orderId MUST be an OrderId. The compiler guarantees orderId is never null, never a String, never the wrong type. This entire class of bugs is eliminated at compile time

The same code, clean:

```java
public void processOrder(OrderId orderId) {
}
```

### Scenario 2: String comparison bug in production

// COMMON PRODUCTION BUG: comparing status strings with ==
public class Order {
    private String status;  // "ACTIVE", "SHIPPED", "CANCELLED"

    public boolean isActive() {
        return status == "ACTIVE";  // BUG! Works in tests (literals), fails with DB data
        // Fix: return "ACTIVE".equals(status);
    }
}

### Scenario 3: Integer overflow in financial calculations


**What this code does — step by step:**

1. DANGER: int overflow in financial calculations
2. `int priceInCents = 2_000_000_000;` — $20 million in cents
3. `int total = priceInCents * quantity;` — OVERFLOW! Returns negative number
4. SAFER: use long for money-related calculations
5. `long safeTotal = (long) priceInCents * quantity;` — Correct: 4 billion
6. BEST: use BigDecimal for money (see java-bigdecimal lesson)

The same code, clean:

```java
int priceInCents = 2_000_000_000;
int quantity = 2;
int total = priceInCents * quantity;

long safeTotal = (long) priceInCents * quantity;
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| `==` on String/Integer objects | Compares references, not values | Use `.equals()` |
| String concatenation in loops | O(n²) performance, memory waste | Use `StringBuilder` |
| Integer division: `7/2` | Returns 3, not 3.5 | Cast: `(double) 7/2` or `7.0/2` |
| Forget `break` in switch | Fall-through to next case | Use arrow syntax (Java 14+) |
| Autoboxing in tight loops | Hidden object creation, GC pressure | Use primitives directly |
| `Integer` == comparison for values > 127 | Returns false even for equal values | Use `.equals()` |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
