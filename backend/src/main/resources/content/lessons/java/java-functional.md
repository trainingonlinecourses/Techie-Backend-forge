---
title: Lambdas & Functional Interfaces
summary: The core functional interfaces, method references, and composition — the vocabulary of the Streams API.
order: 8
minutes: 14
topics: [lambdas, functional-interfaces, method-references]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/package-summary.html
---

# Lambdas & Functional Interfaces

## What a lambda is

A lambda is an implementation of a **functional interface** — an interface with exactly one abstract method:

```java
// Predicate<T>:  T -> boolean
Predicate<Txn> isLarge = tx -> tx.amountCents() > 1_000_000;

// Function<T,R>: T -> R
Function<Txn, String> id = Txn::id;

// Consumer<T>:   T -> void
Consumer<Txn> audit = tx -> auditLog.write(tx);

// Supplier<T>:   () -> T
Supplier<UUID> newId = UUID::randomUUID;

// UnaryOperator<T>: T -> T
UnaryOperator<String> trim = String::trim;

// BinaryOperator<T>: (T,T) -> T
BinaryOperator<Long> sum = Long::sum;

// BiFunction<T,U,R>, BiPredicate, IntFunction, ToLongFunction ... dozens more
```

## Method references: four kinds

```java
// static method        Class::staticMethod
Comparator<Integer> c1 = Integer::compare;

// instance method of a type   Class::instanceMethod
Function<String, Integer> len = String::length;

// instance method of an object   object::instanceMethod
Function<String, Boolean> starts = email::startsWith;   // (a) -> email.startsWith(a)

// constructor          Class::new
Supplier<ArrayList<String>> maker = ArrayList::new;
```

## Composition

```java
Predicate<Txn> bigDone = isLarge.and(tx -> tx.status() == Status.COMPLETED);
Predicate<Txn> notDone = bigDone.negate();

Function<Txn, String> report = Txn::id.andThen(id -> "TX-" + id);
Function<Txn, Txn> auditAndPass = t -> { audit.accept(t); return t; };  // peek-style
```

## Capturing variables: effectively final

```java
double threshold = 1_000_000;                 // effectively final
Predicate<Txn> big = tx -> tx.amountCents() > threshold;
// threshold++ would NOT compile — lambdas capture final values only
```

> **Why it matters (organizational view)** — Lambdas are how modern Java expresses policy without ceremony: `list.removeIf(predicate)`, `repository.findAll(specification)`, `CompletableFuture.supplyAsync(supplier)`. Teams that standardize on the `java.util.function` vocabulary write APIs that are composable and testable — a `Predicate<Txn>` is trivial to unit test, unlike an if/else buried in a method.

## Key takeaways

- Learn the big five: `Predicate`, `Function`, `Consumer`, `Supplier`, `Operator`s.
- Method references are more readable than inline lambdas when they fit.
- Compose with `and` / `or` / `andThen` / `compose` instead of nesting ifs.
- Captured variables must be effectively final.

**Official docs:** [Lambda expressions](https://docs.oracle.com/javase/tutorial/java/javaOO/lambdaexpressions.html) · [java.util.function](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/package-summary.html)
