---
title: Java Arrays — From Basics to Advanced Patterns
summary: Array creation, multi-dimensional arrays, array copying, Arrays utility class, common algorithms, and how organizations use arrays for performance-critical code.
order: 1
minutes: 28
topics: [arrays, multidimensional, copyof, sort, binarysearch, arrayutil]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/arrays.html
---

## The Concept, From Zero

An **array** is a fixed-size container holding elements of the same type:

// Declare and create
int[] numbers = new int[5];          // 5 elements, all 0
String[] names = {"Alice", "Bob"};    // 2 elements
double[] scores = new double[]{95.5, 87.3, 92.1};  // 3 elements

**Arrays vs Collections:**
- Arrays: fixed size, faster, primitive-friendly
- Collections: dynamic size, richer API, generics

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Array creation — three ways
2. `int[] a = new int[5];` — new keyword
3. `int[] b = {1, 2, 3, 4, 5};` — initializer list
4. `int[] c = new int[]{10, 20, 30};` — anonymous array
5. Line 2: Multi-dimensional arrays
6. `System.out.println(matrix[1][2]);` — 6 (row 1, col 2)
7. Jagged arrays — rows can have different lengths
8. Line 3: Array copying — don't use = (shared reference!)
9. WRONG: shallow copy (both point to same array)
10. `System.out.println(original[0]);` — 999! (original modified)
11. RIGHT: deep copy
12. `int[] deepCopy2 = Arrays.copyOfRange(original, 1, 4);` — [2, 3, 4]
13. `int[] deepCopy3 = Arrays.copyOf(original, 10);` — padded with 0
14. Line 4: Arrays utility class
15. `Arrays.sort(arr);` — [1, 2, 3, 5, 8, 9]
16. `int index = Arrays.binarySearch(arr, 5);` — 3 (index of 5)
17. `Arrays.fill(arr, 0);` — [0, 0, 0, 0, 0, 0]
18. `boolean equals = Arrays.equals(arr, copy);` — true
19. Line 5: Stream operations on arrays
20. `int sum = Arrays.stream(nums).sum();` — 31
21. `int max = Arrays.stream(nums).max().getAsInt();` — 9
22. `int min = Arrays.stream(nums).min().getAsInt();` — 1
23. `long count = Arrays.stream(nums).filter(n -> n > 3).count();` — 4
24. `.toArray();` — [4, 2, 6]
25. Line 6: Converting between arrays and collections
26. Primitive to object array
27. Line 7: Common algorithms. Find max
28. Reverse array
29. Check if sorted

The same code, clean:

```java
import java.util.*;

public class ArrayDeepDive {
    public static void main(String[] args) {
        int[] a = new int[5];
        int[] b = {1, 2, 3, 4, 5};
        int[] c = new int[]{10, 20, 30};

        int[][] matrix = {
            {1, 2, 3},
            {4, 5, 6},
            {7, 8, 9}
        };
        System.out.println(matrix[1][2]);

        int[][] jagged = new int[3][];
        jagged[0] = new int[]{1, 2};
        jagged[1] = new int[]{3, 4, 5};
        jagged[2] = new int[]{6};

        int[] original = {1, 2, 3, 4, 5};

        int[] shallowCopy = original;
        shallowCopy[0] = 999;
        System.out.println(original[0]);

        int[] deepCopy1 = Arrays.copyOf(original, original.length);
        int[] deepCopy2 = Arrays.copyOfRange(original, 1, 4);
        int[] deepCopy3 = Arrays.copyOf(original, 10);

        int[] arr = {5, 2, 8, 1, 9, 3};

        Arrays.sort(arr);
        System.out.println("Sorted: " + Arrays.toString(arr));

        int index = Arrays.binarySearch(arr, 5);
        System.out.println("Index of 5: " + index);

        Arrays.fill(arr, 0);

        int[] copy = Arrays.copyOf(arr, 6);
        boolean equals = Arrays.equals(arr, copy);

        int[] nums = {3, 1, 4, 1, 5, 9, 2, 6};

        int sum = Arrays.stream(nums).sum();
        int max = Arrays.stream(nums).max().getAsInt();
        int min = Arrays.stream(nums).min().getAsInt();
        long count = Arrays.stream(nums).filter(n -> n > 3).count();

        int[] filtered = Arrays.stream(nums)
            .filter(n -> n % 2 == 0)
            .toArray();

        List<Integer> list = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
        Integer[] backToArray = list.toArray(new Integer[0]);

        int[] primitives = {1, 2, 3};
        Integer[] objects = Arrays.stream(primitives).boxed().toArray(Integer[]::new);

        int maxVal = Arrays.stream(nums).max().getAsInt();

        int[] reversed = new int[nums.length];
        for (int i = 0; i < nums.length; i++) {
            reversed[i] = nums[nums.length - 1 - i];
        }

        boolean isSorted = true;
        for (int i = 1; i < nums.length; i++) {
            if (nums[i] < nums[i-1]) { isSorted = false; break; }
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Fixed-size lookup table

// Fast O(1) lookup — better than HashMap for small, fixed data
private static final char[] HEX_CHARS = "0123456789ABCDEF".toCharArray();

public static String bytesToHex(byte[] bytes) {
    char[] hex = new char[bytes.length * 2];
    for (int i = 0; i < bytes.length; i++) {
        hex[i * 2] = HEX_CHARS[(bytes[i] & 0xFF) >> 4];
        hex[i * 2 + 1] = HEX_CHARS[bytes[i] & 0x0F];
    }
    return new String(hex);
}

### Scenario 2: Matrix operations

public static int[][] multiply(int[][] a, int[][] b) {
    int rows = a.length, cols = b[0].length, inner = b.length;
    int[][] result = new int[rows][cols];
    for (int i = 0; i < rows; i++) {
        for (int j = 0; j < cols; j++) {
            for (int k = 0; k < inner; k++) {
                result[i][j] += a[i][k] * b[k][j];
            }
        }
    }
    return result;
}

### Scenario 3: Binary search on sorted array

public static int binarySearch(int[] arr, int target) {
    int left = 0, right = arr.length - 1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) left = mid + 1;
        else right = mid - 1;
    }
    return -1;
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `=` to copy arrays | Shared reference — both modify | Use `Arrays.copyOf()` or `clone()` |
| IndexOutOfBoundsException | Accessing beyond array length | Check `arr.length` before access |
| Forgetting arrays are 0-indexed | Off-by-one errors | Remember: first element is `arr[0]` |
| Modifying during iteration | ConcurrentModificationException | Use index-based for loop or streams |
| Using arrays when List needed | No dynamic resizing | Use `ArrayList` for dynamic size |

