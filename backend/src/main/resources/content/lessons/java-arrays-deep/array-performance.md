---
title: Array Performance — Cache Locality, Memory Layout, and SIMD
summary: Why arrays are faster than ArrayLists for primitive data, how CPU cache lines affect array traversal performance, and when to use arrays over collections.
order: 4
minutes: 18
topics: [array-performance, cache-locality, memory-layout, simd, primitive-arrays]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html
---

## The Concept, From Zero

ArrayLists store objects in an Object[] array — each element is a pointer to an object somewhere else in memory. Primitive arrays (int[], double[]) store the actual values contiguously in memory.

This matters because of CPU cache. When the CPU reads one element from a contiguous array, it loads an entire cache line (64 bytes on most CPUs) into L1 cache. The next elements are already cached — making sequential access extremely fast.

With ArrayList<Integer>, each Integer object is a separate heap allocation. The CPU must chase pointers across memory, causing cache misses.

## The Code

```java
public class ArrayPerformance {

    // Slow: ArrayList with boxing
    public static long sumArrayList() {
        ArrayList<Integer> list = new ArrayList<>();
        for (int i = 0; i < 10_000_000; i++) {
            list.add(i);
        }
        long sum = 0;
        for (int i = 0; i < list.size(); i++) {
            sum += list.get(i);  // Unboxing: Integer → int
        }
        return sum;
    }

    // Fast: primitive array, cache-friendly
    public static long sumPrimitiveArray() {
        int[] arr = new int[10_000_000];
        for (int i = 0; i < arr.length; i++) {
            arr[i] = i;
        }
        long sum = 0;
        for (int i = 0; i < arr.length; i++) {
            sum += arr[i];  // Direct memory read
        }
        return sum;
    }

    public static void main(String[] args) {
        // Primitive array: ~5ms
        long start = System.nanoTime();
        long result1 = sumPrimitiveArray();
        long elapsed1 = System.nanoTime() - start;
        System.out.printf("Primitive array: %d ns, sum=%d%n", elapsed1, result1);

        // ArrayList: ~50ms (10x slower)
        start = System.nanoTime();
        long result2 = sumArrayList();
        long elapsed2 = System.nanoTime() - start;
        System.out.printf("ArrayList: %d ns, sum=%d%n", elapsed2, result2);
    }
}
```

## Performance Comparison

| Data Structure | Memory Layout | Cache Friendly | 10M Sum Time |
|---------------|---------------|----------------|--------------|
| int[] | Contiguous values | Excellent | ~5ms |
| ArrayList\<Integer\> | Pointers + boxed objects | Poor | ~50ms |
| Integer[] | Contiguous references | Moderate | ~15ms |
| long[] | Contiguous values | Excellent | ~5ms |

## Key Takeaways

1. **Primitive arrays** are 5-10x faster than ArrayList for numeric processing
2. **Cache lines** load 64 bytes at a time — contiguous data wins
3. **Use arrays** for hot loops, numeric computation, and buffer management
4. **Use ArrayList** for general-purpose, dynamic-size collections
5. **Avoid Integer[] in performance-critical code** — use int[] instead
