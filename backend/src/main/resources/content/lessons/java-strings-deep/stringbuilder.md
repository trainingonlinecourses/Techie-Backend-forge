---
title: StringBuilder — Building Strings Efficiently
module: java-strings-deep
order: 3
minutes: 23
topics: ["StringBuilder", "mutable strings", "concatenation", "performance", "capacity"]
summary: Recall that String is immutable — every operation that "changes" a string creates a new object. Now think about building a sentence word by word in...
docs:
  - title: "StringBuilder (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/StringBuilder.html"
---

# StringBuilder — Building Strings Efficiently

## The Concept: The Cost of "Adding" Strings

Recall that `String` is immutable — every operation that "changes" a string creates a **new object**. Now think about building a sentence word by word in a loop:

```java
String result = "";
for (int i = 0; i < 1000; i++) {
    result = result + "word" + i + " ";   // creates a NEW string every iteration
}
```

With 1,000 iterations, this creates roughly **2,000–3,000 intermediate String objects**, each one copying all the previous content. That's O(n²) copying — for large loops it becomes brutally slow and churns the garbage collector.

**`StringBuilder`** solves this: it is a **mutable** sequence of characters. Instead of copying the whole string on every change, it holds an internal **character array** (a buffer) and appends into it in place, growing the buffer only when needed.

## How It Works Inside

`StringBuilder` maintains:

- A `char[]` (or byte array) buffer — the workspace.
- A `count` of how many characters are currently "in use".

When you `append("x")`:

1. If there's room in the buffer, the characters are written directly into the array at position `count`, and `count` is increased. **No copying of existing content.**
2. If the buffer is full, it's **grown** — typically doubled in size — existing content is copied to the new larger array, and then the append continues.

Because growth is geometric (doubling), the total number of copies over many appends is O(n), not O(n²).

## The Code Walkthrough

```java
public class StringBuilderDemo {

    public static void main(String[] args) {
        // 1. Create with initial capacity to avoid regrowth
        StringBuilder sb = new StringBuilder(128);

        // 2. Append various types — they are converted to text and added
        sb.append("Order #").append(1042)
          .append(" | total: $").append(59.99)
          .append(" | status: ").append("PAID");

        // 3. Insert at a position
        sb.insert(0, "[RECEIPT] ");

        // 4. Replace a range [start, end)
        int start = sb.indexOf("PAID");
        sb.replace(start, start + 4, "COMPLETED");

        // 5. Reverse (yes, it's built in)
        // sb.reverse();

        // 6. Convert to an immutable String when done
        String receipt = sb.toString();
        System.out.println(receipt);
    }
}
```

### Walking Through Each Part

**Part 1 — `new StringBuilder(128)`:** We pre-size the internal buffer to 128 characters. This is an optimization: if we know the output will be roughly 100–150 chars, starting with a big-enough buffer avoids the copy-on-grow cost entirely. If you don't know the size, the default constructor (capacity 16) works fine — the buffer just grows as needed.

**Part 2 — chained `append`:** Each `append` writes directly into the buffer. Note how the same builder accepts an `int` (`1042`), a `double` (`59.99`), and a `String` — `StringBuilder` has overloads that convert primitives to text for you. The chaining works because each `append` returns `this` (the same builder), so we can keep calling methods on it. This is the *fluent interface* style.

**Part 3 — `insert(0, ...)`:** Writes text at position 0, shifting everything else right. The buffer now holds `"[RECEIPT] Order #1042 | total: $59.99 | status: PAID"`.

**Part 4 — `indexOf` + `replace`:** `indexOf("PAID")` finds the start index of that substring; `replace(start, start+4, "COMPLETED")` swaps the 4 characters `PAID` for the longer `COMPLETED`. The range is **half-open** `[start, start+4)` — the character at `start+4` is not touched.

**Part 5 — `reverse`:** Note it's commented out — it exists and mutates the buffer in place, but we don't want to reverse a receipt.

**Part 6 — `toString()`:** The final, crucial step. `StringBuilder` is *mutable* and not safe to share — you never hand it out. You call `toString()` to produce an immutable `String` copy, and only that copy escapes the method.

## Mutating Methods on StringBuilder

All of these mutate the **same** buffer (they return `this` for chaining, but the object identity never changes):

| Method | What it does |
|---|---|
| `append(x)` | Add text to the end |
| `insert(i, x)` | Insert text at index `i` |
| `replace(s, e, x)` | Replace chars `[s, e)` with `x` |
| `delete(s, e)` | Remove chars `[s, e)` |
| `deleteCharAt(i)` | Remove one char |
| `reverse()` | Reverse the buffer |
| `setCharAt(i, c)` | Overwrite one char |
| `setLength(n)` | Truncate or pad |

## StringBuilder vs StringBuffer

There is an older sibling: **`StringBuffer`**. It is identical in API but its methods are `synchronized` (thread-safe). In practice:

- Use **`StringBuilder`** — it's faster (no locking) and is the right choice in single-threaded code, which is almost all string building.
- Use **`StringBuffer`** only if you genuinely share the builder across threads — a rare situation, since sharing a partially-built string across threads is usually a design smell anyway.

## When the Compiler Helps You (and When It Doesn't)

The Java compiler automatically uses `StringBuilder` for simple `+` chains:

```java
String s = a + b + c;   // compiler: new StringBuilder().append(a).append(b).append(c).toString()
```

So a few `+` in one statement are fine — no need to hand-roll a builder. But in a **loop**, the compiler cannot hoist the builder out:

```java
for (...) {
    result = result + x;   // a NEW StringBuilder per iteration — still quadratic
}
```

That's why the rule is: **in a loop, write the `StringBuilder` yourself, outside the loop.**

## Common Beginner Pitfalls

1. **Calling `toString()` inside the loop** — that copies the buffer every iteration, reintroducing the quadratic cost. Build fully, then convert once.
2. **Forgetting to convert at all** — you can't return a `StringBuilder` as your API type safely; call `toString()` at the boundary.
3. **Using `StringBuffer` "just in case"** — the locking cost is real; use `StringBuilder` unless you have a concrete shared-thread scenario.
4. **`+` in a loop** — always hoist a `StringBuilder` above the loop.

## Key Takeaways

- `StringBuilder` is a mutable char buffer — appends write in place, no per-step copy.
- It makes loop-built strings O(n) instead of O(n²).
- Pre-size the buffer when you know the output length.
- Convert to `String` once with `toString()` when done.
- Prefer `StringBuilder` over `StringBuffer` (no locking).
