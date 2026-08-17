---
title: Composing Functions — Building Pipelines from Small Pieces
module: java-functional-programming
order: 4
minutes: 25
topics: ["composition", "andThen", "compose", "currying", "partial application", "pipeline design"]
docs:
  - title: "Function (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/Function.html"
---

# Composing Functions — Building Pipelines from Small Pieces

## The Concept: Functions as Lego Bricks

A `Function<T,R>` is a single brick: "T in, R out." Real programs need multi-step processing — clean, validate, transform, format. Two ways to do that:

1. **Write one big method** that does everything (coupling, hard to test, hard to reuse).
2. **Write small single-purpose functions and *compose* them** into a pipeline.

Composition is the second way: `f.andThen(g)` creates a *new* function that does `f` first, then `g`. You haven't written new logic — you've *connected* existing logic. This is the functional-programming version of Unix pipes: `cat file | grep x | sort | head`.

The deeper idea: **a program is a data-flow graph.** By building small, pure functions and connecting them, you make each step independently testable, reusable, and reorderable. The composition operators (`andThen`, `compose`) are the glue.

## andThen vs compose — Which Order?

```java
Function<Integer,Integer> doubleIt = x -> x * 2;
Function<Integer,Integer> addOne   = x -> x + 1;

doubleIt.andThen(addOne).apply(5);   // doubleIt FIRST, then addOne  -> 11
doubleIt.compose(addOne).apply(5);   // addOne FIRST, then doubleIt  -> 12
```

- `f.andThen(g)`: do `f`, feed the result to `g`. Reads left-to-right — like writing steps in order.
- `f.compose(g)`: do `g`, feed the result to `f`. Reads *right-to-left* — like nested math `f(g(x))`.

`andThen` is usually clearer (left-to-right matches how you'd say it aloud). Use `compose` when you're building from the innermost operation outward.

## The Code Walkthrough

```java
import java.util.function.*;

public class ComposeDemo {

    public static void main(String[] args) {
        // ---- 1. A pipeline: trim -> lower -> count words ----
        Function<String, String> trim      = String::trim;
        Function<String, String> lower     = String::toLowerCase;
        Function<String, Integer> wordCount = s -> s.split("\\s+").length;

        Function<String, Integer> pipeline = trim.andThen(lower).andThen(wordCount);
        System.out.println(pipeline.apply("  Hello World  "));   // 2

        // ---- 2. Currying: one function that makes functions ----
        // multiply(x) returns a function that multiplies by x
        Function<Integer, Function<Integer, Integer>> multiply =
                x -> y -> x * y;

        Function<Integer, Integer> doubleIt = multiply.apply(2);   // partial application
        Function<Integer, Integer> tripleIt = multiply.apply(3);

        System.out.println(doubleIt.apply(10));   // 20
        System.out.println(tripleIt.apply(10));   // 30

        // ---- 3. Composition in streams (the real world) ----
        var names = java.util.List.of("  sateesh ", "AISHA", "bob");
        var cleaned = names.stream()
                .map(String::trim)
                .map(String::toLowerCase)
                .filter(s -> !s.isEmpty())
                .toList();
        System.out.println(cleaned);   // [sateesh, aisha, bob]
    }
}
```

### Walking Through Each Part

**Part 1 — the pipeline.** Three tiny functions compose into one: `trim.andThen(lower).andThen(wordCount)` — `"  Hello World  "` → `"Hello World"` → `"hello world"` → `2`. Each step is independently testable: you can test `trim` alone, `lower` alone, `wordCount` alone. The pipeline is just *wiring*. If a later step needs changing, only that step changes.

**Part 2 — currying and partial application.** `x -> y -> x * y` is a **curried** function: a function that *returns* a function. `multiply.apply(2)` *partially applies* the first argument, producing a specialized function (`doubleIt`). This is how you make reusable, configured behaviors from a general template — e.g., `discount(0.2)` returns the "apply 20% off" function. Note the arrow chains right-associatively: `x -> (y -> x * y)`.

**Part 3 — streams as composition.** The Stream API is composition in practice: each `.map`/`.filter` stage is a function in the pipeline. The stages stay small, pure, and testable; the pipeline reads top to bottom as a data-flow description.

## Pure Functions Make Composition Possible

Composition only behaves predictably if the pieces are **pure**: same input → same output, no hidden state, no side effects (no printing, no mutating globals, no I/O inside). If `trim` secretly incremented a counter or depended on the time of day, composing it would be a minefield — order and timing would change results. This is why functional style pushes side effects to the *edges* of the program: pure core, impure boundary.

```java
// PURE — safe to compose, test, reuse
Function<Order, Double> subtotal = o -> o.items().stream().mapToDouble(Item::price).sum();

// IMPURE — cannot be safely composed or tested
Function<Order, Double> withTax = o -> subtotal.apply(o) * (1 + taxRateService.fetchNow()); // DB call inside!
```

## Practical Patterns

**Chained validation:**

```java
Function<String, String> validate =
        s -> s.isBlank() ? "empty" : s;
Function<String, String> normalize =
        s -> validate.apply(s).toLowerCase();
```

**Configurable factories (currying):**

```java
Function<Double, Function<Double, Double>> tax =
        rate -> amount -> amount * rate;
Function<Double, Double> gst = tax.apply(0.18);
System.out.println(gst.apply(1000.0));   // 180.0
```

**Reuse in different pipelines:** the same `Function` bricks appear in multiple composed pipelines — the composition layer is where your program's flexibility lives.

## Common Beginner Pitfalls

1. **Mixing up `andThen` and `compose` order** — `andThen` left-to-right; `compose` right-to-left. Test with a tiny example when unsure.
2. **Composing impure functions** — hidden state or I/O inside a stage breaks reproducibility. Keep stages pure.
3. **Chaining too many stages** — readability suffers; extract a named function for a repeated 3+ stage pipeline.
4. **Currying syntax confusion** — `x -> y -> ...` associates to the right; parenthesize mentally as `x -> (y -> ...)`.
5. **Forgetting the result must be *applied*** — `pipeline` is a function; `pipeline.apply(input)` actually runs it. `pipeline` alone does nothing.

## Key Takeaways

- Composition builds bigger behavior from small pure functions: `f.andThen(g)`.
- `andThen` runs left-to-right; `compose` runs right-to-left (`f(g(x))`).
- Currying (`x -> y -> ...`) + partial application (`f.apply(2)`) makes configurable factories.
- Streams are composition in practice — each stage a small pure function.
- Purity (no hidden state, no side effects) is what makes composition safe and testable.
