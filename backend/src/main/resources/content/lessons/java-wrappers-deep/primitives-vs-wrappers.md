---
title: Primitives vs Wrappers — When to Use Which
summary: The trade-offs between primitives and wrapper objects, performance, nullability, generics requirements, and API design decisions.
order: 4
minutes: 15
topics: [primitives, wrappers, performance, nullability, generics, api-design]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/numberclasses.html
---

## The Concept, From Zero

Primitives (`int`, `double`, `boolean`) are fast and simple. Wrappers (`Integer`, `Double`, `Boolean`) add object features: nullability, generics support, and utility methods.

int count = 0;           // primitive: fast, cannot be null
Integer countObj = null;  // wrapper: slower, can be null, works with generics

---

## When to Use Primitives

- Tight loops and performance-critical code
- Local variables where null isn't needed
- Array elements (primitive arrays are faster than wrapper arrays)
- Math and calculations

// Fast: primitive array
int[] numbers = new int[1_000_000];
for (int i = 0; i < numbers.length; i++) {
    numbers[i] = i * 2;
}

## When to Use Wrappers

- Collections (`List<Integer>`, `Map<String, Boolean>`)
- Fields that may be null
- Method return types that signal "no value"
- Database mappings (JPA entities)

public class User {
    private Integer age;  // null means "not provided"
    private boolean active;  // primitive: always has a value
}

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. 1. Generics require wrappers
2. `List<Integer> numbers = Arrays.asList(1, 2, 3);` — OK. List<int> wrong; // COMPILE ERROR — generics need objects
3. 2. Null signaling
4. `Integer age = null;` — means "unknown"
5. `int defaultAge = age != null ? age : 0;` — safe unboxing
6. 3. Utility methods on wrappers
7. `String hex = Integer.toHexString(255);` — "ff"
8. `int max = Integer.max(10, 20);` — 20
9. `int bits = Integer.SIZE;` — 32
10. 4. Default values
11. `int primitiveDefault;` — 0
12. `Integer wrapperDefault;` — null
13. 5. Performance comparison
14. `for (int i = 0; i < 10_000_000; i++) sum2 += Math.sqrt(i);` — boxing each iteration

The same code, clean:

```java
import java.util.*;

public class PrimitivesVsWrappers {
    public static void main(String[] args) {
        List<Integer> numbers = Arrays.asList(1, 2, 3);

        Integer age = null;
        int defaultAge = age != null ? age : 0;

        int parsed = Integer.parseInt("42");
        String hex = Integer.toHexString(255);
        int max = Integer.max(10, 20);
        int bits = Integer.SIZE;

        int primitiveDefault;
        Integer wrapperDefault;

        long start = System.nanoTime();
        double sum1 = 0;
        for (int i = 0; i < 10_000_000; i++) sum1 += Math.sqrt(i);
        long primitiveTime = System.nanoTime() - start;

        start = System.nanoTime();
        Double sum2 = 0.0;
        for (int i = 0; i < 10_000_000; i++) sum2 += Math.sqrt(i);
        long wrapperTime = System.nanoTime() - start;

        System.out.println("Primitive: " + primitiveTime / 1_000_000 + "ms");
        System.out.println("Wrapper:   " + wrapperTime / 1_000_000 + "ms");
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using wrappers in tight loops | Boxing/unboxing overhead | Use primitives |
| Default int field is 0 not null | Can't distinguish "not set" from "set to 0" | Use Integer if null matters |
| Using Long for IDs in JPA | Huge memory overhead for millions of records | Consider long primitive for simple entities |

