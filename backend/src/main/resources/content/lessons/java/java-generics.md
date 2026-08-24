---
title: Java Generics — Type Parameters, Bounded Types, Wildcards, and PECS Rule
summary: What generics are and why they exist, writing generic classes and methods, bounded type parameters, the PECS rule (Producer Extends, Consumer Super), type erasure, and common wildcard patterns with line-by-line code walkthroughs.
order: 6
minutes: 30
topics: [generics, type-parameters, bounded-types, wildcards, pecs, type-erasure, generic-methods]
docs:
  - https://docs.oracle.com/javase/tutorial/java/generics/
  - https://docs.oracle.com/javase/tutorial/java/generics/bounded.html
  - https://docs.oracle.com/javase/tutorial/java/generics/wildcardGuidelines.html
---

# Java Generics — Type Parameters, Bounded Types, Wildcards, and PECS Rule

## What are Generics and Why Do They Exist?

**Generics** let you write classes, interfaces, and methods that work with **any type** while still being type-safe. Without generics, you'd have to use `Object` everywhere and cast manually — which is error-prone and ugly.

**Beginner mental model:** Generics are like a template or mold. You define the shape once (with a placeholder type `T`), and then fill in the actual type when you use it. A `List<String>` uses the same `List` code as `List<Integer>`, but Java ensures you can only put Strings in one and Integers in the other.

### Without generics (bad — Java before 5.0)

```java
// WITHOUT generics — everything is Object, unsafe
List names = new ArrayList();          // raw type — no type checking
names.add("Alice");
names.add("Bob");
names.add(42);                         // COMPILER ALLOWS THIS — 42 is an Object

// Retrieving requires manual casting — dangerous!
String name = (String) names.get(2);   // CRASH at runtime! ClassCastException: Integer cannot be cast to String
// The bug is caught at RUNTIME, not compile time — could be in production for months
```

### With generics (good — modern Java)

```java
// WITH generics — type is enforced at compile time
List<String> names = new ArrayList<>();  // can ONLY hold Strings
names.add("Alice");                      // OK
names.add("Bob");                        // OK
// names.add(42);                        // COMPILE ERROR! int is not a String

String name = names.get(0);             // no casting needed — already known to be String
```

## Writing Generic Classes

```java
// A generic pair — works with ANY two types
public class Pair<A, B> {               // A and B are type PARAMETERS (placeholders)
    private final A first;              // A is replaced by the actual type when you use Pair
    private final B second;

    public Pair(A first, B second) {    // constructor uses the type parameters
        this.first = first;
        this.second = second;
    }

    public A getFirst() { return first; }    // return type is A
    public B getSecond() { return second; }  // return type is B
}

// USAGE: Java infers the types from your arguments
Pair<String, Integer> nameAge = new Pair<>("Alice", 30);
// Java replaces A with String and B with Integer
// So getFirst() returns String, getSecond() returns Integer

String name = nameAge.getFirst();      // "Alice" — no casting needed
Integer age = nameAge.getSecond();     // 30 — no casting needed
// nameAge.getFirst().length();        // works — it's a String
// nameAge.getSecond().doubleValue();  // works — it's a Number
```

## Writing Generic Methods

```java
// A generic method that works with ANY type
public static <T> List<T> filter(List<T> items, Predicate<T> condition) {
    //                ^  <T> declares the type parameter for THIS method
    List<T> result = new ArrayList<>();
    for (T item : items) {              // T is the element type
        if (condition.test(item)) {     // check condition
            result.add(item);           // add matching items
        }
    }
    return result;
}

// USAGE: Java infers T from the arguments
List<Integer> numbers = List.of(1, 2, 3, 4, 5, 6);
List<Integer> evens = filter(numbers, n -> n % 2 == 0);
// Java infers T = Integer because 'numbers' is List<Integer>
// Result: [2, 4, 6]

List<String> names = List.of("Alice", "Bob", "Charlie", "David");
List<String> shortNames = filter(names, n -> n.length() <= 3);
// Java infers T = String
// Result: ["Bob"]
```

## Bounded Type Parameters — restricting what types are allowed

Sometimes you want to say "T must be a Number" or "T must implement Comparable". This is called a **bounded type parameter**.

