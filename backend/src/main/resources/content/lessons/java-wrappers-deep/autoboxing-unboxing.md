---
title: Autoboxing and Unboxing — Primitive-Wrapper Conversion
summary: How Java automatically converts between primitives and wrapper objects, the Integer cache, performance implications, and common pitfalls.
order: 2
minutes: 15
topics: [autoboxing, unboxing, integer-cache, performance, conversion, boxing]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/autoboxing.html
---

## The Concept, From Zero

Java automatically converts primitives to wrapper objects (autoboxing) and back (unboxing). This lets you use `int` where `Integer` is expected and vice versa.

```java
Integer num = 42;        // autoboxing: int → Integer
int value = num;         // unboxing: Integer → int

List<Integer> list = new ArrayList<>();
list.add(10);            // autoboxing: int → Integer
int first = list.get(0); // unboxing: Integer → int
```

---

## The Integer Cache

Java caches `Integer` objects for values **-128 to 127**. This means two `Integer` objects in this range are the same object:

```java
Integer a = 127;
Integer b = 127;
System.out.println(a == b);  // true — same cached object

Integer c = 128;
Integer d = 128;
System.out.println(c == d);  // false — different objects

// Always use .equals() for value comparison
System.out.println(c.equals(d));  // true
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class AutoboxingDemo {
    public static void main(String[] args) {
        // 1. Basic autoboxing/unboxing
        Integer boxed = 42;       // autoboxing
        int unboxed = boxed;      // unboxing
        System.out.println("Boxed: " + boxed + ", Unboxed: " + unboxed);

        // 2. Arithmetic with mixed types
        Integer a = 10;
        Integer b = 20;
        int sum = a + b;          // unboxes both, adds, assigns to int
        System.out.println("Sum: " + sum);  // 30

        // 3. Comparison trap
        Integer x = 200;
        Integer y = 200;
        System.out.println("x == y: " + (x == y));        // false!
        System.out.println("x.equals(y): " + x.equals(y)); // true

        // 4. Null unboxing — NullPointerException
        Integer nullInt = null;
        // int danger = nullInt;  // NullPointerException!

        // 5. Cache range
        for (int i = -129; i <= 130; i++) {
            Integer i1 = i;
            Integer i2 = i;
            if (i1 != i2) {
                System.out.println("Cache miss at: " + i);
                break;  // prints "Cache miss at: -129"
            }
        }

        // 6. Performance: prefer primitives in tight loops
        long start = System.nanoTime();
        long primitiveSum = 0;
        for (int i = 0; i < 1_000_000; i++) {
            primitiveSum += i;  // no boxing
        }
        long primitiveTime = System.nanoTime() - start;

        start = System.nanoTime();
        Long wrapperSum = 0L;
        for (int i = 0; i < 1_000_000; i++) {
            wrapperSum += i;  // autoboxing every iteration
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
