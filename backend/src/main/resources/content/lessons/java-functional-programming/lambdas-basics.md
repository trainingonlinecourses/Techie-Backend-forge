---
title: Lambda Expressions — Passing Behavior as Data
module: java-functional-programming
order: 1
minutes: 26
topics: ["lambdas", "anonymous classes", "behavior passing", "syntax", "effectively final"]
docs:
  - title: "Lambda expressions (Java tutorial)"
    url: "https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html"
summary: Imagine a cooking show. The host doesn't tell you exactly how to chop every vegetable each episode — she says "and now, chop the onions" and hands ...
---

# Lambda Expressions — Passing Behavior as Data

## The Concept: What If a Method Could Take a "To-Do List"?

Imagine a cooking show. The host doesn't tell you *exactly* how to chop every vegetable each episode — she says "and now, **chop** the onions" and hands the *task* to whoever's in the kitchen. In older Java, you couldn't hand a task to a method — you could only hand it *data*: numbers, strings, objects. To get flexible behavior you had to create a whole object whose only job was to wrap one method (an *anonymous class*), which was verbose and noisy.

**Lambda expressions** are Java's way of passing **behavior** (a small piece of code) as a value — like passing a function. Instead of writing a 6-line anonymous class to say "sort by name", you write one line:

```java
// Old way — an anonymous class that implements Comparator
names.sort(new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        return a.compareTo(b);
    }
});

// Lambda way — just the behavior
names.sort((a, b) -> a.compareTo(b));
```

Same meaning, radically less ceremony. The lambda `(a, b) -> a.compareTo(b)` *is* the comparator's logic, delivered without the wrapper class boilerplate.

## The Lambda Syntax

A lambda has three parts:

```
(parameters)  ->  body
```

| Part | Example |
|---|---|
| Parameters | `(a, b)` — types optional (inferred) |
| Arrow | `->` |
| Body | `a.compareTo(b)` (expression) or `{ ... }` (block) |

Rules:

- **One parameter**: parentheses optional — `x -> x * 2`.
- **Zero parameters**: empty parens required — `() -> System.out.println("hi")`.
- **Expression body**: no `return` keyword — the expression's value is returned: `x -> x + 1`.
- **Block body**: needs braces and `return` — `(x, y) -> { int s = x + y; return s; }`.

## What Is a Lambda Under the Hood?

A lambda is *not* a new kind of object you can inspect — it's a **compact implementation of a functional interface** (an interface with exactly one abstract method; covered next lesson). The compiler figures out which interface the lambda implements from context and generates the implementation — often more efficiently than an anonymous class (no separate `.class` file per lambda). You can think of it as: **lambda = the single method's body, delivered without the class ceremony.**

## The Code Walkthrough

```java
import java.util.*;
import java.util.function.*;

public class LambdaDemo {

    public static void main(String[] args) {
        List<String> names = new ArrayList<>(List.of("Sateesh", "Aisha", "Bob", "Chen"));

        // 1. Sort with a lambda (Comparator)
        names.sort((a, b) -> a.length() - b.length());      // shortest first

        // 2. Filter with a lambda (Predicate)
        names.removeIf(name -> name.length() < 4);          // drop short names

        // 3. Transform each element (Function)
        names.replaceAll(name -> name.toUpperCase());

        // 4. Iterate (Consumer)
        names.forEach(name -> System.out.println("Hello, " + name));

        // 5. Lambdas capture surrounding variables (effectively final)
        String prefix = "Student: ";
        names.forEach(name -> System.out.println(prefix + name));
        // prefix must NOT be reassigned afterwards — that's "effectively final"
    }
}
```

### Walking Through Each Part

**Part 1 — sort.** `sort` expects a `Comparator<String>` (one abstract method: `compare`). The lambda `(a, b) -> a.length() - b.length()` supplies it: negative means `a` first, positive means `b` first, zero means equal. The subtraction idiom works for ints; for other types use `Integer.compare(...)` or `Comparator.comparing`.

**Part 2 — removeIf.** `removeIf` takes a `Predicate<String>` (one method: `test` → boolean). The lambda returns `true` for names shorter than 4, and those get removed in one pass. This is the *filter* concept: keep what matches, drop the rest.

**Part 3 — replaceAll.** `replaceAll` takes a `Function<String, String>` (one method: `apply`). Each element is replaced by the lambda's result — here, uppercased.

**Part 4 — forEach.** `forEach` takes a `Consumer<String>` (one method: `accept`, returns void). The lambda runs once per element — the modern replacement for the manual `for` loop when you just want to *do something* per item.

**Part 5 — capture.** A lambda can **read** variables from its enclosing scope — here `prefix`. The rule: the variable must be **effectively final** — not reassigned after the lambda sees it (you may assign once; just never *change* it afterwards). This rule exists because the lambda may run later, on another thread, and a changing captured variable would be a data race the language can't safely allow.

## When to Use a Lambda vs a Loop

```java
// Loop — fine when you need early exit, index, or mutation-heavy logic
for (String n : names) { if (n.length() > 3) total += n.length(); }

// Lambda/stream — expressive when you're transforming a collection
long total = names.stream().filter(n -> n.length() > 3).mapToLong(String::length).sum();
```

Neither is "always better". Loops win for: early `break`, `continue`, index access, exceptions with precise control. Lambdas/streams win for: filtering/mapping/collecting pipelines, passing behavior as a parameter, and avoiding mutable loop state. In later lessons you'll combine them with the Stream API.

## Common Beginner Pitfalls

1. **Reassigning a captured variable** — compile error ("variable used in lambda should be effectively final"). Copy to a new variable if you must change it.
2. **Forgetting the parameter types are optional** — `(String a, String b) -> ...` works but is redundant; let the compiler infer.
3. **Trying to use a lambda where the target isn't a functional interface** — e.g., passing a lambda to a method that takes `Object` won't compile cleanly; the context must declare a functional interface.
4. **`return` in an expression body** — `x -> return x+1` is wrong; just `x -> x + 1`.
5. **Block body without `return`** — if the body is `{ ... }` and the method returns a value, you need an explicit `return`.
6. **Mutating captured collections** — reading is fine; *mutating* a captured collection is legal but can surprise you if the lambda runs later or concurrently. Prefer immutable data.

## Key Takeaways

- A lambda passes *behavior* as a value — the body of a single abstract method, no class ceremony.
- Syntax: `(params) -> expression` or `(params) -> { statements }`.
- `sort`/`removeIf`/`replaceAll`/`forEach` are the everyday lambda consumers.
- Captured variables must be effectively final.
- Lambdas are the building block for the Stream API and functional interfaces (next lesson).
