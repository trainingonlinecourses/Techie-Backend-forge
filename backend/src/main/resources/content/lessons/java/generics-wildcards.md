---
title: Java Generics Wildcards — PECS and Bounded Types
summary: Unbounded wildcards, upper and lower bounds, the PECS rule, generic methods, type erasure pitfalls, and when to use wildcards vs type parameters in real code.
order: 51
minutes: 22
topics: [generics, wildcards, pecs, upper-bound, lower-bound, type-erasure, covariance, contravariance]
docs:
  - https://docs.oracle.com/javase/tutorial/java/generics/wildcards.html
  - https://docs.oracle.com/javase/tutorial/java/generics/index.html
---

# Java Generics Wildcards — PECS and Bounded Types

## The concept

Generics let you write classes and methods that work with any type while providing compile-time type safety. Wildcards (`?`) add flexibility by letting you express relationships between types — for example, "a list that accepts any subclass of Animal."

Without wildcards, this fails:

```java
List<Dog> dogs = new ArrayList<>();
List<Animal> animals = dogs;  // COMPILE ERROR — List<Dog> is NOT a List<Animal>
```

This is surprising but correct: a `List<Dog>` is NOT a `List<Animal>`. If it were, you could `add(new Cat())` to a `List<Dog>` — breaking type safety at runtime. Java generics are **invariant** — there is no inheritance relationship between generic types with different type arguments.

Wildcards solve this by expressing **flexibility** at the boundary:

```java
List<? extends Animal> animals = dogs;  // OK — read-only view
Animal a = animals.get(0);              // OK — we know it's at least an Animal
animals.add(new Cat());                 // COMPILE ERROR — compiler can't guarantee safety
```

## The three wildcard forms

### Unbounded wildcard: `?`

Accepts any type. Used when the type parameter is irrelevant:

```java
public static void printList(List<?> list) {
    for (Object item : list) {
        System.out.println(item);
    }
}

printList(List.of(1, 2, 3));        // OK
printList(List.of("a", "b", "c"));  // OK
printList(List.of(new Dog()));       // OK
```

### Upper-bounded: `? extends T`

The wildcard is **some subtype of T**. You can **read** T from it but cannot **write** to it:

```java
public static double sum(List<? extends Number> numbers) {
    double total = 0;
    for (Number n : numbers) {   // read as Number — safe
        total += n.doubleValue();
    }
    return total;
}

sum(List.of(1, 2, 3));              // List<Integer> — OK
sum(List.of(1.5, 2.5));            // List<Double> — OK
sum(List.of(BigDecimal.ONE));       // List<BigDecimal> — OK
```

### Lower-bounded: `? super T`

The wildcard is **some supertype of T**. You can **write** T to it but reading gives you only Object:

```java
public static void addNumbers(List<? super Integer> list) {
    list.add(1);          // OK — Integer is safe
    list.add(2);          // OK
    Integer n = list.get(0);  // COMPILE ERROR — list's element type is unknown
    Object n = list.get(0);   // OK — only Object is guaranteed
}

List<Number> numbers = new ArrayList<>();
addNumbers(numbers);     // OK — Number is a supertype of Integer
addNumbers(new ArrayList<Object>());  // OK — Object is a supertype of Integer
```

## The PECS Rule

**Producer Extends, Consumer Super.**

- If the generic type **produces** items (you read from it), use `? extends T`.
- If the generic type **consumes** items (you write to it), use `? super T`.
- If it does both, don't use a wildcard — use a concrete type parameter.

```java
// Copy from src (producer) to dest (consumer)
public static <T> void copy(List<? super T> dest, List<? extends T> src) {
    for (T item : src) {      // src produces T
        dest.add(item);       // dest consumes T
    }
}
```

## How we use it in organizations

### Scenario 1: API design with wildcards

A notification system that accepts any type of notification:

```java
public interface NotificationSender {
    // Producer: sends notifications, so extends
    void sendAll(List<? extends Notification> notifications);

    // Consumer: receives feedback, so super
    void registerHandlers(List<? super NotificationHandler> handlers);
}

public class EmailSender implements NotificationSender {
    @Override
    public void sendAll(List<? extends Notification> notifications) {
        for (Notification n : notifications) {  // safe to read as Notification
            sendEmail(n);
        }
    }

    @Override
    public void registerHandlers(List<? super NotificationHandler> handlers) {
        handlers.add(new BounceHandler());  // safe to add
        handlers.add(new SpamHandler());
    }
}
```

### Scenario 2: Generic repositories

```java
public interface ReadOnlyRepository<T, ID> {
    Optional<T> findById(ID id);
    List<T> findAll();
    List<? extends T> findByCriteria(Criteria criteria);  // may return subtypes
}

public interface Repository<T, ID> extends ReadOnlyRepository<T, ID> {
    <S extends T> S save(S entity);           // return the saved entity
    void deleteAll(List<? super T> entities); // accepts supertypes
}
```

### Scenario 3: Collections APIs

The `Collections.sort()` method uses wildcards:

```java
// From the JDK — you can sort any List whose elements implement Comparable
public static <T extends Comparable<? super T>> void sort(List<T> list) {
    // ...
}

// This works because String implements Comparable<String>,
// and String is a subtype of Comparable<? super String>
List<String> names = List.of("Charlie", "Alice", "Bob");
Collections.sort(names);  // OK
```

## Type erasure and wildcards

At runtime, all generic type information is erased. The JVM sees only `List` (raw type), not `List<String>`. Wildcards exist only at compile time:

```java
List<String> strings = new ArrayList<>();
List<Integer> integers = new ArrayList<>();

System.out.println(strings.getClass() == integers.getClass());  // true!
// Both are just ArrayList at runtime
```

This means you CANNOT do:
- `new T()` — T is erased, JVM doesn't know what T is
- `instanceof List<String>` — runtime can't check generic types
- `new List<?>[]` — array creation with wildcards fails

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `List` (raw type) instead of `List<?>` | Loses all type safety |
| Using `? extends T` when you need to write | Compile error |
| Not understanding PECS | Confusing compiler errors |
| `new T()` or `new T[]` | Compile error — type erasure |
| Ignoring that `List<Dog>` is not `List<Animal>` | Compile error when trying to assign |
| Using `?` when you should use `<T>` | Over-constrained or under-constrained APIs |
