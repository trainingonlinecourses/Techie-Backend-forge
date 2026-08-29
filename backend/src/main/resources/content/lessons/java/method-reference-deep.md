---
title: Method References — Lambdas That Just Point at Existing Code
summary: The four kinds of method references (static, bound, unbound, constructor), how the compiler translates them, and where organizations use them to make stream pipelines read like sentences.
order: 76
minutes: 18
topics: [method-reference, lambda, streams, constructor-reference, functional-programming]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/methodreferences.html
---

## The Concept, From Zero

A **method reference** is a shortcut: when a lambda does nothing but call one existing method, you can name that method instead of writing the lambda.

```java
// These two lines do EXACTLY the same thing:
Function<String, Integer> lenLambda = s -> s.length();   // lambda: take s, return s.length()
Function<String, Integer> lenRef    = String::length;    // reference: "the length method of String"
```

Read `::` as "refer to". No parentheses, no arguments listed — the compiler already knows what arguments to pass because the **target functional interface** defines them. `Function<String,Integer>` promises "give me a String, I'll give you an Integer", and `String::length` fits that shape perfectly.

Method references are not magic — they compile to lambdas under the hood. They exist for **readability**.

## The Four Kinds

### Kind 1 — Static method: `ClassName::staticMethod`

```java
Function<String, Integer> parser = Integer::parseInt;
// same as: s -> Integer.parseInt(s)

List<String> raw = List.of("42", "17", "99");
List<Integer> nums = raw.stream()
        .map(Integer::parseInt)     // each string flows into parseInt as its single argument
        .toList();
```

The stream hands each element as the argument. You write zero parameters — the pipeline shape supplies them.

### Kind 2 — Bound (instance of a specific object): `object::instanceMethod`

```java
String prefix = "ORDER-";
Function<String, String> tagger = prefix::concat;
// 'prefix' is a SPECIFIC object captured here
// same as: s -> prefix.concat(s)

tagger.apply("1001");   // "ORDER-1001"
```

"Bound" = bound to one particular receiver (`prefix`) fixed in advance.

### Kind 3 — Unbound (instance method of the parameter): `ClassName::instanceMethod`

```java
BiFunction<String, String, Boolean> contains = String::contains;
// same as: (haystack, needle) -> haystack.contains(needle)
// first parameter becomes the RECEIVER, the rest become arguments

Comparator<String> byLength = Comparator.comparing(String::length);
// same as comparing(s -> s.length())
```

This is the workhorse inside streams:

```java
List<String> names = people.stream()
        .map(Person::getName)       // unbound: each Person element is the receiver
        .sorted()                   // Comparable on the resulting strings
        .toList();
```

### Kind 4 — Constructor: `ClassName::new`

```java
Supplier<List<String>> listFactory = ArrayList::new;      // () -> new ArrayList<>()
Function<Integer, List<String>> sized   = ArrayList::new; // n -> new ArrayList<>(n)

// The classic map-to-object pattern:
List<String> emails = List.of("amy@x.com", "bob@y.com");
List<User> users = emails.stream()
        .map(User::new)             // compiler picks whichever User constructor matches
        .toList();                  // ...here: User(String email) exists → chosen
```

The compiler performs overload resolution against the functional interface's shape — `User::new` with a `Function<String,User>` target finds a one-String constructor automatically.

## Where Method References Shine in Real Pipelines

```java
Map<String, Long> ordersPerCity = orders.stream()
        .collect(Collectors.groupingBy(Order::getCity, Collectors.counting()));

Map<Long, Order> byId = orders.stream()
        .collect(Collectors.toMap(Order::getId, Function.identity()));
```

- `Order::getCity`, `Order::getId` — unbound references extracting keys.
- `Function.identity()` — the "no-op" function, itself effectively a method reference to itself.

## Real Organizational Scenarios

**Scenario 1 — Reporting pipelines.** A finance team builds every report as a chain like `.map(Invoice::getCustomer).filter(Customer::isActive).map(Customer::getEmail)` — business analysts who don't write Java can still read these pipelines aloud, which was the explicit goal when they standardized on method refs over verbose lambdas.

**Scenario 2 — DTO mapping layers.** Microservice teams convert entities to DTOs via constructor references: `.map(OrderDto::new)` with `OrderDto(Order entity)`. One-line mapping code, and the constructor holds all field-copying logic in one auditable place.

**Scenario 3 — Test data factories.** QA utilities register generators in maps: `Map<Class<?>, Supplier<Object>> factories = Map.of(User.class, User::new, Cart.class, Cart::new);` — adding support for a new type is one entry, no if-chains.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Trying `ClassName::instanceMethod` thinking it's static | Compile error | Unbound form needs the receiver as first parameter |
| Ambiguous overloads with `::new` | "Cannot resolve constructor" or surprising pick | Fall back to an explicit lambda naming types |
| Checked exceptions inside referenced methods | Streams can't throw IOException from map() | Wrap, or move I/O out of pipelines |
| Overusing refs where logic is nontrivial | Dense unreadable chains | Rule of thumb: only when it reads like English |
