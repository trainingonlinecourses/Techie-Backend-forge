---
title: Stream.toList() — The Simplest Terminal Operation
summary: What toList() is, how it replaces Collectors.toList(), unmodifiable guarantees, and when to use each collector.
order: 6
minutes: 10
topics: [stream, toList, collectors, unmodifiable, java17]
docs:
  - https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/stream/Stream.html#toList()
---

## The Concept, From Zero

Before Java 16, collecting a stream to a list required a verbose collector:

```java
// OLD WAY
List<String> names = people.stream()
    .map(Person::name)
    .collect(Collectors.toList());  // verbose

// JAVA 16+
List<String> names = people.stream()
    .map(Person::name)
    .toList();  // simple!
```

**Key difference:** `toList()` returns an **unmodifiable** list. `Collectors.toList()` returns a mutable `ArrayList`.

```java
var list = Stream.of(1, 2, 3).toList();
// list.add(4);  // UnsupportedOperationException — it's unmodifiable!

var mutableList = Stream.of(1, 2, 3).collect(Collectors.toList());
mutableList.add(4);  // OK — it's a mutable ArrayList
```

---

## When to Use Each

```java
// Use toList() — when you don't need to modify the list (most common)
List<String> names = people.stream()
    .map(Person::name)
    .toList();  // fast, unmodifiable

// Use Collectors.toList() — when you need a mutable list
List<String> mutableNames = people.stream()
    .map(Person::name)
    .collect(Collectors.toCollection(ArrayList::new));  // mutable

// Use Collectors.toUnmodifiableList() — explicit unmodifiable (Java 10+)
List<String> unmodNames = people.stream()
    .map(Person::name)
    .collect(Collectors.toUnmodifiableList());  // same as toList()
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;
import java.util.stream.*;

public class ToListDemo {
    record Product(String name, String category, double price) {}

    public static void main(String[] args) {
        List<Product> products = List.of(
            new Product("Laptop", "Electronics", 999.99),
            new Product("Phone", "Electronics", 699.99),
            new Product("Shirt", "Clothing", 29.99),
            new Product("Pants", "Clothing", 49.99),
            new Product("Book", "Books", 14.99)
        );

        // Line 1: Simple toList
        List<String> names = products.stream()
            .map(Product::name)
            .toList();
        // ["Laptop", "Phone", "Shirt", "Pants", "Book"]

        // Line 2: Filter + toList
        List<Product> electronics = products.stream()
            .filter(p -> p.category().equals("Electronics"))
            .toList();
        // [Laptop, Phone]

        // Line 3: Sorted + toList
        List<Product> sorted = products.stream()
            .sorted(Comparator.comparing(Product::price))
            .toList();

        // Line 4: Distinct + toList
        List<String> categories = products.stream()
            .map(Product::category)
            .distinct()
            .toList();
        // ["Electronics", "Clothing", "Books"]

        // Line 5: FlatMap + toList
        List<String> productNames = products.stream()
            .flatMap(p -> Stream.of(p.name().split("")))  // split into chars
            .distinct()
            .toList();

        // Line 6: Chained operations
        List<String> expensiveElectronics = products.stream()
            .filter(p -> p.category().equals("Electronics"))
            .filter(p -> p.price() > 500)
            .map(Product::name)
            .sorted()
            .toList();
        // ["Laptop", "Phone"]

        // Line 7: Unmodifiable guarantee
        var result = products.stream()
            .map(Product::name)
            .toList();
        try {
            result.add("Extra");  // UnsupportedOperationException
        } catch (UnsupportedOperationException e) {
            System.out.println("Cannot modify toList() result: " + e.getMessage());
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: DTO conversion

```java
public List<UserDTO> getUserDTOs(List<User> users) {
    return users.stream()
        .filter(User::isActive)
        .map(u -> new UserDTO(u.id(), u.name(), u.email()))
        .toList();
}
```

### Scenario 2: Report generation

```java
public List<String> getHighValueOrderIds(List<Order> orders) {
    return orders.stream()
        .filter(o -> o.total() > 1000)
        .sorted(Comparator.comparing(Order::total).reversed())
        .map(Order::id)
        .toList();
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Modifying `toList()` result | UnsupportedOperationException | Use `Collectors.toCollection(ArrayList::new)` |
| Using `toList()` when order matters | `toList()` preserves encounter order | Add `.sorted()` if needed |
| Confusing with `collect(toList())` | Different mutability | `toList()` = unmodifiable; `collect(toList())` = mutable |
