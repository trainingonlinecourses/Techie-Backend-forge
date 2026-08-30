---
title: Functional Interfaces — The Contracts Behind Lambdas
summary: What functional interfaces are, @FunctionalInterface, the java.util.function package, creating custom ones, and how they power the entire Streams API.
order: 4
minutes: 25
topics: [functional-interface, @functionalinterface, predicate, consumer, supplier, function, java8]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/function/package-summary.html
---

## The Concept, From Zero

A **functional interface** is an interface with exactly **one abstract method** (SAM — Single Abstract Method). This is what makes lambdas work in Java — a lambda expression is simply a concise implementation of a functional interface.

```java
// This is a functional interface — one abstract method
@FunctionalInterface
public interface StringProcessor {
    String process(String input);  // exactly one abstract method
}

// Lambda implements the functional interface
StringProcessor upper = s -> s.toUpperCase();
StringProcessor trim = s -> s.trim();
String result = upper.process("hello");  // "HELLO"
```

**Why not just use interfaces with default methods?** Java 8 added default methods to interfaces. But a functional interface has exactly ONE abstract method — default methods don't count.

---

## The java.util.function Package

Java 8 provides a library of built-in functional interfaces. Learn these — they cover 90% of use cases:

### Predicate<T> — Tests a condition (T -> boolean)
```java
Predicate<String> isLong = s -> s.length() > 10;
Predicate<Integer> isEven = n -> n % 2 == 0;

// Combining predicates
Predicate<String> isLongAndContainsA = isLong.and(s -> s.contains("a"));
Predicate<String> isLongOrContainsA = isLong.or(s -> s.contains("a"));
Predicate<String> isNotLong = isLong.negate();
```

### Consumer<T> — Performs an action (T -> void)
```java
Consumer<String> printer = System.out::println;
Consumer<String> logger = msg -> log.info("Message: {}", msg);

// Chaining consumers
Consumer<String> printAndLog = printer.andThen(logger);
printAndLog.accept("Hello");  // prints "Hello" then logs it
```

### Supplier<T> — Produces a value (() -> T)
```java
Supplier<List<String>> listFactory = ArrayList::new;
Supplier<LocalDateTime> timestamp = LocalDateTime::now;

// Lazy initialization
Supplier<ExpensiveObject> lazy = () -> new ExpensiveObject();
// Object is only created when .get() is called
ExpensiveObject obj = lazy.get();
```

### Function<T,R> — Transforms a value (T -> R)
```java
Function<String, Integer> toLength = String::length;
Function<Employee, String> getName = Employee::getName;

// Composition
Function<String, String> trim = String::trim;
Function<String, String> upper = String::toUpperCase;
Function<String, String> trimAndUpper = trim.andThen(upper);
// trimAndUpper.apply("  hello  ") -> "HELLO"

Function<String, Integer> parse = Integer::parseInt;
Function<Integer, String> backToString = Object::toString;
Function<String, String> roundTrip = parse.andThen(backToString);
```

### UnaryOperator<T> — Transforms same type (T -> T)
```java
UnaryOperator<String> toUpper = String::toUpperCase;
UnaryOperator<List<String>> sort = list -> {
    list.sort(Comparator.naturalOrder());
    return list;
};
```

### BinaryOperator<T> — Combines two values ((T,T) -> T)
```java
BinaryOperator<Integer> add = Integer::sum;
BinaryOperator<String> concat = (a, b) -> a + b;

// Useful with reduce
int total = numbers.stream().reduce(0, Integer::sum);
```

---

## Line-by-Line Walkthrough

