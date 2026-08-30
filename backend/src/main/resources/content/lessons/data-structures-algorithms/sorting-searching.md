---
title: Sorting and Searching — The Workhorses of Algorithms
module: data-structures-algorithms
order: 5
minutes: 26
topics: ["sorting", "merge sort", "quick sort", "binary search", "Comparable", "Comparator"]
summary: Sorting feels like a chore, but it's actually the enabler of nearly everything: sorted data can be searched in O(log n) instead of O(n), merged eff...
docs:
  - title: "Collections.sort (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Collections.html#sort(java.util.List)"
  - title: "Arrays.sort (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html#sort(java.lang.Object%5B%5D)"
---

# Sorting and Searching — The Workhorses of Algorithms

## The Concept: Order Is a Superpower

Sorting feels like a chore, but it's actually the *enabler* of nearly everything: sorted data can be searched in O(log n) instead of O(n), merged efficiently, deduplicated in one pass, and presented to humans. Databases sort to serve range queries; search engines sort by relevance; analytics sorts by time. When you call `Collections.sort` you're using the result of decades of algorithm research — and understanding what's underneath tells you *why* sorting is fast, when it isn't, and how to sort your own objects.

**The mental model:** searching an unsorted list is a needle-in-a-haystack scan — you must look at every element (O(n)). Searching a sorted list is the *phone book* method: open to the middle, decide which half, repeat — each comparison eliminates half the remaining entries (O(log n)). Sorting once (O(n log n)) pays for itself the moment you search more than a handful of times.

## Binary Search: The Payoff of Order

```java
import java.util.Arrays;

public class SearchingDemo {
    // Binary search: repeatedly split the range in half.
    static int binarySearch(int[] sorted, int target) {
        int lo = 0, hi = sorted.length - 1;
        while (lo <= hi) {
            int mid = lo + (hi - lo) / 2;      // avoid overflow: not (lo+hi)/2
            if (sorted[mid] == target) return mid;
            if (sorted[mid] < target) lo = mid + 1;   // target in right half
            else                      hi = mid - 1;   // target in left half
        }
        return -1;                              // not found
    }

    public static void main(String[] args) {
        int[] data = {2, 5, 8, 12, 16, 23, 38, 56, 72, 91};
        System.out.println(binarySearch(data, 23));   // 5
        System.out.println(binarySearch(data, 24));   // -1

        // Java's built-ins:
        System.out.println(Arrays.binarySearch(data, 23));  // 5

        // Arrays.binarySearch on a list of objects:
        String[] names = {"Ada", "Grace", "Linus", "Ken"};
        System.out.println(Arrays.binarySearch(names, "Linus")); // 2
    }
}
```

**Walking through it:** the loop maintains a search window `[lo, hi]`. Each iteration compares the middle element and discards the half that can't contain the target. With 1 billion elements, ~30 iterations suffice — the halving is what log₂n means. Note `mid = lo + (hi - lo) / 2` — the naive `(lo+hi)/2` can overflow for huge arrays. And the crucial precondition: **the array must be sorted** — binary search on unsorted data silently returns wrong answers, one of the classic "why is my code wrong" bugs.

## The Two Great Sorts: Merge and Quick

Both are **divide-and-conquer**: split the problem, solve the halves, combine. Both run O(n log n) on average. They differ in the details — and Java uses both: `Arrays.sort` for primitives uses dual-pivot **quicksort**; `Arrays.sort`/`Collections.sort` for objects uses **TimSort** (a hybrid that detects nearly-sorted runs — the default choice in Python and Java for objects).

### Merge Sort: Split, Sort, Merge

```java
public class MergeSort {
    static void mergeSort(int[] a, int lo, int hi) {
        if (lo >= hi) return;                    // base case: 0 or 1 element
        int mid = lo + (hi - lo) / 2;
        mergeSort(a, lo, mid);                   // sort left half
        mergeSort(a, mid + 1, hi);               // sort right half
        merge(a, lo, mid, hi);                   // combine sorted halves
    }

    static void merge(int[] a, int lo, int mid, int hi) {
        int[] tmp = new int[hi - lo + 1];        // scratch space
        int i = lo, j = mid + 1, k = 0;
        // Walk both halves, always taking the smaller head.
        while (i <= mid && j <= hi) {
            if (a[i] <= a[j]) tmp[k++] = a[i++];
            else              tmp[k++] = a[j++];
        }
        // Drain whichever half has leftovers.
        while (i <= mid) tmp[k++] = a[i++];
        while (j <= hi)  tmp[k++] = a[j++];
        // Copy back.
        System.arraycopy(tmp, 0, a, lo, tmp.length);
    }

    public static void main(String[] args) {
        int[] a = {38, 27, 43, 3, 9, 82, 10};
        mergeSort(a, 0, a.length - 1);
        System.out.println(java.util.Arrays.toString(a));
    }
}
```

