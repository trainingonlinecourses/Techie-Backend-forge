---
title: Varargs, Method Overloading & Overriding — Signatures That Work
summary: How varargs desugar, the overload resolution rules, @Override discipline, and the signature-design patterns that keep APIs clean and bug-free.
order: 32
minutes: 18
topics: [varargs, overloading, overriding, method-signature, overload-resolution, @Override]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/arguments.html
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.4.9
---

# Varargs, Method Overloading & Overriding — Signatures That Work

## The concept: three signature tools

**Varargs** (`String... args`) lets a method take a variable number of arguments. Under the hood it's **exactly an array parameter** — `f(String... a)` compiles to `f(String[] a)` — with the compiler wrapping call-site arguments:

```java
public static void log(String fmt, Object... args) {
    // args is an Object[] — may be empty, never null unless explicitly passed null
}
log("hello");                 // args = []
log("a=%s", 1);               // args = [1]
log("x=%s", 1, "two", 3.0);   // args = [1, "two", 3.0]
log("y=%s", new Object[]{5}); // explicit array also works
```

**Overloading** — several methods with the same name but different parameter lists, resolved at compile time. **Overriding** — a subclass re-implements a parent method with the same signature, resolved at runtime (polymorphism).

## The overload resolution rules (in order)

When you call an overloaded method, the compiler picks the **most specific** applicable signature:

1. Exact match wins over widening; widening beats boxing; boxing beats varargs.
2. Among widening options, the narrowest wins (`int` param beats `long` for an `int` arg).
3. Varargs is the last resort — only when nothing else applies.

```java
void f(int x) {}
void f(long x) {}
void f(Integer x) {}
void f(Object... xs) {}

f(5);        // int — exact match
f(5L);       // long — exact
f(null);     // Integer — boxing (more specific than Object...); beware null-ambiguity!
```

**The null-ambiguity trap:** calling `f(null)` with both `f(String)` and `f(Integer)` overloads is a **compile error** ("ambiguous") because both are equally specific. It's a design smell — avoid null-passing overloads that collide.

## How we use it in an organization: the scenarios

**Scenario 1 — varargs for logging and formatting.** `String.format`, `Logger` params, and `MessageFormat` are the canonical varargs APIs. Teams wrap them:

```java
public final class AppLog {
    private static final Logger LOG = LoggerFactory.getLogger(AppLog.class);
    public static void warn(String fmt, Object... args) {
        if (LOG.isWarnEnabled()) LOG.warn(fmt, args);   // varargs → SLF4J varargs
    }
}
```

**Scenario 2 — overloads as defaults.** A method with a defaulted parameter as an overload chain (the "convenience overloads" pattern):

```java
public List<Order> search(String query) { return search(query, 20, Sort.DEFAULT); }
public List<Order> search(String query, int limit) { return search(query, limit, Sort.DEFAULT); }
public List<Order> search(String query, int limit, Sort sort) { /* real implementation */ }
```

Keep the *full* signature as the single implementation; shorter overloads delegate. Review rule: **don't duplicate logic across overloads — chain to the richest one.**

**Scenario 3 — builder-style fluent APIs.** Varargs shines for "any number of" semantics in builders and configuration:

```java
new SearchSpec().sortBy("createdAt", "status")     // sortBy(String... fields)
```

**Scenario 4 — overriding with @Override always.** The annotation is mandatory in review: it turns a typo'd override (silently a new method) into a compile error, and it documents intent:

```java
@Override
public boolean equals(Object o) { ... }   // typo in signature → compile error, not a silent bug
```

## Overloading vs overriding — the confusion that causes bugs

- **Overloading is compile-time** — the compiler picks the method by the *declared* type of the argument.
- **Overriding is runtime** — the JVM dispatches by the *actual* type of the receiver.

```java
class A { void f(A a) {} void f(B b) {} }        // overloads
class B extends A { @Override void f(A a) {} }   // overrides the f(A) overload

A x = new B();
x.f(new B());   // resolves f(B) at compile time (x is declared A) → A.f(B), NOT overridden
```

This is the classic source of "I overrode it but the wrong method ran" bugs: overload resolution uses the *static* type. If dispatch-by-actual-type matters, the methods must have the *same* signature (true overriding).

## Pitfalls

- **Varargs with a trailing array argument** — `void f(Object... args)` can swallow a single array argument ambiguously; be explicit when the last arg is itself an array.
- **Calling varargs with `null`** — `f(null)` passes a *null array*, not an empty one; a method that assumes `args.length > 0` NPEs. Handle `null` or document it.
- **`@Override` missing** — silent new methods instead of overrides; the review checklist always includes it.
- **Overloads with ambiguous null calls** — compile errors that puzzle beginners; design to avoid.
- **Varargs and generics mismatch** — `f(T... ts)` with a generic array creates unchecked warnings (heap pollution risk). Prefer `List<T>` for generic varargs APIs.

## Key takeaways

- Varargs desugar to arrays — use for variable-arity formatting/logging/configuration APIs.
- Overload resolution: exact → widening → boxing → varargs; the most specific wins.
- Overriding is runtime dispatch by actual type; overloading is compile-time by declared type — never mix them up.
- Chain convenience overloads to one full implementation; don't duplicate logic.
- Always `@Override`; watch null-ambiguity and generic-array varargs.
