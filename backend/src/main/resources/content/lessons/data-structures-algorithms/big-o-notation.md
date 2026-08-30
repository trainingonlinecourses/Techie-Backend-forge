---
title: Big-O Notation — How Fast Is Your Code, Really
module: data-structures-algorithms
order: 1
minutes: 26
topics: ["big-O", "complexity", "time complexity", "space complexity", "growth rates"]
summary: "How fast is this program?" is the wrong question — the honest answer depends on the machine, the language, the data. The useful question is: how d...
docs:
  - title: "Analysis of Algorithms (Khan Academy)"
    url: "https://www.khanacademy.org/computing/computer-science/algorithms/asymptotic-notation/a/asymptotic-notation"
  - title: "Introduction to Algorithms (MIT OCW)"
    url: "https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/"
---

# Big-O Notation — How Fast Is Your Code, Really

## The Concept: Measuring Growth, Not Seconds

"How fast is this program?" is the wrong question — the honest answer depends on the machine, the language, the data. The useful question is: **how does the work grow as the input grows?** Double the input — does the time double? Quadruple? Stay flat? That growth rate — not wall-clock seconds — is what **Big-O notation** describes, and it's the single most important tool for predicting whether code will survive production scale.

**The mental model:** imagine sorting a deck of cards. With 52 cards, any reasonable method is instant. With 52,000 cards, one method might take a minute and another might take 26 hours. The difference between "a minute" and "26 hours" is not the machine — it's the *growth rate* of the algorithms. Big-O names those growth rates so you can compare algorithms *independent of hardware*.

## The Growth Rates, From Best to Worst

| Big-O | Name | What it means | Example |
|---|---|---|---|
| O(1) | constant | same work regardless of input | array index, HashMap get |
| O(log n) | logarithmic | work grows slowly even for huge inputs | binary search, balanced tree lookup |
| O(n) | linear | work scales 1:1 with input | single loop over a list |
| O(n log n) | linearithmic | slightly super-linear | efficient sorting (merge/quick sort) |
| O(n²) | quadratic | nested loops — doubles input, 4× work | naive bubble sort, nested loops |
| O(2ⁿ) | exponential | doubles input, doubles exponent | brute-force subset enumeration |
| O(n!) | factorial | grows insanely fast | all permutations |

**The intuition to build:** n = 1,000,000. O(1) = instant. O(log n) ≈ 20 steps. O(n) = 1,000,000 steps. O(n log n) ≈ 20,000,000. O(n²) = 1,000,000,000,000 — minutes to hours. O(2ⁿ) = astronomically impossible. The gap between O(n) and O(n²) at scale is the difference between a feature that works and a server that melts.

## Counting Operations: From Code to Big-O

```java
public class BigODemo {

    // O(1) — constant: no matter how big the array, ONE operation.
    static int firstElement(int[] arr) {
        return arr[0];                    // 1 operation — always
    }

    // O(n) — linear: the loop runs once per element.
    static int sum(int[] arr) {
        int total = 0;
        for (int x : arr) {               // n iterations
            total += x;
        }
        return total;
    }

    // O(n²) — quadratic: nested loops, n×n operations.
    static boolean hasDuplicate(int[] arr) {
        for (int i = 0; i < arr.length; i++) {
            for (int j = i + 1; j < arr.length; j++) {  // inner runs ~n/2 avg
                if (arr[i] == arr[j]) return true;
            }
        }
        return false;
    }

    // O(log n) — logarithmic: the search space HALVES each step.
    static int binarySearch(int[] sorted, int target) {
        int lo = 0, hi = sorted.length - 1;
        while (lo <= hi) {
            int mid = (lo + hi) / 2;
            if (sorted[mid] == target) return mid;
            if (sorted[mid] < target) lo = mid + 1;
            else                      hi = mid - 1;
        }
        return -1;
    }

    public static void main(String[] args) {
        System.out.println(sum(new int[]{1,2,3,4,5}));        // 15
        System.out.println(hasDuplicate(new int[]{3,1,4,1})); // true
        System.out.println(binarySearch(new int[]{1,3,5,7,9}, 7)); // 3
    }
}
```

**Walking through each one:**

- `firstElement` — always one step → **O(1)**. The array size is irrelevant.
- `sum` — the loop body runs exactly `n` times → **O(n)**. Double the array, double the work.
- `hasDuplicate` — for each of the `n` elements, the inner loop scans up to `n` more. The total is about n²/2 comparisons — and since Big-O *drops constant factors*, n²/2 is just **O(n²)**. The ½ is irrelevant to growth; the exponent is everything.
- `binarySearch` — each iteration *halves* the remaining search space: n → n/2 → n/4 → ... The number of halvings before reaching 1 is log₂n → **O(log n)**. This is why searching a sorted collection of a billion items takes ~30 steps.

## The Rules of Simplification

Big-O deliberately throws away precision to capture the *shape*:

1. **Drop constant factors.** 3n, 100n, and 0.5n are all O(n). Constants matter in practice (a fast O(n) beats a slow O(n)) but not in growth classification.
2. **Keep only the dominant term.** n² + 100n + 5 is O(n²) — for large n, the n² term dwarfs the rest.
3. **Composition:** sequential blocks add, nested blocks multiply. Loop over n with an O(1) body = O(n); loop over n with an O(n) body = O(n²).

## Space Complexity: The Forgotten Half

Big-O applies to memory too: how does *extra* memory grow with input? An in-place sort needs O(1) extra space; a merge sort's auxiliary arrays need O(n); recursion depth can be O(n) (a recursive binary search is O(log n) stack space). Production incidents often come from space, not time — a "fast" algorithm that allocates O(n²) memory dies on big inputs. Ask both questions about every algorithm: time? space?

## What Big-O Does NOT Tell You

- **Real speed.** An O(n) algorithm with a huge constant (say, 5000 operations per element) can be *slower* than an O(n²) one for small inputs. That's why hybrid sorts use insertion sort (O(n²)) for tiny subarrays — the constant is tiny.
- **Small inputs.** For n = 10, complexity classes barely matter; simplicity and cache-friendliness win.
- **Best or average case.** Big-O usually describes the *worst case*. Hash maps are O(1) average, O(n) worst (many collisions); quicksort is O(n log n) average, O(n²) worst (already-sorted input with a bad pivot). Know which case your analysis describes.

## The Habit That Pays Off

Before you write an algorithm, *predict* its complexity; after you write it, *verify* against a doubling test: run it on n and 2n inputs and check whether the time roughly doubles (O(n)), quadruples (O(n²)), or stays flat (O(1)/O(log n)). This simple experiment catches complexity mistakes that benchmarks alone hide. And when a reviewer asks "what's the complexity of this?", the answer should be immediate — because the complexity *is* the specification of how the code behaves at scale.

## Recap

Big-O describes how work grows with input, stripped of machine and constant factors: O(1) flat, O(log n) halving, O(n) linear, O(n log n) sorting, O(n²) nested loops, O(2ⁿ) and beyond explosive. To derive it: count operations, keep the dominant term, drop constants, multiply nested blocks. Apply it to space as well as time. And remember its limits — it's about growth and worst cases, not real seconds or small inputs. Mastered, it turns "will this scale?" from a guess into a calculation you can do on the back of an envelope.
