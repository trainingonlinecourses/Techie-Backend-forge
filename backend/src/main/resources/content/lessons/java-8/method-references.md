---
title: Method References — Lambdas Made Even Shorter
summary: The four kinds of method references, when to use each, how they relate to lambdas, and how organizations use them for cleaner code.
order: 4
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
```
Function<String, Integer> parser = Integer::parseInt;

**The four kinds:**

| Kind | Syntax | Equivalent Lambda | Example |
|------|--------|-------------------|---------|
| Static method | `ClassName::staticMethod` | `(args) -> ClassName.staticMethod(args)` | `Integer::parseInt` |
| Instance method of a particular object | `object::instanceMethod` | `(args) -> object.instanceMethod(args)` | `System.out::println` |
| Instance method of an arbitrary object | `ClassName::instanceMethod` | `(first, rest) -> first.instanceMethod(rest)` | `String::toUpperCase` |
| Constructor | `ClassName::new` | `() -> new ClassName()` | `ArrayList::new` |

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. --- Kind 1: Static method reference ---. Lambda: s -> Integer.parseInt(s). Method ref: Integer::parseInt
2. Parses "42" to 42
3. --- Kind 2: Instance method of a particular object ---. Lambda: s -> System.out.println(s). Method ref: System.out::println
4. Prints each name — System.out is the particular object
5. --- Kind 3: Instance method of an arbitrary object ---. Lambda: s -> s.toUpperCase(). Method ref: String::toUpperCase
6. `.map(String::toUpperCase)` — String is the class, toUpperCase is the method
7. ["CHARLIE", "ALICE", "BOB", "EVE", "DAVID"]
8. Sort using method reference
9. `.sorted(String::compareToIgnoreCase)` — (a, b) -> a.compareToIgnoreCase(b)
10. --- Kind 4: Constructor reference ---. Lambda: () -> new ArrayList<String>(). Method ref: ArrayList::new
11. With streams: collect to a specific collection type
12. `.collect(Collectors.toCollection(TreeSet::new));` — TreeSet constructor reference. ["Alice", "Charlie", "David"] — sorted alphabetically in a TreeSet
13. --- Combining kinds in a pipeline ---
14. `Function.identity(),` — static method reference
15. `String::length` — instance method of arbitrary object
16. {Alice=5, Bob=3, Charlie=7, David=5, Eve=3}

The same code, clean:

```java
import java.util.*;
import java.util.function.*;
import java.util.stream.*;

public class MethodRefDemo {
    public static void main(String[] args) {
        List<String> names = List.of("Charlie", "Alice", "Bob", "Eve", "David");

        Function<String, Integer> toInt = Integer::parseInt;

        names.forEach(System.out::println);

        List<String> upper = names.stream()
            .map(String::toUpperCase)
            .toList();

        List<String> sorted = names.stream()
            .sorted(String::compareToIgnoreCase)
            .toList();

        Supplier<List<String>> listFactory = ArrayList::new;
        List<String> newList = listFactory.get();

        Set<String> nameSet = names.stream()
            .filter(n -> n.length() > 3)
            .collect(Collectors.toCollection(TreeSet::new));

        Map<String, Integer> nameLengths = names.stream()
            .collect(Collectors.toMap(
                Function.identity(),
                String::length
            ));
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Configuring Spring beans

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

### Scenario 2: Event handler registration

Map<String, Consumer<OrderEvent>> handlers = Map.of(
    "CREATED",  orderNotificationService::sendConfirmation,
    "SHIPPED",  trackingService::updateTracking,
    "CANCELLED", refundService::processRefund
```java
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

public class Main {

    public static void main(String[] args) {
        // Method reference — clear
        list.forEach(System.out::println);

```java
        // Lambda — clearer than a method reference
        list.forEach(name -> System.out.println("User: " + name));

        // Lambda — method reference would be obscure
```
        list.stream().filter(name -> name.length() > 5 && name.startsWith("A"))
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `::` with overloaded methods | Ambiguity | Use lambda when method is overloaded |
| Overusing constructor references | Less readable | Use when creating new instances in a pipeline |
| Forgetting `this` context | `this::method` binds to current instance | Understand the binding |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/api/)