```java
// <T extends Number> means T must be Number or a subclass of Number (Integer, Double, etc.)
public static <T extends Number> double sum(List<T> numbers) {
    double total = 0;
    for (T num : numbers) {
        total += num.doubleValue();     // safe! T is guaranteed to be a Number
    }
    return total;
}

// USAGE:
List<Integer> ints = List.of(1, 2, 3);
List<Double> doubles = List.of(1.5, 2.5, 3.5);
System.out.println(sum(ints));     // 6.0
System.out.println(sum(doubles));  // 7.5
// sum(List.of("a", "b"));        // COMPILE ERROR! String doesn't extend Number

// Multiple bounds: <T extends Comparable<T> & Serializable>
// T must implement BOTH Comparable AND Serializable
public static <T extends Comparable<T> & Serializable> T max(List<T> items) {
    T largest = items.get(0);
    for (T item : items) {
        if (item.compareTo(largest) > 0) {  // safe! T is Comparable
            largest = item;
        }
    }
    return largest;
}
```

## Wildcards — the PECS Rule

Wildcards (`?`) let you work with generic types when you don't know (or don't care about) the exact type parameter. There are three kinds:

### Unbounded wildcard: `?`

```java
// <?> means "any type" — read-only, can only call Object methods
public static void printList(List<?> list) {  // accepts List<String>, List<Integer>, anything
    for (Object item : list) {                 // must use Object — type is unknown
        System.out.println(item);
    }
}

// Can read (as Object), but cannot write (type is unknown)
printList(List.of("Alice", "Bob"));     // OK
printList(List.of(1, 2, 3));            // OK
// list.add("Charlie");                 // COMPILE ERROR! Can't add to List<?>
```

### Upper bounded: `? extends T` (Producer — you READ from it)

```java
// <? extends Number> means "Number or any subclass" — you can READ Numbers
public static double sum(List<? extends Number> numbers) {
    //                    ^^^^^^^^^^^^^^^^^^^^^^^^ "some type that extends Number"
    double total = 0;
    for (Number num : numbers) {       // safe! we know it's at least a Number
        total += num.doubleValue();
    }
    return total;
}

// Works with ANY Number type — no need for separate methods
sum(List.of(1, 2, 3));               // List<Integer> — Integer extends Number
sum(List.of(1.5, 2.5));             // List<Double> — Double extends Number
sum(List.of(1L, 2L, 3L));           // List<Long> — Long extends Number

// CANNOT write to it — type is unknown
// numbers.add(42);                  // COMPILE ERROR! What if the list is List<Double>?
```

### Lower bounded: `? super T` (Consumer — you WRITE to it)

```java
// <? super Integer> means "Integer or any superclass" — you can WRITE Integers
public static void addNumbers(List<? super Integer> list) {
    //                         ^^^^^^^^^^^^^^^^^^^^^ "some type that is Integer or above"
    list.add(1);                     // safe! we know it can hold Integers
    list.add(2);
    list.add(3);
}

List<Number> numbers = new ArrayList<>();     // Number is superclass of Integer
addNumbers(numbers);                           // OK — Number is "super Integer"

List<Object> objects = new ArrayList<>();     // Object is superclass of Integer
addNumbers(objects);                           // OK — Object is "super Integer"

List<Integer> integers = new ArrayList<>();
addNumbers(integers);                          // OK — Integer is "super Integer"
```

### The PECS Rule — Producer Extends, Consumer Super

This is the most important wildcard concept. When you see a wildcard parameter:

- **Producer Extends** (`? extends T`): If the method **reads** from the collection (produces values), use `extends`.
- **Consumer Super** (`? super T`): If the method **writes** to the collection (consumes values), use `super`.

```java
// PRODUCER: we READ from 'source' — use extends
public static <T> void copy(List<? super T> dest, List<? extends T> source) {
    //                  ^^^^^^^^^^^^^^^ CONSUMER (we write to dest)
    //                                  ^^^^^^^^^^^^^^^^^ PRODUCER (we read from source)
    for (T item : source) {           // read from source (Producer — extends)
        dest.add(item);               // write to dest (Consumer — super)
    }
}

List<Number> numbers = new ArrayList<>();
List<Integer> integers = List.of(1, 2, 3);
copy(numbers, integers);              // copies Integer values into Number list
```

## Type Erasure — what generics disappear at runtime

