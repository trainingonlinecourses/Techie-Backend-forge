---
title: Wrapper Classes — Autoboxing, Caching, and Pitfalls
summary: What wrapper classes are, autoboxing/unboxing, the Integer cache, NumberFormatException, and how organizations handle type conversions safely.
order: 1
minutes: 22
topics: [wrapper-classes, autoboxing, unboxing, integer-cache, numberformatexception]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/autoboxing.html
---

## The Concept, From Zero

Java has 8 primitive types (`int`, `double`, `boolean`, etc.) and 8 corresponding **wrapper classes** (`Integer`, `Double`, `Boolean`, etc.):

| Primitive | Wrapper | Size |
|-----------|---------|------|
| `int` | `Integer` | 4 bytes |
| `long` | `Long` | 8 bytes |
| `double` | `Double` | 8 bytes |
| `float` | `Float` | 4 bytes |
| `boolean` | `Boolean` | 1 bit |
| `char` | `Character` | 2 bytes |
| `byte` | `Byte` | 1 byte |
| `short` | `Short` | 2 bytes |

**Why wrappers exist:**
1. Generics don't work with primitives: `List<int>` ❌ → `List<Integer>` ✅
2. Can be `null` (primitives cannot)
3. Provide utility methods (`parseInt`, `toString`, etc.)

---

## Autoboxing & Unboxing

```java
// Autoboxing: primitive → wrapper (automatic)
Integer num = 42;           // int → Integer
Double pi = 3.14;           // double → Double
Boolean flag = true;        // boolean → Boolean

// Unboxing: wrapper → primitive (automatic)
int n = num;                // Integer → int
double d = pi;              // Double → double
boolean b = flag;           // Boolean → boolean

// Collections require wrappers
List<Integer> numbers = new ArrayList<>();
numbers.add(42);            // autoboxed: int → Integer
int value = numbers.get(0); // unboxed: Integer → int
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class WrapperClassesDemo {
    public static void main(String[] args) {
        // Line 1: Creating wrapper objects
        Integer a = Integer.valueOf(42);      // recommended
        Integer b = 42;                       // autoboxing (same as valueOf)
        Integer c = new Integer(42);          // DEPRECATED — don't use

        // Line 2: Parsing strings to numbers
        int parsed1 = Integer.parseInt("123");           // 123
        double parsed2 = Double.parseDouble("3.14");     // 3.14
        boolean parsed3 = Boolean.parseBoolean("true");   // true

        // Line 3: NumberFormatException — the #1 wrapper pitfall
        try {
            int bad = Integer.parseInt("abc");  // throws NumberFormatException
        } catch (NumberFormatException e) {
            System.out.println("Parse error: " + e.getMessage());
        }

        // Line 4: Integer cache (-128 to 127)
        Integer x = 127;
        Integer y = 127;
        System.out.println(x == y);          // true — cached!

        Integer p = 128;
        Integer q = 128;
        System.out.println(p == q);          // false — new objects!
        System.out.println(p.equals(q));     // true — use .equals()

        // Line 5: Useful utility methods
        System.out.println(Integer.MAX_VALUE);        // 2147483647
        System.out.println(Integer.MIN_VALUE);        // -2147483648
        System.out.println(Integer.compare(5, 3));    // 1
        System.out.println(Integer.max(5, 3));        // 5
        System.out.println(Integer.bitCount(7));       // 3 (binary: 111)
        System.out.println(Integer.toBinaryString(10)); // "1010"
        System.out.println(Integer.toHexString(255));   // "ff"

        // Line 6: String conversion
        String str = Integer.toString(42);      // "42"
        String hex = Integer.toHexString(255);  // "ff"
        String bin = Integer.toBinaryString(8);  // "1000"

        // Line 7: Nullable wrappers
        Integer maybeNull = null;
        // int primitiveNull = null;  // COMPILE ERROR

        // Safe conversion
        int safeValue = maybeNull != null ? maybeNull : 0;  // 0
        int safeWithOrDefault = Optional.ofNullable(maybeNull).orElse(0);

        // Line 8: Wrapper comparison
        Integer a1 = 200;
        Integer a2 = 200;
        System.out.println(a1 == a2);           // false (outside cache)
        System.out.println(a1.equals(a2));      // true
        System.out.println(a1.compareTo(a2));   // 0
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Safe parsing with default

```java
public static int safeParseInt(String input, int defaultValue) {
    try {
        return Integer.parseInt(input.strip());
    } catch (NumberFormatException | NullPointerException e) {
        return defaultValue;
    }
}

// Usage
int port = safeParseInt(config.get("server.port"), 8080);
```

### Scenario 2: Nullable database values

```java
// JPA entities often use wrappers for nullable columns
@Entity
public class Employee {
    private String name;
    private Integer age;        // null if not provided
    private Double salary;      // null if not set
    private Boolean active;     // null = unknown

    public int getAgeOrDefault(int defaultAge) {
        return age != null ? age : defaultAge;
    }
}
```

### Scenario 3: Safe arithmetic with overflow

```java
public static Optional<Integer> safeAdd(int a, int b) {
    try {
        return Optional.of(Math.addExact(a, b));
    } catch (ArithmeticException e) {
        return Optional.empty();  // overflow
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `==` to compare wrappers | Reference equality, not value | Use `.equals()` or `Objects.equals()` |
| `NullPointerException` on unboxing | `Integer x = null; int y = x;` | Check for null first |
| `Integer.parseInt` on non-numeric | `NumberFormatException` | Validate input or use try-catch |
| Using `new Integer(42)` | Deprecated, wastes memory | Use `Integer.valueOf(42)` or autoboxing |
| Cache surprises with `==` | `128 == 128` is false | Always use `.equals()` |
