---
title: The Integer Cache and Wrapper Interning
summary: How Java caches Integer, Long, Byte, Short, and Character objects, the -128 to 127 range, Integer.valueOf(), and when to care about object identity.
order: 3
minutes: 15
topics: [integer-cache, valueOf, interning, -128-127, object-identity, performance]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/Integer.html#valueOf-int-
---

## The Concept, From Zero

Java caches small wrapper objects to avoid creating millions of identical objects. When you write `Integer x = 42`, Java calls `Integer.valueOf(42)` which returns a cached object for values -128 to 127.

```java
Integer a = 100;
Integer b = 100;
System.out.println(a == b);  // true — same cached object

Integer c = 200;
Integer d = 200;
System.out.println(c == d);  // false — different objects
```

---

## Cache Ranges

| Type | Cached Range |
|------|-------------|
| Byte | -128 to 127 (all values) |
| Short | -128 to 127 |
| Integer | -128 to 127 |
| Long | -128 to 127 |
| Character | 0 to 127 |
| Boolean | TRUE and FALSE |
| Float | No cache |
| Double | No cache |

---

## valueOf vs new

```java
// valueOf() — uses cache
Integer a = Integer.valueOf(100);  // cached
Integer b = Integer.valueOf(100);  // same object
System.out.println(a == b);  // true

// new — always creates new object
Integer c = new Integer(100);  // deprecated, always new object
Integer d = new Integer(100);  // different object
System.out.println(c == d);  // false
```

---

## Real-World Scenarios

### Scenario 1: HashMap key comparison

```java
Map<Integer, String> map = new HashMap<>();
Integer key1 = Integer.valueOf(100);
Integer key2 = Integer.valueOf(100);
// Works because Integer overrides equals() and hashCode()
map.put(key1, "value");
System.out.println(map.get(key2));  // "value" — works fine

// But == comparison is wrong
System.out.println(key1 == key2);  // true (lucky — cached)
```

### Scenario 2: Thread safety of cache

```java
// The cache is thread-safe — Integer.valueOf() is synchronized internally
// Multiple threads can safely use cached values
ExecutorService pool = Executors.newFixedThreadPool(10);
for (int i = 0; i < 1000; i++) {
    pool.submit(() -> {
        Integer num = Integer.valueOf(42);  // safe, returns cached
        // ...
    });
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Relying on == for wrappers | Works by accident with cache, fails at 128+ | Always use .equals() |
| Creating wrapper with new | Bypasses cache, wastes memory | Use valueOf() or autoboxing |
| Comparing Long == Long | Fails for values outside cache | Use .equals() |
