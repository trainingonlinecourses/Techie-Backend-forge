---
title: Java Language Fundamentals — Types, Operators, Control Flow, and Strings
summary: Everything a beginner needs to know about Java basics: primitives vs objects, type system, operators with precedence rules, every control flow statement explained, and String handling with line-by-line code walkthroughs.
order: 2
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

```java
// Line-by-line explanation:
int age = 25;              // Creates an int variable named 'age' with value 25
                           // Java allocates 4 bytes on the stack for this

long population = 8_000_000_000L;  // The 'L' suffix tells Java this is a long, not an int
                                    // Without 'L', Java treats 8000000000 as int and gives an error
                                    // The underscores are just for readability — Java ignores them

double price = 19.99;     // double is the default decimal type — no suffix needed
float pi = 3.14f;         // 'f' suffix required — without it, Java treats 3.14 as double
                           // and won't fit a double into a float variable

char grade = 'A';         // Single quotes for char (one character)
                           // char is actually a number — 'A' is Unicode 65
                           // You can do: int asciiValue = grade; // gives 65

boolean isActive = true;  // Only two values: true or false
                           // Used in conditions: if (isActive) { ... }
```

### Objects — everything else

```java
// String is an OBJECT (not a primitive)
String name = "Alice";          // Double quotes for String (can be multiple characters)
String other = name;            // This copies the REFERENCE, not the value!
                                // Both 'name' and 'other' point to the SAME "Alice" object

// Objects live on the HEAP (shared memory area)
// Primitives live on the STACK (per-thread memory)

// Wrapper classes — objects that wrap primitives
Integer count = 42;             // Autoboxing: int → Integer automatically
int raw = count;                // Unboxing: Integer → int automatically

// Why wrappers exist: generics don't work with primitives
// List<int> numbers;           // COMPILE ERROR — generics need objects
List<Integer> numbers = List.of(1, 2, 3);  // Works — Integer is an object
```

### The critical difference: == on primitives vs objects

```java
// PRIMITIVES: == compares values (what you expect)
int a = 10;
int b = 10;
System.out.println(a == b);     // true — both are 10

// OBJECTS: == compares REFERENCES (memory addresses), not values!
String s1 = "Hello";
String s2 = "Hello";
System.out.println(s1 == s2);   // true — BUT only because both point to the same pool entry!

String s3 = new String("Hello");
System.out.println(s1 == s3);   // FALSE! s3 is a new object on the heap
System.out.println(s1.equals(s3));  // true — use .equals() to compare values

// This is the #1 beginner mistake in Java
// RULE: ALWAYS use .equals() for objects, NEVER == (except for enums)
```

## Operators — what you can do with values

### Arithmetic operators

```java
int a = 10, b = 3;

System.out.println(a + b);     // 13 — addition
System.out.println(a - b);     // 7  — subtraction
System.out.println(a * b);     // 30 — multiplication
System.out.println(a / b);     // 3  — INTEGER division (truncates decimal!)
System.out.println(a % b);     // 1  — modulo (remainder): 10 = 3*3 + 1

// WARNING: integer division truncates
System.out.println(7 / 2);     // 3, NOT 3.5! Both operands are int
System.out.println(7.0 / 2);   // 3.5 — one operand is double, so result is double
System.out.println((double) 7 / 2);  // 3.5 — explicit cast also works
```

### Comparison operators — produce boolean results

```java
int x = 5, y = 10;

System.out.println(x == y);    // false — equal?
System.out.println(x != y);    // true  — not equal?
System.out.println(x > y);     // false — greater than?
System.out.println(x < y);     // true  — less than?
System.out.println(x >= 5);    // true  — greater than or equal?
System.out.println(x <= 5);    // true  — less than or equal?
```

### Logical operators — combine boolean conditions

```java
boolean age18 = true;
boolean hasTicket = false;
boolean isVip = true;

// && (AND): both must be true
System.out.println(age18 && hasTicket);      // false (hasTicket is false)

// || (OR): at least one must be true
System.out.println(hasTicket || isVip);       // true (isVip is true)

// ! (NOT): reverses the boolean
System.out.println(!hasTicket);               // true (NOT false = true)

// Short-circuit evaluation: Java stops as soon as it knows the answer
// In (A && B), if A is false, B is never evaluated
// In (A || B), if A is true, B is never evaluated
String s = null;
if (s != null && s.length() > 0) {    // safe! s.length() never runs if s is null
    System.out.println(s);
}
```

