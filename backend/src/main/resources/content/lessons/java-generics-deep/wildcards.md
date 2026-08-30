---
title: Wildcards — ? extends, ? super, and Unbounded
module: java-generics-deep
order: 2
minutes: 27
topics: ["wildcards", "covariance", "contravariance", "producer extends", "consumer super"]
summary: In the previous lesson we learned that List<String is not a subtype of List<Object. That rule protects type safety, but it creates an everyday prob...
docs:
  - title: "Wildcards (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/wildcards.html"
  - title: "Guidelines for Wildcard Use (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/generics/wildcardGuidelines.html"
---

# Wildcards — ? extends, ? super, and Unbounded

## The Concept: Why Plain Generics Feel Rigid

In the previous lesson we learned that `List<String>` is **not** a subtype of `List<Object>`. That rule protects type safety, but it creates an everyday problem. Suppose you write a method that prints any list:

```java
public static void printAll(List<Object> list) {
    for (Object o : list) System.out.println(o);
}
```

You naturally want to call `printAll` with a `List<String>`, a `List<Integer>`, or a `List<Book>`. But the compiler refuses: `printAll` demands exactly `List<Object>`, and `List<String>` is not one. The method is needlessly rigid — it only *reads* from the list, so letting it accept lists of any element type would be perfectly safe.

**The core idea of wildcards:** a `?` (question mark) in a type argument means "I don't know or don't care what the exact type is." It lets you write methods that work across many instantiations of a generic type, while the compiler still enforces safety where it matters — which is *in* versus *out*.

There are three flavors:

- `List<?>` — the **unbounded wildcard**: a list of some unknown type.
- `List<? extends Number>` — an **upper-bounded wildcard**: a list whose element type is `Number` *or any subtype* (Integer, Double, Long, ...).
- `List<? super Integer>` — a **lower-bounded wildcard**: a list whose element type is `Integer` *or any supertype* (Number, Object).

The direction of the bound encodes what you are allowed to do: extends gives you safe *reading* (producing values), super gives you safe *writing* (consuming values). This asymmetry is captured in the famous mnemonic: **PECS — Producer extends, Consumer super.**

## Reading from a List<? extends Number>

Let's look at the classic case — a method that reads numbers and computes a total:

```java
import java.util.List;
import java.util.Arrays;

public class WildcardsDemo {

    // Accepts a list of Number, or any list whose elements are a
    // subtype of Number: List<Integer>, List<Double>, List<Long>, ...
    public static double sum(List<? extends Number> numbers) {
        double total = 0.0;
        // We can safely READ from the list. Every element is
        // guaranteed to be a Number (or a subtype), so the compiler
        // lets us call Number's methods on each element.
        for (Number n : numbers) {
            total += n.doubleValue();
        }
        return total;
    }

    public static void main(String[] args) {
        List<Integer> ints = Arrays.asList(1, 2, 3, 4);
        List<Double> dbls = Arrays.asList(1.5, 2.5);

        System.out.println(sum(ints));  // 10.0 — List<Integer> accepted!
        System.out.println(sum(dbls));  // 4.0  — List<Double> accepted!
    }
}
```

**Walking through it:** the parameter type `List<? extends Number>` promises the compiler: "this list's elements are at least Numbers." From that promise, reading is safe — every element you pull out can be treated as a `Number`, and you can call `doubleValue()`. Since `Integer`, `Double`, and friends all extend `Number`, any of their lists match. This is called **covariance**: the type relationship flows in the same direction as the subtype relationship.

**But what about writing?** Inside `sum`, try `numbers.add(3.14)` — compile error. Here's the subtle reason: the list could actually be a `List<Integer>`. Adding a `Double` into a list of `Integer`s would corrupt it. The compiler doesn't know the *real* element type — it only knows the bound — so it must forbid all additions except `null`. This is the safety trade-off of `? extends`: you can read freely, but you cannot write.

## Writing to a List<? super Integer>

The mirror image: a method that *fills* a list. Suppose you want to add several `Integer` values to a list:

