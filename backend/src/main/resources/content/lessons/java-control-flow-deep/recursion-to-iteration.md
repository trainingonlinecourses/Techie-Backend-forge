---
title: Recursion to Iteration — When to Convert, and How
summary: Every recursive method can be rewritten with a loop, and vice versa. This lesson shows the mechanical conversions (head/tail recursion, accumulator loops, explicit stacks), the cost model behind the choice, and the rule of thumb production code actually uses.
order: 2
minutes: 20
topics: [recursion, iteration, loops, explicit-stack, tail-recursion, call-stack]
docs:
  - https://docs.oracle.com/javase/tutorial/java/nutsandbolts/for.html
capstone: false
---
# Recursion to Iteration — When to Convert, and How

## The Concept, From Zero

Recursion and loops are two syntaxes for the same underlying machine: repeat work until a stopping condition. The call stack does implicitly what a loop does with explicit variables. Knowing both directions of conversion matters for two reasons: you can *read* any recursive solution by mentally converting it to a loop, and you can *fix* a stack overflow by converting recursion to iteration.

### Direction one: tail recursion → a loop

When the recursive call is the **very last thing** the method does, with nothing left to combine afterward, it's called **tail recursion**. These convert mechanically: replace "call myself" with "change my variables and loop."

Countdown from the previous lesson is tail recursive:

```java
static void countDown(int n) {
    if (n == 0) {                    // base case = loop exit condition
        System.out.println("Liftoff!");
        return;
    }
    System.out.println(n);
    countDown(n - 1);                // tail call: nothing happens after
}
```

<!-- why -->
**What this code shows:**

- Uses conditionals.
- When run, it prints: “Liftoff!”

becomes:

```java
static void countDownLoop(int n) {
    while (n != 0) {                 // base case becomes the exit condition
        System.out.println(n);
        n = n - 1;                   // recursive argument becomes the update
    }
    System.out.println("Liftoff!");
}
```

Same output, no stack growth. The loop variables (`n`) play the role of the parameters in each stack frame.

### Direction two: accumulator pattern — result built on the way down

Factorial is *not* tail recursive — `return n * factorial(n - 1)` has a multiplication waiting after the call. But you can restructure it so the result is carried **into** the call instead of combined **out of** it:

```java
static long factorialLoop(int n) {
    long result = 1;
    while (n > 1) {                  // recursive case = the loop condition
        result = result * n;         // the "combine" work, done inline
        n = n - 1;                   // shrink toward the base case
    }
    return result;                   // the base-case value
}
```

<!-- why -->
**What this code shows:**

- Uses loops.

This is the general recipe: the accumulator variable (`result`) replaces the return-value combination, and the loop condition replaces the base case. If you can trace the recursive version on paper, you can write this version.

### When the recursion isn't simple: the explicit stack

Some recursive shapes don't fit a single loop — recursion that branches (a call making *two* recursive calls), or work that must happen *after* the child call returns. The universal conversion tool is an **explicit stack** (`ArrayDeque`): you manage the frames yourself.

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class FileWalker {
    public static void main(String[] args) {
        // Walk a nested folder structure without recursion.
        Deque<String> stack = new ArrayDeque<>();
        stack.push("project/src");                       // start where recursion would start

        while (!stack.isEmpty()) {                       // "not at the base case yet"
            String dir = stack.pop();                    // take one pending piece of work
            System.out.println("visiting " + dir);
            // In real code: list files; push subdirectories so they're handled later.
            // The LIFO order is exactly what the call stack would have done.
            if (dir.contains("src")) {
                stack.push("project/src/main");
                stack.push("project/src/test");
            }
        }
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `FileWalker` with methods `main()`.
- Uses loops.
- Uses conditionals.
- Uses generics.

Why this matters: a real directory tree can be 50 levels deep — fine — but a **linked structure of 1 million nodes** would blow the call stack at ~10,000 frames while the explicit stack version runs happily, because the heap holds far more than the thread stack can.

### The cost model — what recursion actually costs

Every recursive call costs a **stack frame**: parameters, locals, a return address. A loop costs none of that. Three practical consequences:

1. **Depth is finite.** Around 10,000–20,000 calls deep, the default thread stack (512KB–1MB) is exhausted → `StackOverflowError`. Loops don't have this limit.
2. **There's a per-call overhead** — a few nanoseconds for frame setup/teardown. The JIT inlines a lot of this, so it rarely dominates, but it exists.
3. **No tail-call optimization in Java.** Some languages reuse the frame for tail calls, making recursion as cheap as a loop. The JVM does not. In Java, deep recursion is *always* a stack-depth risk.

### So when do you actually use recursion?

Use recursion when the **data is recursive** — trees, nested JSON, file systems, JSON path evaluation, comment threads. The recursive solution mirrors the data shape and is dramatically clearer. The next lesson applies this to tree traversal, where recursion is the idiomatic choice.

Use iteration when the shape is **linear** (counting, summing, searching a list) or the depth can be **large and unbounded** (walking user-generated structures, linked lists of unknown length).

## Common Mistakes

- **Converting everything.** Rewriting a clean tree traversal into an explicit-stack loop usually makes code slower to read and no faster to run. Convert for stack-safety or clarity, not reflexively.
- **Forgetting the exit condition in the loop version** — the base case must become the `while` condition; drop it and you've traded a stack overflow for an infinite loop.
- **Assuming the JIT saves you.** Frame costs are usually negligible, but the *depth limit* is structural — no optimization removes `StackOverflowError`.

## Quick Checklist

- [ ] I can convert a tail-recursive method to a `while` loop mechanically.
- [ ] I can convert factorial-style recursion using an accumulator variable.
- [ ] I can explain what an explicit `Deque` stack replaces and when I need one.
- [ ] I can state the two situations where recursion is the *better* choice.

## References

- [GeeksforGeeks — Recursion vs Iteration](https://www.geeksforgeeks.org/difference-between-recursion-and-iteration/)
- [dev.java — Control Flow](https://dev.java/learn/language-basics/control-flow/)
- [W3Schools — Java While Loop](https://www.w3schools.com/java/java_while_loop.asp)
- [Codecademy — Loops in Java](https://www.codecademy.com/learn/learn-java/modules/learn-java-loops)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