**Walking through the idea:** merge sort splits the array in half, recursively sorts each half, then *merges* the two sorted halves — the merge is the magic: with both halves sorted, the smallest overall element must be one of the two heads, so a single left-to-right pass combines them in O(n). Recursion depth is log n, and at each level we do O(n) merging work → **O(n log n) guaranteed**, always — no bad cases. The cost: the O(n) scratch array (space complexity).

### Quick Sort: Partition Around a Pivot

```java
public class QuickSort {
    static void quickSort(int[] a, int lo, int hi) {
        if (lo >= hi) return;
        int p = partition(a, lo, hi);   // place pivot in final position
        quickSort(a, lo, p - 1);        // sort left of pivot
        quickSort(a, p + 1, hi);        // sort right of pivot
    }

    static int partition(int[] a, int lo, int hi) {
        int pivot = a[hi];              // pick the last element as pivot
        int i = lo;                     // boundary of "smaller" region
        for (int j = lo; j < hi; j++) {
            if (a[j] < pivot) {         // found an element smaller than pivot
                swap(a, i, j);          // move it into the smaller region
                i++;
            }
        }
        swap(a, i, hi);                 // pivot to its final home
        return i;
    }

    static void swap(int[] a, int i, int j) {
        int t = a[i]; a[i] = a[j]; a[j] = t;
    }

    public static void main(String[] args) {
        int[] a = {38, 27, 43, 3, 9, 82, 10};
        quickSort(a, 0, a.length - 1);
        System.out.println(java.util.Arrays.toString(a));
    }
}
```

**Walking through the idea:** quicksort picks a **pivot** and *partitions* — rearranges the array so everything smaller than the pivot sits before it and everything larger after it. The pivot is now in its *final* position, forever. Recursing on each side sorts the rest. On average, each partition divides the array roughly in half → O(n log n), and — critically — it sorts **in place** with O(log n) stack space, no scratch array. The catch: a bad pivot choice (e.g., always picking the last element on an already-sorted array) produces lopsided partitions → O(n²). Java's real implementation avoids this with careful pivot selection ("dual-pivot" picks three candidates).

## Sorting Your Own Objects

```java
import java.util.*;

public class SortObjectsDemo {
    static record Student(String name, int grade) {}

    public static void main(String[] args) {
        List<Student> students = new ArrayList<>(List.of(
                new Student("Zoe", 85), new Student("Ada", 92),
                new Student("Ben", 78)));

        // Natural order — requires the class to implement Comparable.
        // students.sort(null);  // would use compareTo

        // Comparator: sort by grade, descending:
        students.sort(Comparator.comparingInt(Student::grade).reversed());
        System.out.println(students);   // [Ada(92), Zoe(85), Ben(78)]

        // Chained comparators: grade desc, then name asc as tiebreaker.
        students.sort(Comparator.comparingInt(Student::grade).reversed()
                                .thenComparing(Student::name));
        System.out.println(students);
    }
}
```

**The two mechanisms:** `Comparable` (the class defines its *natural* order via `compareTo` — used by `TreeMap`, `TreeSet`, `Collections.sort` without a comparator) and `Comparator` (a *separate* ordering strategy, passed per-call — the flexible choice, and the modern idiom with `Comparator.comparing` and method references). A `record` can implement `Comparable` like any class. The consistency rule: `compareTo`/`compare` returning 0 must agree with `equals` — otherwise sorted collections (which use comparisons) and hash collections (which use equals) disagree about duplicates.

## When NOT to Sort

Sorting is O(n log n) — not free. Alternatives worth knowing:

- **Linear scans** beat sorting for tiny n and one-off lookups.
- **Hash maps** give O(1) lookup without sorting — prefer them for "is this present?".
- **Heap / priority queue** gives "k largest elements" in O(n log k) instead of a full sort.
- **Counting/radix sort** can be O(n) for integers in a bounded range — Java's `Arrays.parallelSort` also leverages structure for primitives.

## Recap

Sorting (O(n log n)) unlocks logarithmic searching (binary search, O(log n)) and a cascade of efficient operations. Merge sort guarantees O(n log n) with a merge step and O(n) space; quicksort sorts in place with O(log n) space but needs good pivot selection to avoid O(n²); Java ships both plus TimSort's run detection. Sort your own objects via `Comparable` (natural order) or `Comparator` (per-call strategy, keep it consistent with `equals`). The mastery is knowing what's *under* the library calls — so you can trust `Arrays.sort` in production, explain its O(n log n), and reach for a hash map or heap when sorting isn't the right tool at all.