```java
import java.util.List;
import java.util.ArrayList;

public class SuperDemo {

    // Accepts a list that can hold Integer: List<Integer>, List<Number>,
    // or List<Object>. The list must be able to CONSUME integers.
    public static void fill(List<? super Integer> sink) {
        // Safe: wherever the list's element type is, it is a supertype
        // of Integer, so an Integer is always a valid element.
        sink.add(10);
        sink.add(20);
        sink.add(30);
    }

    public static void main(String[] args) {
        List<Object> objects = new ArrayList<>();
        List<Number> numbers = new ArrayList<>();
        List<Integer> integers = new ArrayList<>();

        fill(objects);   // legal — Object can hold Integer
        fill(numbers);   // legal — Number can hold Integer
        fill(integers);  // legal — Integer can hold Integer

        System.out.println(numbers); // [10, 20, 30]
    }
}
```

**Walking through it:** `? super Integer` promises the compiler: "this list's element type is `Integer` or something more general." A more general type can always accept an `Integer` — that's the essence of inheritance. So writing `Integer`s is guaranteed safe. This is called **contravariance**: the acceptable types flow in the opposite direction of the subtype relationship.

**What about reading?** `Integer x = sink.get(0);` — compile error. The list might be a `List<Object>`; what comes out could be a `String` or anything. The compiler knows only that elements are *at least* `Integer`-compatible going in — it cannot promise what comes out. The only safe read is `Object`, since every reference type is an `Object`.

So the symmetry is complete:

| Wildcard | Safe operation | Why |
|---|---|---|
| `? extends Number` | read as `Number` | every element is a Number |
| `? super Integer` | write `Integer`s | the list can hold anything Integer-compatible |
| `?` (unbounded) | read as `Object`, test null | no information at all |

## The Unbounded Wildcard: List<?>

`List<?>` means a list of *some* unknown type. Use it when the operation works regardless of element type — for example, `size()`, `isEmpty()`, or `contains(null)`. It's also the type you get back from generic APIs that don't know what they hold. You can read elements only as `Object`, and you can add only `null`. If a method doesn't care about element type at all, `List<?>` is more honest than `List<Object>` — and it accepts every list, whereas `List<Object>` accepts only `List<Object>`.

## Where Does PECS Come From in Real APIs?

You have been using PECS every day without realizing it:

- `Collections.max(Collection<? extends T>)` — it produces a `T`, so it needs the *extends* bound.
- `Collections.copy(List<? super T> dest, List<? extends T> src)` — it writes into `dest` (super) and reads from `src` (extends).
- `Collections.addAll(Collection<? super T> c, T... elements)` — it adds to `c`, so `c` is a consumer: super.
- `Comparator.comparing(Function<? super T, ? extends U>)` — the function reads `T`s (so T is produced: extends) and returns `U`s which the comparator consumes (so U is consumed: super).

Reading signatures with PECS in mind turns cryptic API types into plain English: "this parameter must be able to give me values" or "this parameter must be able to take values."

## Common Beginner Confusions

- **`List<? extends Object>` is not the same as `List<?>`.** Functionally they're near-identical (everything extends Object), but `?` is cleaner and is what you should write. They are different types to the compiler.

- **Wildcards are not type parameters.** `?` can only appear where a type *argument* goes: `List<?>` is fine, but `class Foo<?>` and `void m(? x)` are illegal. Only `T`, `E`, etc. can be declared.

- **`? extends` on a method parameter does not make the method return a more specific type.** `List<? extends Number>` still gives you `Number` elements when you read, not the concrete subtype. If you need the *exact* type back, you need a generic method with a type parameter (`<T> T first(List<T> list)`), which we cover next.

## Recap

Wildcards exist to let one method serve many instantiations while preserving safety. The rule to memorize: **PECS — Producer extends, Consumer super.** If your code only reads values from a structure, bound with `extends`; if it only writes values, bound with `super`; if it does neither, use `?`. Whenever the compiler rejects a wildcard use, ask yourself which direction the data flows — the answer will tell you which bound you actually need, and the error message will make sense instead of feeling like a wall.
