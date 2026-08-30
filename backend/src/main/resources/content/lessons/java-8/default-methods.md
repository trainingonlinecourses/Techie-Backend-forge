---
title: Default Methods — Evolving Interfaces Without Breaking Code
summary: Why default methods exist, syntax, the diamond problem, static interface methods, and how they power the entire Java collections framework upgrade.
order: 6
minutes: 18
topics: [default-methods, interface-evolution, diamond-problem, static-interface-methods, java8]
docs:
  - https://docs.oracle.com/javase/tutorial/java/IandI/defaultmethods.html
---

## The Concept, From Zero

Before Java 8, interfaces could only have abstract methods. If you wanted to add a new method to an interface, you had to update every class that implemented it — potentially thousands of classes.

Java 8 solved this with **default methods** — methods in an interface that have a body (default implementation). Classes can override them or use the default:

```java
public interface List<E> extends Collection<E> {
    // New in Java 8: default method with a body
    default void sort(Comparator<? super E> c) {
        Object[] a = this.toArray();
        Arrays.sort(a, (Comparator) c);
        ListIterator<E> i = this.listIterator();
        for (Object e : a) {
            i.next();
            i.set((E) e);
        }
    }

    // Still abstract — no body
    int size();

    // Static method — belongs to the interface, not the class
    static <E> List<E> of(E... elements) {
        return Arrays.asList(elements);
    }
}
```

**Why this matters:** When Java 8 added `sort()`, `stream()`, `forEach()`, and `removeIf()` to the `Collection` interface, ALL existing implementations (ArrayList, HashSet, LinkedList, etc.) got these methods for free via default implementations. No breaking changes.

---

## Syntax

```java
public interface MyInterface {
    // Abstract method (no body)
    void abstractMethod();

    // Default method (has a body)
    default void defaultMethod() {
        System.out.println("Default implementation");
    }

    // Static method (has a body, belongs to interface)
    static void staticMethod() {
        System.out.println("Static interface method");
    }

    // Private method (Java 9+)
    private void helperMethod() {
        System.out.println("Private helper");
    }
}
```

---

## The Diamond Problem

What happens if a class implements two interfaces with the same default method?

```java
interface Flyable {
    default String move() { return "flying"; }
}

interface Swimmable {
    default String move() { return "swimming"; }
}

// COMPILE ERROR if we don't override:
// class Duck implements Flyable, Swimmable { }

// Resolution: MUST override to disambiguate
class Duck implements Flyable, Swimmable {
    @Override
    public String move() {
        // Option 1: Choose one
        return Flyable.super.move();

        // Option 2: Combine both
        // return Flyable.super.move() + " and " + Swimmable.super.move();
    }
}
```

---

## Line-by-Line Walkthrough

```java
// Line 1: Define an interface with default methods
public interface Cache<K, V> {
    V get(K key);
    void put(K key, V value);

    // Default method: check if key exists
    default boolean containsKey(K key) {
        return get(key) != null;
    }

    // Default method: get or compute if absent
    default V getOrDefault(K key, V defaultValue) {
        V value = get(key);
        return value != null ? value : defaultValue;
    }

    // Static factory method
    static <K, V> Cache<K, V> createInMemory() {
        return new InMemoryCache<>();
    }
}

// Line 2: Implementation only needs to provide abstract methods
public class InMemoryCache<K, V> implements Cache<K, V> {
    private final Map<K, V> store = new HashMap<>();

    @Override
    public V get(K key) { return store.get(key); }

    @Override
    public void put(K key, V value) { store.put(key, value); }
    // containsKey and getOrDefault inherited from default implementations
}

// Line 3: Usage
Cache<String, User> userCache = Cache.createInMemory();
userCache.put("u1", new User("Alice"));
System.out.println(userCache.containsKey("u1"));           // true (default method)
System.out.println(userCache.getOrDefault("u2", Guest));   // Guest (default method)
```

---

## Real-World Scenarios

### Scenario 1: Versioned API contracts

```java
public interface PaymentProcessor {
    PaymentResult process(PaymentRequest request);

    // Added in v2 — default preserves backward compatibility
    default PaymentResult processWithRetry(PaymentRequest request, int maxRetries) {
        PaymentResult result = null;
        for (int i = 0; i < maxRetries; i++) {
            result = process(request);
            if (result.isSuccess()) return result;
        }
        return result;
    }

    // Added in v3 — uses the retry default
    default PaymentResult processWithTimeout(PaymentRequest request, Duration timeout) {
        return processWithRetry(request, 3);  // fallback to retry logic
    }
}
```

### Scenario 2: Mixin-style capabilities

```java
public interface Auditable {
    default AuditRecord createAuditRecord(String action, String userId) {
        return new AuditRecord(
            UUID.randomUUID().toString(),
            action,
            userId,
            Instant.now()
        );
    }
}

public interface AuditedEntity extends Auditable {
    List<AuditRecord> getAuditHistory();
    default void audit(String action, String userId) {
        getAuditHistory().add(createAuditRecord(action, userId));
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Default method conflicts | Two interfaces with same default method | Override to disambiguate |
| Calling `this.method()` in default | Calls the implementing class method | Use `InterfaceName.super.method()` |
| Forgetting static methods aren't inherited | Can't call `obj.staticMethod()` | Call via `Interface.staticMethod()` |
