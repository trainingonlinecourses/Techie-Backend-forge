---
title: var — Local Variable Type Inference
summary: What var does, when to use it, when NOT to use it, effectively final rules, and how organizations standardize its usage.
order: 2
minutes: 18
topics: [var, local-variable-type-inference, type-inference, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/language/local-variable-type-inference.html
---

## The Concept, From Zero

Before Java 10 (available in Java 11 LTS), you had to declare the type of every local variable:

```java
Map<String, List<Order>> ordersByCustomer = new HashMap<>();
List<String> names = Arrays.asList("Alice", "Bob");
HttpClient client = HttpClient.newHttpClient();
```

Java 10 introduced `var` — the compiler infers the type from the right-hand side:

```java
var ordersByCustomer = new HashMap<String, List<Order>>();  // inferred as HashMap<String, List<Order>>
var names = Arrays.asList("Alice", "Bob");                   // inferred as List<String>
var client = HttpClient.newHttpClient();                      // inferred as HttpClient
```

**Key rule:** `var` only works for **local variables** with an initializer. NOT for fields, method parameters, or return types.

---

## When to Use var

```java
// GOOD: Type is obvious from the right-hand side
var users = new ArrayList<User>();
var stream = Files.lines(Path.of("data.csv"));
var response = httpClient.send(request, BodyHandlers.ofString());

// GOOD: Reduces verbosity with diamond operator
Map<String, List<Integer>> map = new HashMap<>();  // verbose
var map2 = new HashMap<String, List<Integer>>();    // equally verbose — var doesn't help here

// GOOD: Lambda expressions
var processor = (Function<String, Integer>) String::length;
var predicate = (Predicate<String>) s -> s.length() > 5;

// BAD: Type is NOT obvious
var data = processData();  // What type is data? Can't tell from code alone!
var result = service.execute(request);  // What does execute return?
```

---

## When NOT to Use var

```java
// DON'T: When the type isn't obvious
var user = userService.findById(id);  // Bad — is it User? Optional<User>?

// DON'T: For fields (not allowed)
// var name = "Alice";  // COMPILE ERROR — var not allowed for fields

// DON'T: For method parameters (not allowed in Java 11)
// public void process(var data) { }  // COMPILE ERROR

// DON'T: When you want to be explicit about interfaces
List<String> list = new ArrayList<>();  // Better — shows you're coding to the interface
var list2 = new ArrayList<String>();     // Worse — hides that it's an ArrayList
```

---

## Line-by-Line Walkthrough

```java
import java.net.http.*;
import java.net.URI;
import java.util.*;
import java.util.stream.*;

public class VarDemo {
    public static void main(String[] args) throws Exception {
        // Line 1: var with collections — type obvious from constructor
        var users = new LinkedHashMap<String, User>();  // LinkedHashMap
        users.put("alice", new User("Alice"));
        users.put("bob", new User("Bob"));

        // Line 2: var with streams — type obvious from operation
        var upperNames = users.values().stream()
            .map(User::getName)
            .map(String::toUpperCase)
            .toList();  // List<String> inferred

        // Line 3: var with try-with-resources
        try (var stream = Files.lines(Path.of("data.csv"))) {
            var lines = stream
                .filter(line -> !line.isBlank())
                .map(line -> line.split(","))
                .toList();
            // lines is List<String[]>
        }

        // Line 4: var with lambdas
        Comparator<User> byAge = Comparator.comparingInt(User::age);
        var sortedUsers = users.values().stream().sorted(byAge).toList();

        // Line 5: var in for loops
        for (var entry : users.entrySet()) {
            System.out.println(entry.getKey() + " -> " + entry.getValue());
        }

        // Line 6: var with records (Java 16+)
        var record = new Point(10, 20);  // Point inferred

        // Line 7: var with generics — preserves full type info
        var map = Map.of("key1", List.of(1, 2, 3), "key2", List.of(4, 5));
        // Type is Map<String, List<Integer>> — not erased to Map<Object, Object>
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Reduced noise in service code

```java
public void processOrder(String orderId) {
    var order = orderRepository.findById(orderId)
        .orElseThrow(() -> new NotFoundException("Order not found"));

    var items = order.getItems().stream()
        .filter(item -> item.getQuantity() > 0)
        .toList();

    var total = items.stream()
        .mapToDouble(Item::getPrice)
        .sum();

    var invoice = new Invoice(orderId, items, total);
    invoiceService.send(invoice);
}
```

### Scenario 2: Cleaner stream pipelines

```java
public Map<String, Double> calculateCategoryRevenue(List<Order> orders) {
    return orders.stream()
        .filter(Order::isCompleted)
        .collect(Collectors.groupingBy(
            Order::getCategory,
            Collectors.summingDouble(Order::getTotal)
        ));
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `var` without initializer | `var x;` won't compile | Always provide an initializer |
| `var` with `null` | Can't infer type: `var x = null;` | Use explicit type: `String x = null;` |
| Using `var` for fields | Not allowed | Use explicit type for fields |
| Overusing `var` | Reduces readability | Only use when type is obvious |
| `var` with method params | Not allowed in Java 11 | Use explicit types for parameters |
