---
title: Generics & Type Safety
summary: Generic classes and methods, wildcards and PECS, and why raw types are banned.
order: 7
minutes: 14
topics: [generics, wildcards, pecs, type-erasure]
docs:
  - https://docs.oracle.com/javase/tutorial/java/generics/
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/package-summary.html
---

# Generics & Type Safety

## Why generics exist

Generics move type checking from runtime to **compile time**:

```java
// WITHOUT generics — cast at runtime, ClassCastException waiting to happen
List raw = new ArrayList();
raw.add("hello");
Integer i = (Integer) raw.get(0);   // boom

// WITH generics — the compiler prevents the mistake
List<Integer> numbers = new ArrayList<>();
numbers.add("hello");               // does not compile
```

## Generic classes and methods

```java
public class Page<T> {
    private final List<T> items;
    private final long total;
    public Page(List<T> items, long total) { this.items = items; this.total = total; }
    public List<T> items() { return items; }
    public long total() { return total; }
}

Page<Account> page = new Page<>(List.of(account), 1);
```

Generic **method** with a bound:

```java
public static <T extends Comparable<? super T>> T max(List<T> list) {
    T best = list.get(0);
    for (T item : list) if (item.compareTo(best) > 0) best = item;
    return best;
}
```

`<T extends Comparable<? super T>>` reads as: "T is a type whose natural ordering compares itself or a supertype of itself" — it lets `max` work on `String`, `Integer`, and subclasses.

## Wildcards and PECS

`List<?>` means "some list of some type". Two practical wildcards:

```java
// PRODUCER EXTENDS — you READ from it: List<? extends Number>
public static double sum(List<? extends Number> producer) {
    double t = 0;
    for (Number n : producer) if (n.doubleValue() > 0) t += n.doubleValue();
    return t;                     // producer.add(...) won't compile — good!
}

// CONSUMER SUPER — you WRITE into it: List<? super Integer>
public static void fill(List<? super Integer> consumer) {
    for (int i = 0; i < 10; i++) consumer.add(i);
}
```

**PECS**: *Producer Extends, Consumer Super*. If the collection gives you values, use `extends`; if you put values into it, use `super`.

## Type erasure: what the runtime sees

```java
List<String> a = new ArrayList<>();
List<Integer> b = new ArrayList<>();
a.getClass() == b.getClass();   // true! both are ArrayList at runtime
```

Generics are a **compile-time** feature — the JVM erases them. Consequences:

- You cannot `new T()` or `new T[]` inside a generic class.
- `instanceof List<String>` is illegal; use `instanceof List<?>`.
- Raw types (`List` without a parameter) compile but disable all checks — **banned** in code review.

> **Why it matters (organizational view)** — Generics are how Spring Data gives you typed repositories (`JpaRepository<Account, Long>`) and how the Streams/Collectors APIs stay safe. Code-review rules — "no raw types, no casts, PECS on public generic APIs" — keep the compile-time safety the team paid for.

## Key takeaways

- Generics: compile-time safety, runtime erasure.
- `extends` = producer (read), `super` = consumer (write) — PECS.
- No raw types, no unchecked casts without justification.
- `?` wildcards open up APIs that would otherwise be too rigid.

**Official docs:** [Generics tutorial](https://docs.oracle.com/javase/tutorial/java/generics/) · [java.util.function](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/function/package-summary.html)
