---
title: Autoboxing and Unboxing — Primitive-Wrapper Conversion
summary: How Java automatically converts between primitives and wrapper objects, the Integer cache, performance implications, and common pitfalls.
order: 1
minutes: 15
topics: [autoboxing, unboxing, integer-cache, performance, conversion, boxing]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/autoboxing.html
---

## The Concept, From Zero

Java automatically converts primitives to wrapper objects (autoboxing) and back (unboxing). This lets you use `int` where `Integer` is expected and vice versa.

Integer num = 42;        // autoboxing: int → Integer
int value = num;         // unboxing: Integer → int

List<Integer> list = new ArrayList<>();
list.add(10);            // autoboxing: int → Integer
int first = list.get(0); // unboxing: Integer → int

---

## The Integer Cache

Java caches `Integer` objects for values **-128 to 127**. This means two `Integer` objects in this range are the same object:

```java
public class Main {

    public static void main(String[] args) {
        Integer a = 127;
        Integer b = 127;
        System.out.println(a == b);  // true — same cached object

        Integer c = 128;
        Integer d = 128;
        System.out.println(c == d);  // false — different objects

        // Always use .equals() for value comparison
        System.out.println(c.equals(d));  // true
    }
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. 1. Basic autoboxing/unboxing
2. `Integer boxed = 42;` — autoboxing
3. `int unboxed = boxed;` — unboxing
4. 2. Arithmetic with mixed types
5. `int sum = a + b;` — unboxes both, adds, assigns to int
6. `System.out.println("Sum: " + sum);` — 30
7. 3. Comparison trap
8. `System.out.println("x == y: " + (x == y));` — false!
9. `System.out.println("x.equals(y): " + x.equals(y));` — true
10. 4. Null unboxing — NullPointerException
11. int danger = nullInt; // NullPointerException!
12. 5. Cache range
13. `break;` — prints "Cache miss at: -129"
14. 6. Performance: prefer primitives in tight loops
15. `primitiveSum += i;` — no boxing
16. `wrapperSum += i;` — autoboxing every iteration

The same code, clean:

```java
import java.util.*;

public class AutoboxingDemo {
    public static void main(String[] args) {
        Integer boxed = 42;
        int unboxed = boxed;
        System.out.println("Boxed: " + boxed + ", Unboxed: " + unboxed);

        Integer a = 10;
        Integer b = 20;
        int sum = a + b;
        System.out.println("Sum: " + sum);

        Integer x = 200;
        Integer y = 200;
        System.out.println("x == y: " + (x == y));
        System.out.println("x.equals(y): " + x.equals(y));

        Integer nullInt = null;

        for (int i = -129; i <= 130; i++) {
            Integer i1 = i;
            Integer i2 = i;
            if (i1 != i2) {
                System.out.println("Cache miss at: " + i);
                break;
            }
        }

        long start = System.nanoTime();
        long primitiveSum = 0;
        for (int i = 0; i < 1_000_000; i++) {
            primitiveSum += i;
        }
        long primitiveTime = System.nanoTime() - start;

        start = System.nanoTime();
        Long wrapperSum = 0L;
        for (int i = 0; i < 1_000_000; i++) {
            wrapperSum += i;
        }
        long wrapperTime = System.nanoTime() - start;

        System.out.println("Primitive: " + primitiveTime / 1_000 + "μs");
        System.out.println("Wrapper:   " + wrapperTime / 1_000 + "μs");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| `==` comparison on wrappers | Compares object identity, not value | Use `.equals()` |
| Unboxing null | NullPointerException | Check for null first |
| Using wrappers in tight loops | Performance overhead from boxing | Use primitives |
| Autoboxing in collection type inference | `var` infers Integer, not int | Explicit type declaration |

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/package-summary.html)
