---
title: Method References — Lambdas Made Even Shorter
summary: The four kinds of method references, when to use each, how they relate to lambdas, and how organizations use them for cleaner code.
order: 5
minutes: 15
topics: [method-references, constructor-reference, static-method, instance-method, java8]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/methodreferences.html
---

## The Concept, From Zero

Method references are shorthand for lambdas that simply call an existing method. If a lambda body does nothing but invoke a method, you can replace it with a method reference:

```java
// Lambda
Function<String, Integer> parser = s -> Integer.parseInt(s);

// Method reference — same thing, shorter
Function<String, Integer> parser = Integer::parseInt;
```

**The four kinds:**

| Kind | Syntax | Equivalent Lambda | Example |
|------|--------|-------------------|---------|
| Static method | `ClassName::staticMethod` | `(args) -> ClassName.staticMethod(args)` | `Integer::parseInt` |
| Instance method of a particular object | `object::instanceMethod` | `(args) -> object.instanceMethod(args)` | `System.out::println` |
| Instance method of an arbitrary object | `ClassName::instanceMethod` | `(first, rest) -> first.instanceMethod(rest)` | `String::toUpperCase` |
| Constructor | `ClassName::new` | `() -> new ClassName()` | `ArrayList::new` |

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.function.*;
import java.util.stream.*;

public class MethodRefDemo {
    public static void main(String[] args) {
        List<String> names = List.of("Charlie", "Alice", "Bob", "Eve", "David");

        // --- Kind 1: Static method reference ---
        // Lambda: s -> Integer.parseInt(s)
        // Method ref: Integer::parseInt
        Function<String, Integer> toInt = Integer::parseInt;
        // Parses "42" to 42

        // --- Kind 2: Instance method of a particular object ---
        // Lambda: s -> System.out.println(s)
        // Method ref: System.out::println
        names.forEach(System.out::println);
        // Prints each name — System.out is the particular object

        // --- Kind 3: Instance method of an arbitrary object ---
        // Lambda: s -> s.toUpperCase()
        // Method ref: String::toUpperCase
        List<String> upper = names.stream()
            .map(String::toUpperCase)     // String is the class, toUpperCase is the method
            .toList();
        // ["CHARLIE", "ALICE", "BOB", "EVE", "DAVID"]

        // Sort using method reference
        List<String> sorted = names.stream()
            .sorted(String::compareToIgnoreCase)   // (a, b) -> a.compareToIgnoreCase(b)
            .toList();

        // --- Kind 4: Constructor reference ---
        // Lambda: () -> new ArrayList<String>()
        // Method ref: ArrayList::new
        Supplier<List<String>> listFactory = ArrayList::new;
        List<String> newList = listFactory.get();

        // With streams: collect to a specific collection type
        Set<String> nameSet = names.stream()
            .filter(n -> n.length() > 3)
            .collect(Collectors.toCollection(TreeSet::new));  // TreeSet constructor reference
        // ["Alice", "Charlie", "David"] — sorted alphabetically in a TreeSet

        // --- Combining kinds in a pipeline ---
        Map<String, Integer> nameLengths = names.stream()
            .collect(Collectors.toMap(
                Function.identity(),    // static method reference
                String::length          // instance method of arbitrary object
            ));
        // {Alice=5, Bob=3, Charlie=7, David=5, Eve=3}
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Configuring Spring beans

```java
@Configuration
public class AppConfig {
    // Method references as bean factories
    @Bean
    public Supplier<RestTemplate> restTemplateFactory() {
        return RestTemplate::new;  // constructor reference
    }

    @Bean
    public Function<String, CompletableFuture<User>> userFetcher() {
        return userService::findByNameAsync;  // instance method reference
    }
}
```

### Scenario 2: Event handler registration

```java
Map<String, Consumer<OrderEvent>> handlers = Map.of(
    "CREATED",  orderNotificationService::sendConfirmation,
    "SHIPPED",  trackingService::updateTracking,
    "CANCELLED", refundService::processRefund
);
```

---

## When to Use Method References vs Lambdas

**Use method reference when:**
- Lambda body is a single method call
- The method name makes the code readable

**Use lambda when:**
- You need to combine multiple operations
- The method reference would be unclear
- You need to add parameters or logic

```java
// Method reference — clear
list.forEach(System.out::println);

// Lambda — clearer than a method reference
list.forEach(name -> System.out.println("User: " + name));

// Lambda — method reference would be obscure
list.stream().filter(name -> name.length() > 5 && name.startsWith("A"))
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `::` with overloaded methods | Ambiguity | Use lambda when method is overloaded |
| Overusing constructor references | Less readable | Use when creating new instances in a pipeline |
| Forgetting `this` context | `this::method` binds to current instance | Understand the binding |
