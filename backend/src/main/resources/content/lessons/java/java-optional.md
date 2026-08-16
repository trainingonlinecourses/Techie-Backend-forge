---
title: Optional & Null Safety
summary: Using Optional as a return type, chaining safe operations, and the rules that kill NullPointerException at the door.
order: 10
minutes: 12
topics: [optional, null-safety, functional]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html
---

# Optional & Null Safety

## The core rule

**Optional is a return type only.** Never: a field, a method parameter, an element in a collection, or `null` inside. If a method may return nothing, declare `Optional<T>`; the caller is then *forced* to handle both cases.

```java
public Optional<Customer> findByEmail(String email) {
    return customers.stream()
            .filter(c -> c.email().equals(email))
            .findFirst();
}
```

## The chain of safe operations

```java
Customer c = findByEmail(email)
    .filter(Customer::isActive)                       // empty if inactive
    .orElseThrow(() -> new CustomerNotFoundException(email));

String city = c.address()            // Optional<Address>
    .map(Address::city)              // Optional<String>
    .orElse("Unknown");

// orElseGet is lazy (cheap default) vs orElse (always evaluated)
String region = c.country().orElseGet(GeoService::defaultRegion);
```

## The full API in one view

```java
// building
Optional<String> o = Optional.of(value);        // throws if value null
Optional<String> o2 = Optional.ofNullable(v);   // empty if v null
Optional<String> o3 = Optional.empty();

// reading
o.isPresent(); o.isEmpty();
o.get();                      // only after isPresent — prefer alternatives
o.orElse(default);
o.orElseGet(Supplier);
o.orElseThrow(Supplier::new);
o.ifPresent(v -> use(v));

// transforming (functional — the interesting ones)
o.map(fn);          // Optional<R>          — like Stream.map
o.flatMap(fn);      // Optional<R> from fn  — for nested Optionals
o.filter(pred);     // Optional<T>
o.stream();         // Stream<T> (0 or 1)   — join with other streams
```

## Nested Optionals: flatMap

```java
record Customer(String id, Optional<Account> account) {}

Optional<Account> primary = customers.find(customerId)
        .flatMap(Customer::account);    // NOT .map — that gives Optional<Optional<Account>>
```

## Interop with streams

```java
// find first match across many optionals
Optional<Txn> first = txns.stream()
        .map(Txn::refund)
        .flatMap(Optional::stream)
        .findFirst();
```

> **Why it matters (organizational view)** — "Who made this null?" is the #1 debugging question in Java. Organizations kill whole bug classes with three rules: (1) never return `null` from a method — return `Optional` or throw; (2) never pass `null` as an argument — use overloads or small value objects; (3) `@Nullable`/`@NonNull` annotations on public APIs so the IDE + static analysis enforce (1) and (2). Spring Boot 3 + Hibernate Validator carry this further with bean validation at the API boundary.

## Key takeaways

- `Optional` as return type only; never nulls inside.
- `map`/`flatMap`/`filter` chain like streams; `orElseThrow` for required values.
- Prefer `orElseGet` when the default is expensive.
- Pair with `@Nullable`/`@NonNull` on public API signatures.

**Official docs:** [Optional API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html)