### Assignment operators

```java
int x = 10;         // basic assignment

x += 5;             // same as x = x + 5;   now x is 15
x -= 3;             // same as x = x - 3;   now x is 12
x *= 2;             // same as x = x * 2;   now x is 24
x /= 4;             // same as x = x / 4;   now x is 6
x %= 4;             // same as x = x % 4;   now x is 2 (remainder of 6/4)
```

## Control flow — making decisions and repeating

### if / else if / else

```java
int score = 85;

if (score >= 90) {                    // First condition checked
    System.out.println("Grade: A");
} else if (score >= 80) {             // Only checked if first was false
    System.out.println("Grade: B");
} else if (score >= 70) {             // Only checked if all above were false
    System.out.println("Grade: C");
} else {                               // Always runs if nothing above matched
    System.out.println("Grade: F");
}
// Output: "Grade: B"

// Ternary operator — shorthand for simple if/else
String result = (score >= 60) ? "Pass" : "Fail";  // If condition is true, "Pass"; else "Fail"
```

### switch — multi-way branching

```java
// OLD STYLE (pre-Java 14) — fall-through bugs are common
String day = "MONDAY";
switch (day) {
    case "MONDAY":
    case "TUESDAY":
    case "WEDNESDAY":
    case "THURSDAY":
    case "FRIDAY":
        System.out.println("Weekday");
        break;                          // MUST remember break! Without it, falls through to next case
    case "SATURDAY":
    case "SUNDAY":
        System.out.println("Weekend");
        break;
    default:
        System.out.println("Unknown");
}

// MODERN STYLE (Java 14+) — arrow syntax, NO fall-through, NO break needed
String type = switch (day) {
    case "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY" -> "Weekday";
    case "SATURDAY", "SUNDAY" -> "Weekend";
    default -> "Unknown";
};

// Switch can also RETURN values (expression switch)
int numLetters = switch (day) {
    case "MONDAY", "FRIDAY", "SUNDAY" -> 6;     // "MONDAY" has 6 letters
    case "TUESDAY" -> 7;                          // "TUESDAY" has 7 letters
    case "WEDNESDAY" -> 9;                        // "WEDNESDAY" has 9 letters
    case "THURSDAY", "SATURDAY" -> 8;
    default -> throw new IllegalArgumentException("Unknown day: " + day);
};
```

### Loops — repeating actions

```java
// FOR LOOP: when you know how many times to repeat
for (int i = 0; i < 5; i++) {       // i starts at 0, runs while i < 5, increments i each time
    System.out.println("Count: " + i);  // prints 0, 1, 2, 3, 4
}

// ENHANCED FOR-EACH: when you want to visit every element
String[] fruits = {"Apple", "Banana", "Cherry"};
for (String fruit : fruits) {        // fruit takes each value in the array
    System.out.println(fruit);       // prints "Apple", "Banana", "Cherry"
}

// WHILE LOOP: when you don't know how many times
int count = 0;
while (count < 5) {                  // runs as long as condition is true
    System.out.println(count);
    count++;                         // MUST increment! Otherwise infinite loop
}

// DO-WHILE: runs at least ONCE, then checks condition
int input = 0;
do {
    System.out.println("Processing: " + input);
    input++;                         // simulate getting input
} while (input < 5);                // check happens AFTER the loop body

// BREAK: exit the loop immediately
for (int i = 0; i < 100; i++) {
    if (i == 5) break;              // stop when i reaches 5
    System.out.println(i);          // prints 0, 1, 2, 3, 4
}

// CONTINUE: skip to next iteration
for (int i = 0; i < 10; i++) {
    if (i % 2 == 0) continue;      // skip even numbers
    System.out.println(i);          // prints 1, 3, 5, 7, 9
}
```

## Strings — the most used object in Java

### String is immutable

```java
String s = "Hello";
s.concat(" World");                  // Returns a NEW string "Hello World"
System.out.println(s);               // Still "Hello"! The original is unchanged
s = s.concat(" World");              // NOW s points to "Hello World" (new object)
```

**Why immutable?** Because strings are shared everywhere. If one thread could change a string, all threads seeing that string would break. Immutability makes strings thread-safe by design.

