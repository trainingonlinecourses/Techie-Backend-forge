---
title: Recursion Basics — A Method That Calls Itself
summary: Recursion is a method solving a problem by calling itself on a smaller piece of the same problem. This lesson builds the mental model — base case, recursive case, and the call stack — from scratch, with runnable examples you can trace line by line.
order: 1
minutes: 22
topics: [recursion, call-stack, base-case, methods, control-flow]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/methods.html
capstone: false
---
# Recursion Basics — A Method That Calls Itself

## The Concept, From Zero

Recursion is one of those ideas that sounds intimidating and is actually tiny: **a method calls itself**. That's it. The real skill is knowing how to stop it from calling itself forever, and what the computer is doing behind the scenes while it happens.

Think of looking up a word in a dictionary and the definition contains another word you don't know, so you look that one up too — and repeat until you hit a definition you fully understand. You just did recursion: the same "look up a word" procedure, applied to a smaller unknown, until you reach one that needs no more lookups.

Every recursive method has exactly two parts:

- **The base case** — the smallest input where you can answer **directly, without recursing**. This is the dictionary definition you already understand.
- **The recursive case** — the answer expressed in terms of **the same problem on smaller input**, moving toward the base case every time.

If either part is missing or wrong, the method either never finishes (a stack overflow) or computes the wrong thing.

### The first example: countdown

```java
public class Countdown {
    public static void main(String[] args) {
        countDown(3);
    }

    static void countDown(int n) {
        if (n == 0) {                    // base case: nothing left to count
            System.out.println("Liftoff!");
            return;
        }
        System.out.println(n);
        countDown(n - 1);                // recursive case: same job, smaller n
    }
}
```

Output:

```text
3
2
1
Liftoff!
```

Trace what actually happens. Calling `countDown(3)` prints `3` and calls `countDown(2)`. That prints `2` and calls `countDown(1)`. That prints `1` and calls `countDown(0)` — which hits the base case and returns. Each call finishes only after the call it made finishes. The base case is what stops the chain from being infinite.

### The call stack — what the computer is really doing

Every method call gets a **stack frame**: a small box of memory holding its parameters and local variables. Frames stack up and come off in last-in-first-out order.

For `countDown(3)`, at the deepest moment the stack looks like this:

```text
countDown(0)   ← top: hit the base case, returns now
countDown(1)   paused at countDown(n - 1), waiting
countDown(2)   paused at countDown(n - 1), waiting
countDown(3)   paused at countDown(n - 1), waiting
main()
```

Then `countDown(0)` returns, then `countDown(1)` has nothing left to do and returns, and so on — the stack unwinds back to `main`. This is why a missing base case produces a **`StackOverflowError`**: each new call adds a frame, memory runs out, and the JVM kills the thread.

The stack also explains the **depth limit**. Recursion depth in Java is roughly in the tens of thousands for typical stack sizes. Fine for "sum a list of 1,000 numbers"; wrong for "walk a linked structure with 10 million nodes" — that needs a loop or an explicit stack.

### A computation, not just an action: factorial

Countdown *does* work while going down. Recursive methods can also *compute* by combining the result of the smaller call:

```java
public class Factorial {
    public static void main(String[] args) {
        System.out.println(factorial(5));   // 120
    }

    static long factorial(int n) {
        if (n <= 1) {                       // base case: 0! and 1! are both 1
            return 1;
        }
        return n * factorial(n - 1);        // n! = n * (n-1)!
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `Factorial` with methods `main()`, `factorial()`.
- Uses conditionals.

The key line is `return n * factorial(n - 1)`. Notice the method can't finish its multiplication until the smaller call returns. Expanding it by hand:

```text
factorial(5)
= 5 * factorial(4)
= 5 * (4 * factorial(3))
= 5 * (4 * (3 * factorial(2)))
= 5 * (4 * (3 * (2 * factorial(1))))
= 5 * (4 * (3 * (2 * 1)))        ← base case finally answers
= 120
```

The multiplication happens on the way **back up**. The "down" phase shrinks the problem; the "up" phase combines results. Every recursive computation has these two phases, and knowing which work happens in which phase is how you learn to design your own.

### One classic: summing digits

A small example that shows "smaller input" doesn't have to mean `n - 1`:

```java
static int digitSum(int n) {
    if (n < 10) {
        return n;                       // single digit: it's its own sum
    }
    return (n % 10) + digitSum(n / 10); // last digit + sum of the rest
}
```

<!-- why -->
**What this code shows:**

- Uses conditionals.

`digitSum(1729)` = `9 + digitSum(172)` = `9 + 2 + digitSum(17)` = `9 + 2 + 7 + digitSum(1)` = `19`. The shrinking move here is `n / 10` — any operation that reliably heads toward the base case works.

## Common Mistakes

- **Forgetting the base case** — the method recurses until `StackOverflowError`. Always write the base case first, before the recursive case.
- **Not shrinking** — `factorial(n)` calling `factorial(n)` (or even `factorial(n - 0)`) never reaches the base case. Every call must move strictly toward it.
- **Base case too narrow** — `factorial` with `if (n == 1)` breaks for `factorial(0)` and for negative input. Ask: "what is the *widest* set of inputs I can answer directly?"
- **Using recursion for a simple loop** — `countDown` is a teaching example; in real code that's a `for` loop. Recursion earns its complexity when the *data* is recursive (trees, nested JSON, file systems) — that's covered in the next lesson.

## Quick Checklist

- [ ] I can name the base case and the recursive case in any recursive method I read.
- [ ] I can trace a 3–4 level recursion by drawing the stack of calls.
- [ ] I can explain why a missing base case causes `StackOverflowError`.
- [ ] I can predict what happens on the way "down" vs. the way "up" (action vs. combining results).

## References

- [GeeksforGeeks — Introduction to Recursion](https://www.geeksforgeeks.org/introduction-to-recursion-2/)
- [W3Schools — Java Recursion](https://www.w3schools.com/java/java_recursion.asp)
- [dev.java — Defining Methods](https://dev.java/learn/methods/defined/)
- [Codecademy — Recursion in Java](https://www.codecademy.com/learn/learn-java/modules/learn-java-recursion)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
