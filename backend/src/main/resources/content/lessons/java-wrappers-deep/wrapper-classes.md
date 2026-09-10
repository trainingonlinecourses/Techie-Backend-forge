---
title: Wrapper Classes — Autoboxing, Caching, and Pitfalls
summary: What wrapper classes are, autoboxing/unboxing, the Integer cache, NumberFormatException, and how organizations handle type conversions safely.
order: 5
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


**What this code does — step by step:**

1. Autoboxing: primitive → wrapper (automatic)
2. `Integer num = 42;` — int → Integer
3. `Double pi = 3.14;` — double → Double
4. `Boolean flag = true;` — boolean → Boolean
5. Unboxing: wrapper → primitive (automatic)
6. `int n = num;` — Integer → int
7. `double d = pi;` — Double → double
8. `boolean b = flag;` — Boolean → boolean
9. Collections require wrappers
10. `numbers.add(42);` — autoboxed: int → Integer
11. `int value = numbers.get(0);` — unboxed: Integer → int

The same code, clean:

```java
Integer num = 42;
Double pi = 3.14;
Boolean flag = true;

int n = num;
double d = pi;
boolean b = flag;

List<Integer> numbers = new ArrayList<>();
numbers.add(42);
int value = numbers.get(0);
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Creating wrapper objects
2. `Integer a = Integer.valueOf(42);` — recommended
3. `Integer b = 42;` — autoboxing (same as valueOf)
4. `Integer c = new Integer(42);` — DEPRECATED — don't use
5. Line 2: Parsing strings to numbers
6. `int parsed1 = Integer.parseInt("123");` — 123
7. `double parsed2 = Double.parseDouble("3.14");` — 3.14
8. `boolean parsed3 = Boolean.parseBoolean("true");` — true
9. Line 3: NumberFormatException — the #1 wrapper pitfall
10. `int bad = Integer.parseInt("abc");` — throws NumberFormatException
11. Line 4: Integer cache (-128 to 127)
12. `System.out.println(x == y);` — true — cached!
13. `System.out.println(p == q);` — false — new objects!
14. `System.out.println(p.equals(q));` — true — use .equals()
15. Line 5: Useful utility methods
16. `System.out.println(Integer.MAX_VALUE);` — 2147483647
17. `System.out.println(Integer.MIN_VALUE);` — -2147483648
18. `System.out.println(Integer.compare(5, 3));` — 1
19. `System.out.println(Integer.max(5, 3));` — 5
20. `System.out.println(Integer.bitCount(7));` — 3 (binary: 111)
21. `System.out.println(Integer.toBinaryString(10));` — "1010"
22. `System.out.println(Integer.toHexString(255));` — "ff"
23. Line 6: String conversion
24. `String str = Integer.toString(42);` — "42"
25. `String hex = Integer.toHexString(255);` — "ff"
26. `String bin = Integer.toBinaryString(8);` — "1000"
27. Line 7: Nullable wrappers
28. int primitiveNull = null; // COMPILE ERROR
29. Safe conversion
30. `int safeValue = maybeNull != null ? maybeNull : 0;` — 0
31. Line 8: Wrapper comparison
32. `System.out.println(a1 == a2);` — false (outside cache)
33. `System.out.println(a1.equals(a2));` — true
34. `System.out.println(a1.compareTo(a2));` — 0

The same code, clean:

```java
import java.util.*;

public class WrapperClassesDemo {
    public static void main(String[] args) {
        Integer a = Integer.valueOf(42);
        Integer b = 42;
        Integer c = new Integer(42);

        int parsed1 = Integer.parseInt("123");
        double parsed2 = Double.parseDouble("3.14");
        boolean parsed3 = Boolean.parseBoolean("true");

        try {
            int bad = Integer.parseInt("abc");
        } catch (NumberFormatException e) {
            System.out.println("Parse error: " + e.getMessage());
        }

        Integer x = 127;
        Integer y = 127;
        System.out.println(x == y);

        Integer p = 128;
        Integer q = 128;
        System.out.println(p == q);
        System.out.println(p.equals(q));

        System.out.println(Integer.MAX_VALUE);
        System.out.println(Integer.MIN_VALUE);
        System.out.println(Integer.compare(5, 3));
        System.out.println(Integer.max(5, 3));
        System.out.println(Integer.bitCount(7));
        System.out.println(Integer.toBinaryString(10));
        System.out.println(Integer.toHexString(255));

        String str = Integer.toString(42);
        String hex = Integer.toHexString(255);
        String bin = Integer.toBinaryString(8);

        Integer maybeNull = null;

        int safeValue = maybeNull != null ? maybeNull : 0;
        int safeWithOrDefault = Optional.ofNullable(maybeNull).orElse(0);

        Integer a1 = 200;
        Integer a2 = 200;
        System.out.println(a1 == a2);
        System.out.println(a1.equals(a2));
        System.out.println(a1.compareTo(a2));
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

public static Optional<Integer> safeAdd(int a, int b) {
    try {
        return Optional.of(Math.addExact(a, b));
    } catch (ArithmeticException e) {
        return Optional.empty();  // overflow
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `==` to compare wrappers | Reference equality, not value | Use `.equals()` or `Objects.equals()` |
| `NullPointerException` on unboxing | `Integer x = null; int y = x;` | Check for null first |
| `Integer.parseInt` on non-numeric | `NumberFormatException` | Validate input or use try-catch |
| Using `new Integer(42)` | Deprecated, wastes memory | Use `Integer.valueOf(42)` or autoboxing |
| Cache surprises with `==` | `128 == 128` is false | Always use `.equals()` |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/package-summary.html)