### String building — don't concatenate in loops

```java
// BAD: O(n²) — creates a new String object on every concatenation
String result = "";
for (int i = 0; i < 10000; i++) {
    result += i + ",";               // Creates a NEW String every time
    // After 10000 iterations, you've created 10000 intermediate strings
    // Total memory: ~50MB of wasted garbage
}

// GOOD: O(n) — StringBuilder modifies the same buffer
StringBuilder sb = new StringBuilder();   // Creates a resizable character buffer
for (int i = 0; i < 10000; i++) {
    sb.append(i).append(",");             // Appends to the SAME buffer (no new objects)
}
String result = sb.toString();            // Convert buffer to String once at the end
// Total memory: ~100KB — same result, 500x less garbage
```

### Essential String methods

```java
String email = "  Alice@Example.COM  ";

// .strip() — removes leading/trailing whitespace (better than .trim())
String clean = email.strip();                    // "Alice@Example.COM"

// .toLowerCase() / .toUpperCase() — case conversion
String lower = clean.toLowerCase();              // "alice@example.com"

// .contains() — check if substring exists
boolean hasAt = clean.contains("@");             // true

// .startsWith() / .endsWith() — prefix/suffix check
boolean isCom = clean.endsWith(".COM");          // true (case-sensitive!)

// .split() — break string into array
String csv = "Alice,30,NYC";
String[] parts = csv.split(",");                 // ["Alice", "30", "NYC"]
String name = parts[0];                          // "Alice"
int age = Integer.parseInt(parts[1]);            // 30 (convert String to int)

// .join() — combine array into string
String joined = String.join(" | ", parts);       // "Alice | 30 | NYC"

// .length() — number of characters
int len = "Hello".length();                      // 5

// .charAt() — get character at position
char first = "Hello".charAt(0);                  // 'H'

// .substring() — extract part of string
String sub = "Hello World".substring(6);          // "World" (from index 6 to end)
String sub2 = "Hello World".substring(0, 5);      // "Hello" (from 0 to 5, exclusive)
```

## Autoboxing — the automatic wrapper conversion

```java
// Autoboxing: primitive → wrapper (happens automatically)
Integer num = 42;           // Java automatically converts int 42 to Integer.valueOf(42)

// Unboxing: wrapper → primitive (happens automatically)
int raw = num;              // Java automatically calls num.intValue()

// The Integer cache trap — why == fails for some values
Integer a = 127;
Integer b = 127;
System.out.println(a == b);     // true — Java caches Integers from -128 to 127

Integer c = 200;
Integer d = 200;
System.out.println(c == d);     // FALSE! Values > 127 are not cached
System.out.println(c.equals(d)); // true — use .equals() for reliable comparison

// Autoboxing in collections
List<Integer> numbers = new ArrayList<>();
numbers.add(42);             // Java auto-converts int 42 to Integer
int value = numbers.get(0);  // Java auto-converts Integer back to int
```

## How we use it in organizations

### Scenario 1: Type safety prevents production bugs

```java
// WITHOUT type checking (JavaScript-style — dangerous)
// function process(orderId) — orderId could be a String, Number, null, anything

// WITH Java's type system
public void processOrder(OrderId orderId) {   // orderId MUST be an OrderId
    // The compiler guarantees orderId is never null, never a String, never the wrong type
    // This entire class of bugs is eliminated at compile time
}
```

### Scenario 2: String comparison bug in production

```java
// COMMON PRODUCTION BUG: comparing status strings with ==
public class Order {
    private String status;  // "ACTIVE", "SHIPPED", "CANCELLED"

    public boolean isActive() {
        return status == "ACTIVE";  // BUG! Works in tests (literals), fails with DB data
        // Fix: return "ACTIVE".equals(status);
    }
}
```

### Scenario 3: Integer overflow in financial calculations

```java
// DANGER: int overflow in financial calculations
int priceInCents = 2_000_000_000;   // $20 million in cents
int quantity = 2;
int total = priceInCents * quantity; // OVERFLOW! Returns negative number

// SAFER: use long for money-related calculations
long safeTotal = (long) priceInCents * quantity;  // Correct: 4 billion
// BEST: use BigDecimal for money (see java-bigdecimal lesson)
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