```java
// At COMPILE TIME: Java checks all generic types
List<String> names = new ArrayList<>();
names.add("Alice");
String name = names.get(0);

// At RUNTIME: Java REMOVES all generic type information
// List<String> becomes just List (raw type)
// The compiler inserted an automatic cast: (String) names.get(0)

// This means you CANNOT do:
// if (names instanceof List<String>) { ... }     // COMPILE ERROR — can't check generic type at runtime
// T[] array = new T[10];                         // COMPILE ERROR — can't create generic arrays
// Class<T> type = T.class;                        // COMPILE ERROR — T is erased

// But you CAN check the raw type:
if (names instanceof List) {    // OK — checking the raw type
    System.out.println("It's a List!");
}
```

## How we use it in organizations

### Scenario 1: Generic Repository pattern — DRY data access

```java
// Instead of writing separate repository for each entity:
// UserRepository, OrderRepository, ProductRepository — all have the same CRUD methods

// GENERIC repository — write once, use for any entity
public interface GenericRepository<T, ID> {
    T findById(ID id);
    List<T> findAll();
    T save(T entity);
    void deleteById(ID id);
}

// Specific repositories just declare the type:
@Repository
public class UserRepository implements GenericRepository<User, Long> {
    @Autowired
    private JdbcTemplate jdbc;

    public User findById(Long id) {
        return jdbc.queryForObject(
            "SELECT * FROM users WHERE id = ?",
            (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name")),
            id
        );
    }

    public List<User> findAll() {
        return jdbc.query(
            "SELECT * FROM users",
            (rs, rowNum) -> new User(rs.getLong("id"), rs.getString("name"))
        );
    }

    public User save(User user) {
        jdbc.update("INSERT INTO users (name) VALUES (?)", user.getName());
        return user;
    }

    public void deleteById(Long id) {
        jdbc.update("DELETE FROM users WHERE id = ?", id);
    }
}
```

### Scenario 2: Generic cache with bounded types

```java
// A cache that works with any key type and value type
public class Cache<K, V> {
    private final Map<K, CacheEntry<V>> store = new ConcurrentHashMap<>();
    private final Duration ttl;

    public Cache(Duration ttl) {
        this.ttl = ttl;
    }

    public void put(K key, V value) {
        store.put(key, new CacheEntry<>(value, Instant.now().plus(ttl)));
    }

    public Optional<V> get(K key) {
        CacheEntry<V> entry = store.get(key);
        if (entry == null || entry.isExpired()) {
            store.remove(key);           // lazy cleanup
            return Optional.empty();
        }
        return Optional.of(entry.value());
    }

    private record CacheEntry<V>(V value, Instant expiresAt) {
        boolean isExpired() { return Instant.now().isAfter(expiresAt); }
    }
}

// Usage:
Cache<String, User> userCache = new Cache<>(Duration.ofMinutes(30));
userCache.put("alice", new User("Alice", "alice@example.com"));
Optional<User> alice = userCache.get("alice");  // Optional<User>

Cache<Long, Order> orderCache = new Cache<>(Duration.ofHours(1));
orderCache.put(12345L, new Order(12345L, Money.of(99.99)));
```

### Scenario 3: PECS in utility methods

```java
// Collections.copy uses PECS: reads from source (extends), writes to dest (super)
public static <T> void mergeLists(List<? super T> dest, List<? extends T> src) {
    dest.addAll(src);  // dest must accept T (super), src must produce T (extends)
}

// Works with any compatible types:
List<Number> numbers = new ArrayList<>(List.of(1, 2, 3));
List<Integer> moreIntegers = List.of(4, 5, 6);
mergeLists(numbers, moreIntegers);  // Number is "super Integer", Integer "extends Number"
// numbers is now [1, 2, 3, 4, 5, 6]
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Raw types (`List` instead of `List<String>`) | No type checking — defeats the purpose | Always use parameterized types |
| Using `? extends` and trying to add elements | Compile error — can't write to producer | Use `? super` for consumers |
| Using `? super` and trying to read elements | Must cast to Object — loses type safety | Use `? extends` for producers |
| Checking `instanceof List<String>` | Compile error — generic type erased at runtime | Check raw type `instanceof List` |
| Creating `new T[10]` | Compile error — can't create generic arrays | Use `Object[]` and cast, or `List<T>` |