```java
import java.util.function.*;
import java.util.*;

public class FunctionalInterfaceDemo {
    // Line 1: Define a custom functional interface
    @FunctionalInterface
    interface RetryPolicy {
        boolean shouldRetry(int attempt, Exception cause);
        // Only one abstract method allowed
    }

    // Line 2: Define a transformation pipeline interface
    @FunctionalInterface
    interface Transformer<I, O> {
        O transform(I input);

        // Default methods are fine — they don't count as abstract methods
        default Transformer<I, O> andThen(Transformer<O, ?> after) {
            return input -> after.transform(this.transform(input));
        }
    }

    public static void main(String[] args) {
        // Line 3: Use Predicate for filtering
        List<String> names = List.of("Alice", "Bob", "Charlie", "David", "Eve");

        Predicate<String> startsWithA = name -> name.startsWith("A");
        Predicate<String> longerThan3 = name -> name.length() > 3;

        List<String> result = names.stream()
            .filter(startsWithA.or(longerThan3))    // Combine predicates
            .toList();
        // ["Alice", "Charlie", "David"] — "Bob" and "Eve" filtered out

        // Line 4: Use Function for mapping
        Function<String, Integer> nameLength = String::length;
        Map<String, Integer> nameLengths = names.stream()
            .collect(java.util.stream.Collectors.toMap(
                Function.identity(),    // key: the string itself
                nameLength              // value: its length
            ));
        // {Alice=5, Bob=3, Charlie=7, David=5, Eve=3}

        // Line 5: Use Supplier for lazy creation
        Supplier<Map<String, List<String>>> cacheFactory = HashMap::new;
        Map<String, List<String>> cache = cacheFactory.get();
        // Map created only when needed

        // Line 6: Use Consumer for side effects
        Consumer<String> auditLog = action ->
            System.out.println("[AUDIT] " + java.time.Instant.now() + " - " + action);

        auditLog.accept("User login");
        // [AUDIT] 2024-01-15T10:30:00Z - User login

        // Line 7: Custom retry policy using our functional interface
        RetryPolicy retryOnConnectionError = (attempt, cause) ->
            cause.getMessage().contains("Connection") && attempt < 3;

        boolean shouldRetry = retryOnConnectionError.shouldRetry(2,
            new RuntimeException("Connection refused"));
        // true — it's a connection error and attempt < 3
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Strategy pattern with functional interfaces

```java
// Instead of creating a class hierarchy for pricing strategies
public interface PricingStrategy {
    double calculatePrice(Order order);
}

// Use functional interfaces directly
Map<String, Function<Order, Double>> pricingStrategies = Map.of(
    "STANDARD",  order -> order.basePrice(),
    "PREMIUM",   order -> order.basePrice() * 0.9,       // 10% discount
    "BULK",      order -> order.basePrice() * 0.75        // 25% discount
);

public double getPrice(Order order, String tier) {
    Function<Order, Double> strategy = pricingStrategies.get(tier);
    return strategy.apply(order);
}
```

### Scenario 2: Configurable validation

```java
public class ValidationBuilder<T> {
    private final List<Predicate<T>> checks = new ArrayList<>();
    private final List<String> messages = new ArrayList<>();

    public ValidationBuilder<T> check(Predicate<T> condition, String message) {
        checks.add(condition);
        messages.add(message);
        return this;
    }

    public List<String> validate(T value) {
        List<String> errors = new ArrayList<>();
        for (int i = 0; i < checks.size(); i++) {
            if (!checks.get(i).test(value)) {
                errors.add(messages.get(i));
            }
        }
        return errors;
    }
}

// Usage
var validator = new ValidationBuilder<User>()
    .check(u -> u.name() != null, "Name is required")
    .check(u -> u.age() >= 18, "Must be at least 18")
    .check(u -> u.email().contains("@"), "Invalid email");

List<String> errors = validator.validate(user);
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Multiple abstract methods | Not a functional interface | Ensure exactly one abstract method |
| Confusing Function and Supplier | Function takes arg, Supplier doesn't | `Function<T,R>` vs `Supplier<T>` |
| Forgetting composition | Writing nested lambdas | Use `.andThen()` / `.compose()` |
| Boxing overhead | `Function<Integer, Integer>` uses autoboxing | Use `IntFunction`, `IntUnaryOperator` for primitives |
