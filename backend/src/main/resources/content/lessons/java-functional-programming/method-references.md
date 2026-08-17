---
title: Method References — Lambdas That Just Call Something
module: java-functional-programming
order: 3
minutes: 22
topics: ["method references", "ClassName::method", "instance::method", "constructor references", "shorthand"]
docs:
  - title: "Method references (Java tutorial)"
    url: "https://docs.oracle.com/javase/tutorial/java/javaOO/methodreferences.html"
---

# Method References — Lambdas That Just Call Something

## The Concept: When the Lambda Is Just "Call That Method"

Many lambdas are nothing but a forwarding call:

```java
names.forEach(name -> System.out.println(name));
```

The lambda exists *only* to call `System.out.println(name)`. Writing the `name ->` wrapper adds noise without adding meaning. Java gives you a shorthand — the **method reference**:

```java
names.forEach(System.out::println);
```

The `::` operator (pronounced "double colon") means: *"use the method named `println` on `System.out` as the implementation of this functional interface."* Same behavior, less ceremony, and — for some readers — clearer intent: "for each name, println it."

A method reference is **not** a new language feature with new runtime behavior — it's a *syntax sugar* that the compiler rewrites into an equivalent lambda. The reference must still match the functional interface's method signature (parameter count, types, return type). The benefit is purely expressiveness and precision.

## The Four Kinds of Method References

| Kind | Syntax | Example | Equivalent lambda |
|---|---|---|---|
| Static method | `Class::staticMethod` | `Math::max` | `(a, b) -> Math.max(a, b)` |
| Instance method of a specific object | `obj::instanceMethod` | `System.out::println` | `x -> System.out.println(x)` |
| Instance method of *any* object of a class (unbound) | `Class::instanceMethod` | `String::toUpperCase` | `s -> s.toUpperCase()` |
| Constructor | `ClassName::new` | `ArrayList::new` | `() -> new ArrayList<>()` |

The unbound form (row 3) is the one that trips people up: `String::toUpperCase` means *"call `toUpperCase` on whichever String arrives as the argument."* The first argument to the functional method becomes the receiver of the instance method.

## The Code Walkthrough

```java
import java.util.*;
import java.util.function.*;
import java.util.stream.*;

public class MethodRefDemo {

    public static void main(String[] args) {
        List<String> names = new ArrayList<>(List.of("sateesh", "aisha", "bob"));

        // ---- 1. Static method reference ----
        // Comparator.comparing needs "extract the sort key" — here, a String -> String
        names.sort(Comparator.comparing(String::toLowerCase));    // unbound instance method
        System.out.println(names);   // [aisha, bob, sateesh]

        // ---- 2. Bound instance method (specific object) ----
        names.forEach(System.out::println);     // x -> System.out.println(x)

        // ---- 3. Unbound instance method ----
        // Predicate<String> — the argument becomes the receiver
        Predicate<String> isEmpty = String::isEmpty;   // s -> s.isEmpty()
        System.out.println(isEmpty.test(""));          // true

        // ---- 4. Static method in a stream ----
        List<Integer> nums = List.of(3, 7, 2, 9);
        int max = nums.stream().reduce(0, Math::max);  // (a, b) -> Math.max(a, b)
        System.out.println(max);                       // 9

        // ---- 5. Constructor reference ----
        Supplier<List<String>> listFactory = ArrayList::new;   // () -> new ArrayList<>()
        List<String> fresh = listFactory.get();
        System.out.println(fresh.getClass().getSimpleName());  // ArrayList

        // ---- 6. With Stream mapping — the common real-world use ----
        List<Integer> lengths = names.stream()
                .map(String::length)         // name -> name.length()
                .toList();
        System.out.println(lengths);         // [5, 4, 3]
    }
}
```

### Walking Through Each Part

**Part 1 — unbound reference as a key extractor.** `Comparator.comparing` wants a `Function<String, R>` that pulls a sort key out of each element. `String::toLowerCase` fits: the incoming String becomes the receiver, `toLowerCase()` runs on it, and its result is the key. This is the single most common method-reference usage in real code.

**Part 2 — bound reference.** `System.out` is a *specific object*; `System.out::println` binds the method to it. Equivalent to `x -> System.out.println(x)`.

**Part 3 — unbound predicate.** `String::isEmpty` means "call `isEmpty()` on the argument". The parameter of the functional method (`test(String)`) becomes `this`. This works only when the method takes no extra arguments.

**Part 4 — static reference in `reduce`.** `Math::max` is a two-arg static method matching `BinaryOperator<Integer>`: `(a, b) -> Math.max(a, b)`. `reduce` folds the list through it: `max(max(max(0,3),7),2) = 9`.

**Part 5 — constructor reference.** `ArrayList::new` matches `Supplier<List<String>>` (no args, returns a list). The compiler calls `new ArrayList<>()` when `get()` is invoked. This is how factories become first-class values — handy for `Collectors.toCollection(ArrayList::new)`.

**Part 6 — the stream idiom.** `.map(String::length)` — the transformation "take each element and call `length` on it" in the tightest possible syntax.

## When to Prefer a Method Reference Over a Lambda

Prefer the reference when it's a **direct forwarding call**:

```java
// GOOD — reference, matches intent
items.stream().map(Item::getPrice).toList();

// OK but noisier — lambda
items.stream().map(item -> item.getPrice()).toList();
```

Prefer the lambda when you're **adding logic** around the call:

```java
// GOOD — lambda, there's extra work
items.stream().map(item -> item.getPrice() * (1 - discount)).toList();

// Bad — a reference can't express this
items.stream().map(Item::getPrice)  // (can't apply the discount)
```

Rule of thumb: if the body is *exactly* one method call, use `::`. If there's arithmetic, conditions, or multiple calls, use a lambda.

## Method References with Overloaded Methods

If a method is overloaded, the functional interface's signature picks the right overload:

```java
// String has valueOf(int), valueOf(double), valueOf(Object), ...
Function<Integer, String> f = String::valueOf;    // picks valueOf(int) — Integer unboxes
System.out.println(f.apply(42).getClass().getSimpleName());   // String
```

The compiler selects the overload whose parameter types match the target signature. Ambiguity is possible with `null`-tolerant overloads (`valueOf(Object)` vs primitives), but the compiler resolves by target typing in most cases.

## Common Beginner Pitfalls

1. **`Class::method` vs `obj::method` confusion** — `String::toUpperCase` (unbound: receiver = argument) vs `someString::toUpperCase` (bound: that specific string). Mixing them up is a compile error, not a runtime bug.
2. **Forgetting the signature must match** — a reference to a method with the wrong parameter count/types fails at compile time with a clear message.
3. **Using `::new` without a matching constructor** — the constructor's arity must match the target interface.
4. **Applying the discount-in-a-reference instinct** — references are for *direct* calls only; wrap logic in a lambda.
5. **`this::method` inside an instance** — works fine (bound to `this`), but beware of capturing `this` into a long-lived callback (retention).

## Key Takeaways

- A method reference is sugar for a lambda that just calls one method.
- Four forms: static (`Math::max`), bound instance (`System.out::println`), unbound instance (`String::length`), constructor (`ArrayList::new`).
- Unbound instance references: the first argument becomes the receiver.
- Use `::` for direct calls, lambdas for anything with added logic.
- `Comparator.comparing(KeyExtractor::extract)` and `.map(Obj::getField)` are the canonical uses.
