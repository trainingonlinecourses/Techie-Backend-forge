---
title: Generic Methods — Type Parameters on Methods
module: java-generics-deep
order: 3
minutes: 23
topics: ["generic methods", "type inference", "bounded type parameters", "static generics"]
docs:
  - title: "Generic Methods (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/methods.html"
  - title: "Bounded Type Parameters (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/bounded.html"
summary: A generic class (class Box<T) makes every member of the class generic. But most of the time you need generics for just one method — a helper that w...
---

# Generic Methods — Type Parameters on Methods

## The Concept: When a Whole Class Is Too Much

A generic class (`class Box<T>`) makes *every* member of the class generic. But most of the time you need generics for just **one method** — a helper that works across types while the rest of the class doesn't care. Cramming a `<T>` onto the class for a single helper pollutes the whole class. The solution: declare the type parameter on the method itself.

The syntax looks odd the first time you see it — the type parameter goes **before the return type**:

```java
public <T> T identity(T value) {
    return value;
}
```

Read it as: "This method declares a type parameter `T`. It takes one argument of type `T` and returns a value of type `T`." The `<T>` before the return type is the declaration; everywhere else in the signature is the usage.

## Why Does a Method Need Its Own Type Parameter?

Think about `Collections.max`. It takes a collection and returns the largest element — the *same type* as the collection's elements. If you wrote it with wildcards alone, `Collection<? extends T>`, the return type would have to be `T`... but then where does `T` come from? It must be declared. That's exactly what a generic method does: it connects an input type to an output type so the caller gets back the precise type they put in, with no casts.

Compare these two:

```java
// Wildcard version: loses the exact type. You get a Number back,
// even if you passed a list of Integers.
static Number firstNumber(List<? extends Number> list) {
    return list.get(0);
}

// Generic method: preserves the exact type.
// Call with List<Integer> -> you get Integer back.
static <T> T first(List<T> list) {
    return list.get(0);
}
```

The generic method is *generic in the relationship*: whatever element type the list holds, that's the return type. This is impossible to express with a plain wildcard, because a wildcard deliberately hides the type.

## A Practical Generic Method, Line by Line

Let's write a method that finds the maximum element of any list — the classic `Collections.max` re-implementation:

```java
import java.util.List;
import java.util.Arrays;

public class GenericMethodDemo {

    // <T extends Comparable<T>> declares a BOUNDED type parameter:
    // T must be a type that implements Comparable<T> — i.e., it knows
    // how to compare itself to another of its own kind.
    public static <T extends Comparable<T>> T max(List<T> list) {
        if (list == null || list.isEmpty()) {
            throw new IllegalArgumentException("list must not be empty");
        }

        T current = list.get(0);      // start with the first element
        for (int i = 1; i < list.size(); i++) {
            T candidate = list.get(i);
            // compareTo is available because T is bounded by Comparable<T>.
            // If candidate is "greater than" current, swap.
            if (candidate.compareTo(current) > 0) {
                current = candidate;
            }
        }
        return current;
    }

    public static void main(String[] args) {
        List<Integer> numbers = Arrays.asList(3, 9, 1, 7, 5);
        Integer biggest = max(numbers);   // returns Integer, not Object
        System.out.println(biggest);      // 9

        List<String> words = Arrays.asList("apple", "mango", "banana");
        String longest = max(words);      // returns String
        System.out.println(longest);      // mango (alphabetically last)
    }
}
```

**Walking through it, piece by piece:**

- `public static <T extends Comparable<T>>` — three things in one: `static` because it's a utility method; `<T extends Comparable<T>>` declares the type parameter *and* its bound; and crucially the bound is what makes `compareTo` callable on `T`. Without the bound, `T` erases to `Object`, and `Object` has no `compareTo` — the call would not compile.

- The bound `<T extends Comparable<T>>` is self-referential on purpose: "T is a type that can compare itself to T." `String implements Comparable<String>`, `Integer implements Comparable<Integer>`, so both work. This is the standard idiom for sorting/comparison APIs and is exactly how `Collections.max`, `Collections.sort`, and `Arrays.sort` are declared in the JDK.

- `T current = list.get(0);` — the method works with `T` throughout its body. To the compiler, inside this method `T` is a real (though unknown) type with the capabilities of its bound: you can assign it, compare it via `compareTo`, and return it.

- The loop body uses `candidate.compareTo(current) > 0` — that's the *only* place the bound matters. `compareTo` returns a negative int if `candidate` is less, zero if equal, positive if greater. Comparing to `> 0` means "candidate is larger," so we replace `current`. Note this uses natural ordering — for custom classes you'd pass a `Comparator`, but the generic shape is the same.

- In `main`, notice what you did **not** write: no casts, no `(Integer)` anywhere. The compiler inferred `T = Integer` from the argument `List<Integer>` and therefore typed the return as `Integer`. This automatic deduction is called **type inference**, and it's why generic methods read so cleanly at call sites.

## Type Inference in Detail

When you call `max(numbers)` with a `List<Integer>`, the compiler performs inference: it looks at the argument types and the expected result, and solves for `T`. Since the argument is `List<Integer>`, `T` must be `Integer`. If you *also* constrain the result — `String s = max(numbers);` — inference would try to satisfy both constraints, fail, and report a type mismatch.

Inference also works with **target typing** for the diamond operator: `Map<String, List<Integer>> m = new HashMap<>();` — the empty `<>` asks the compiler to infer the map's type arguments from the left-hand side. And in Java 8+, **poly expressions** let inference flow across method chains: `Collections.emptyList()` used in `List<String> x = Collections.emptyList();` infers `String`.

## Generic Methods and Static Context

Here's a rule that trips up many developers: **a static method cannot use the class's type parameter.** `class Box<T> { static T make() { ... } }` is a compile error, because statics belong to the erased `Box` class shared by all `Box<String>`, `Box<Integer>`, etc. — there is no single `T` to use.

But a static method can declare **its own** type parameter: `static <T> Box<T> of(T value)`. This is exactly how `List.of`, `Map.of`, and `Optional.of` work — they are static generic factory methods. The type parameter belongs to the method, not the class, so there's no conflict.

## Common Beginner Mistakes

- **Forgetting the `<T>` before the return type.** `public static T max(...)` without the declaration is an error — the compiler has no idea what `T` is. The declaration must appear exactly once, before the return type.

- **Confusing a bounded parameter with a wildcard.** `<T extends Number>` declares a type parameter usable throughout the method body; `List<? extends Number>` hides the type at a single use site. They serve different purposes: use a type parameter when you need to *name* the type (to return it, to declare locals, to call methods on it), use a wildcard when you only need to *accept* many types without naming them.

- **Over-bounding.** `<T extends Comparable<T> & Serializable>` is legal (multiple bounds with `&`), but only the *first* bound is used for erasure, and every bound must be an interface after the first class. Bounds should express a genuine requirement — adding `Serializable` "just in case" constrains callers for no benefit.

## Recap

Generic methods put a type parameter on a single method, connecting input and output types so callers get exact types back without casts. The declaration sits before the return type, bounds (`<T extends Comparable<T>>`) grant the method access to capabilities of `T`, and type inference makes call sites clean. Use a generic method whenever the relationship between parameter types and return type matters; use wildcards when you only need to accept a range of types. Combined, they give you the full expressive power of the generics system.
