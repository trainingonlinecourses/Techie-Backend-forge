---
title: Functional Interfaces — the Contract a Lambda Fulfills
module: java-functional-programming
order: 2
minutes: 24
topics: ["functional interfaces", "Predicate", "Function", "Consumer", "Supplier", "@FunctionalInterface"]
docs:
  - title: "java.util.function package summary"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/package-summary.html"
summary: A lambda doesn't float in the void — it must implement something. That something is a functional interface: an interface with exactly one abstract ...
---

# Functional Interfaces — the Contract a Lambda Fulfills

## The Concept: The "One Job" Contract

A lambda doesn't float in the void — it must *implement* something. That something is a **functional interface**: an interface with **exactly one abstract method**. The lambda provides the body of that one method; the interface supplies the type, the name, the parameter types, and the return type.

Think of it like a job posting: "We need a person who can do *one task*: `apply` — take an input, return an output." The interface is the job description; the lambda is the candidate who fills it. Because there's exactly one abstract method, the compiler always knows which method the lambda is implementing — no ambiguity.

The annotation `@FunctionalInterface` makes the contract explicit and asks the compiler to verify it:

```java
@FunctionalInterface
interface Greeter {
    String greet(String name);     // exactly ONE abstract method
}
```

If you add a second abstract method, the compiler refuses to compile — the interface is no longer functional, and lambdas can't target it.

## The Big Four (and Friends) in java.util.function

Java ships a standard toolbox of functional interfaces, covering the four shapes behavior can take:

| Interface | Abstract method | Input → Output | Use when |
|---|---|---|---|
| `Predicate<T>` | `boolean test(T)` | T → boolean | Filtering, checking a condition |
| `Function<T,R>` | `R apply(T)` | T → R | Transforming one value into another |
| `Consumer<T>` | `void accept(T)` | T → nothing | Doing something with a value (side effect) |
| `Supplier<T>` | `T get()` | nothing → T | Producing a value on demand (lazy) |
| `BiFunction<T,U,R>` | `R apply(T,U)` | (T,U) → R | Combining two values |
| `UnaryOperator<T>` | `T apply(T)` | T → T | Same-type transform (e.g., `x -> x + 1`) |
| `BinaryOperator<T>` | `T apply(T,T)` | (T,T) → T | Combining two of the same type |

Primitive variants (`IntPredicate`, `LongFunction`, `DoubleSupplier`...) avoid boxing for performance in hot paths — worth knowing, rarely needed by hand.

## The Code Walkthrough

```java
import java.util.function.*;
import java.util.*;

public class FunctionalInterfaceDemo {

    public static void main(String[] args) {
        // ---- 1. Predicate: a condition ----
        Predicate<String> isLong = s -> s.length() > 5;
        System.out.println(isLong.test("Spring"));     // true

        // ---- 2. Function: a transform ----
        Function<String, Integer> wordCount = s -> s.split("\\s+").length;
        System.out.println(wordCount.apply("Java and Spring"));   // 3

        // ---- 3. Consumer: a side effect ----
        Consumer<String> logger = s -> System.out.println("[log] " + s);
        logger.accept("booted");

        // ---- 4. Supplier: lazy production ----
        Supplier<Double> random = () -> Math.random();     // nothing in, value out
        System.out.println(random.get());

        // ---- 5. Composing with andThen / compose ----
        Function<Integer, Integer> doubleIt = x -> x * 2;
        Function<Integer, Integer> addOne = x -> x + 1;
        Function<Integer, Integer> doubleThenAdd = doubleIt.andThen(addOne);
        System.out.println(doubleThenAdd.apply(5));        // 11  (5*2=10, then +1)

        // ---- 6. Default methods — predicates combine ----
        Predicate<String> startsWithA = s -> s.startsWith("A");
        Predicate<String> longEnough = s -> s.length() > 3;
        Predicate<String> both = startsWithA.and(longEnough).or(s -> s.equals("xyz"));
        System.out.println(both.test("Apple"));            // true (A + long)
        System.out.println(both.test("xyz"));              // true (or branch)
    }
}
```

### Walking Through Each Part

**Part 1 — `Predicate`.** One input, `boolean` out. The *test* method name tells you its purpose: it's the "does this value pass?" check used by `filter` and `removeIf`.

**Part 2 — `Function`.** One input, one output of possibly different types — here `String` → `Integer`. This is the "transform" shape used by `map` in streams and `replaceAll` in lists.

**Part 3 — `Consumer`.** One input, no result — pure side effect. Logging, printing, sending to a sink. This is the shape of `forEach`'s argument. (Note: consumers break *referential transparency* — the point is the effect, not a returned value.)

**Part 4 — `Supplier`.** No input, one output. The "deferred computation": nothing happens until `get()` is called. This is how lazy values work — you pass a *recipe* (the supplier) rather than the value, so the work happens only if (and when) it's needed.

**Part 5 — `andThen`.** Functions compose: `doubleIt.andThen(addOne)` creates a new function that runs `doubleIt` then feeds its result into `addOne`. `5 → 10 → 11`. (The sibling `compose` runs the argument function *first* instead.) This is the heart of functional style: building complex transforms from small pieces.

**Part 6 — combining predicates.** `Predicate` has default methods `and`, `or`, `negate` that combine predicates into new predicates — boolean logic as composable values. This beats nested `if` chains when the condition is reused.

## Writing Your Own Functional Interface

```java
@FunctionalInterface
interface Transformer<T> {
    T transform(T value);

    // default methods are allowed — they're not abstract
    default Transformer<T> andThen(Transformer<T> after) {
        return value -> after.transform(transform(value));
    }
}
```

Rules for a functional interface:

- Exactly **one abstract method**.
- `default` methods are fine (they have bodies).
- `static` methods are fine.
- Methods from `Object` (`toString`, `equals`, `hashCode`) don't count.
- `@FunctionalInterface` is optional but *enforced* — it makes mistakes compile-time errors.

## The Overload Trap

When a method is overloaded with different functional interfaces, the compiler can't always tell which lambda type you meant:

```java
// Both take a functional interface — ambiguous!
// void handle(Function<String,Integer> f) {...}
// void handle(Consumer<String> c) {...}
// handle(s -> s.length());   // COMPILE ERROR: which one?
```

Fix: cast to the target type (`handle((Function<String,Integer>) s -> s.length())`) or rename the methods. In practice this is rare — just know it exists.

## Common Beginner Pitfalls

1. **Thinking a lambda has a type of its own** — it doesn't; it takes the type of the functional interface in context.
2. **Adding a second abstract method to a `@FunctionalInterface`** — compile error; that's the point of the annotation.
3. **Reaching for `Function` when you need a condition** — `Predicate` returns `boolean` and reads better (`isLong.test(x)` vs `count.apply(x) > 5`).
4. **`Consumer` vs `Function` confusion** — Consumer returns void (side effect); Function returns a value (pure transform).
5. **Forgetting `java.util.function`'s primitive variants exist** — `IntPredicate` avoids Integer boxing in hot loops.
6. **Reinventing the wheel** — `and`/`or`/`andThen`/`compose` already compose your pieces; use them instead of hand-rolled conditionals.

## Key Takeaways

- A functional interface has exactly one abstract method — the contract a lambda fulfills.
- The big four: `Predicate` (test), `Function` (transform), `Consumer` (side effect), `Supplier` (lazy produce).
- `andThen`/`compose`/`and`/`or` let small functions combine into bigger ones.
- `@FunctionalInterface` turns the rule into a compile-time check.
- Lambdas take their type from context — the interface, not the lambda, has the name.
