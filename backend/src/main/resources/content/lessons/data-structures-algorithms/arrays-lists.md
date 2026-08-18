---
title: Arrays and Lists — Contiguous Memory vs Linked Nodes
module: data-structures-algorithms
order: 2
minutes: 24
topics: ["arrays", "ArrayList", "LinkedList", "memory layout", "amortized analysis"]
docs:
  - title: "ArrayList (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ArrayList.html"
  - title: "LinkedList (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/LinkedList.html"
---

# Arrays and Lists — Contiguous Memory vs Linked Nodes

## The Concept: Two Ways to Line Up Data

An **array** and a **linked list** both store a sequence of elements — but they organize memory in fundamentally different ways, and that difference decides everything about their performance.

**The array model (contiguous memory):** elements sit *side by side* in one continuous block of memory. Element 5 is exactly one element-width past element 4. To find element 5 you don't search — you compute `baseAddress + 5 × elementSize` and jump straight there. That's **O(1) random access**, the array's superpower.

**The linked-list model (scattered nodes):** each element is a *node* holding its value plus a pointer to the next node. The nodes can be anywhere in memory; the only way to reach element 5 is to walk 1 → 2 → 3 → 4 → 5. That's **O(n) access** — no jumping. But inserting *between* elements is trivial: create a node, rewire two pointers. No shifting.

**The mental model:** the array is an apartment building with numbered rooms — you know exactly which door is #5, but moving a tenant out of #3 means every later tenant must shift. The linked list is a treasure hunt — each clue points to the next, so finding clue #5 means following all the clues, but hiding a new clue between #3 and #4 just rewrites two arrows.

## Java's Implementations: ArrayList vs LinkedList

```java
import java.util.*;

public class ListsDemo {
    public static void main(String[] args) {
        // ArrayList: array-backed. The DEFAULT choice in Java.
        List<String> arrayList = new ArrayList<>();
        arrayList.add("a");       // O(1) amortized append
        arrayList.add("b");
        arrayList.add(1, "X");    // O(n): shifts b right to make room
        System.out.println(arrayList.get(2));  // "b" — O(1) random access

        // LinkedList: node-based. Almost always the WRONG choice in Java.
        List<String> linkedList = new LinkedList<>();
        linkedList.add("a");      // O(1)
        linkedList.add("b");
        linkedList.add(1, "X");   // O(1) IF you have the node; O(n) here,
                                  // because we must WALK to index 1 first.
        System.out.println(linkedList.get(2)); // O(n) — walk from the head
    }
}
```

**The critical insight:** both `add(1, "X")` and `get(2)` look identical in Java — but the costs are radically different:

- `ArrayList.get(2)` is a direct computation → **O(1)**. `LinkedList.get(2)` walks the chain → **O(n)**.
- `ArrayList.add(1, "X")` shifts everything after index 1 → **O(n)**. `LinkedList.add(1, "X")` rewires pointers → **O(1)** *if* you already hold the node (via an iterator).

**Why `LinkedList` is rarely the right answer in Java:** its O(1) insert/delete advantage only applies when you're *standing at the node* — which requires an `Iterator` (e.g., removing while iterating). Everything else — `get(i)`, `set(i)`, and even `add(i, x)` (which must walk to find the position) — is O(n). Meanwhile `ArrayList`'s only weakness is *middle* insertion/deletion, which most code doesn't do. The practical rule used across the industry: **default to `ArrayList`; reach for `LinkedList` only when profiling proves the middle operations dominate.**

## What Happens When an ArrayList Grows?

An array has a fixed size, but `ArrayList` must grow. The trick is **geometric growth**: when full, it allocates a new array ~1.5× larger and copies everything over. Copying is O(n) — but it happens rarely. Summing all the copies over a sequence of n appends: the copies total O(n) work, spread across n appends → **O(1) amortized** per append. This is *amortized analysis*: the average cost per operation is O(1) even though individual operations occasionally cost O(n). It's the same idea as paying rent — the expensive "growth" moments are averaged out over all the cheap ones.

## Real-World Memory: Why Contiguity Matters More Than Big-O

Here's what pure Big-O misses: **cache locality**. Modern CPUs read memory in blocks (cache lines, ~64 bytes). Scanning an `ArrayList` reads each cache line once and uses every element in it — memory bandwidth is fully utilized. Scanning a `LinkedList` jumps between scattered nodes; each node is a separate cache miss, and the pointers make each node bigger than its value. For traversal, a linked list can be **10–100× slower** than an array *despite identical O(n) complexity*. This is why array-backed structures dominate production code: the constant factor isn't small, it's *memory-hardware-shaped*.

## Choosing the Right Structure

| Operation | ArrayList | LinkedList |
|---|---|---|
| get(i) / set(i) | **O(1)** | O(n) |
| add at end | O(1) amortized | O(1) |
| add/remove at middle | O(n) shift | O(1) with node, O(n) to find |
| iterate all | fast (cache-friendly) | slower (pointer chasing) |
| memory per element | one slot (or two for boxed) | value + 2 pointers + object overhead |

**Decision rules:**
- Almost always → `ArrayList` (or `List.of`/`Arrays.asList` for fixed data).
- Random access by index → `ArrayList`.
- Frequent middle insertions/deletions *with iterators* → `LinkedList` — or better, reconsider the design.
- Stack/queue behavior → `ArrayDeque` beats `LinkedList` for both (contiguous, no node overhead).
- Fixed-size data → plain arrays or `List.of`.
- Boxed primitives at scale → primitive arrays (`int[]`) beat `List<Integer>` on memory and speed.

## The Iterator Gotcha: Concurrent Modification

```java
List<String> words = new ArrayList<>(List.of("a", "b", "c"));

// CORRECT: remove through the iterator — safe and O(n) total.
Iterator<String> it = words.iterator();
while (it.hasNext()) {
    if (it.next().equals("b")) it.remove();
}

// WRONG: modifying the list while iterating throws
// ConcurrentModificationException:
// for (String w : words) { if (w.equals("b")) words.remove(w); }
```

The enhanced for-loop hides the iterator; calling `list.remove` while iterating changes the structure the iterator relies on, and Java's *fail-fast* design throws `ConcurrentModificationException` rather than silently corrupt the iteration. Removing through the iterator itself is the sanctioned path.

## Recap

Arrays store elements contiguously, giving O(1) random access and cache-friendly traversal at the cost of shifting on middle inserts; linked lists scatter nodes connected by pointers, giving O(1) pointer rewiring but O(n) access and poor cache behavior. In Java, `ArrayList` is the default because its O(1) amortized appends and O(1) indexed access match how most code actually uses lists — `LinkedList`'s theoretical advantages rarely materialize outside iterator-based middle operations. Understand the two memory models, the amortized-growth trick, and the cache-locality constant factor, and the "which list?" question answers itself.
