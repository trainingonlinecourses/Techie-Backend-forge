---
title: Iterator and Iterable — Making Custom Collections ForEach-able
summary: The Iterable contract, writing custom iterators, Iterator vs Spliterator, fail-fast vs fail-safe, and how this pattern powers Java Streams and Spring Data repositories.
order: 44
minutes: 18
topics: [iterator, iterable, spliterator, fail-fast, for-each, custom-collection, streaming-pattern]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/Iterable.html
  - https://docs.oracle.com/javase/8/docs/api/java/util/Iterator.html
---

# Iterator and Iterable — Making Custom Collections ForEach-able

## The concept

Java's `for-each` loop (`for (Item item : items)`) does not require an array — it works on any object that implements `Iterable<T>`. The `Iterable` contract has a single method: `Iterator<T> iterator()`. The `Iterator` contract has two: `hasNext()` and `next()`.

Behind the scenes, `for (Item item : items)` is syntactic sugar for:

```java
Iterator<Item> it = items.iterator();
while (it.hasNext()) {
    Item item = it.next();
    // body
}
```

**Why this matters:** if you implement `Iterable` on your custom collection, it becomes compatible with `for-each`, `StreamSupport.stream()`, `Stream.of()`, `Collection.addAll()`, and every library that accepts `Iterable<T>` (Spring's `JpaRepository`, Guava's `Lists.newArrayList()`, etc.).

## The Iterator contract

```java
public interface Iterator<T> {
    boolean hasNext();  // returns true if more elements
    T next();           // returns the next element, throws NoSuchElementException if none
    default void remove() { throw new UnsupportedOperationException(); }
    default void forEachRemaining(Consumer<? super T> action) { /* optimized iteration */ }
}
```

**Fail-fast:** most JDK iterators throw `ConcurrentModificationException` if the underlying collection is modified structurally (add/remove) during iteration. They do this by tracking a `modCount` — the collection increments it on every structural modification; the iterator checks it on every `next()`.

**Fail-safe:** `CopyOnWriteArrayList` and `ConcurrentHashMap` iterators iterate over a snapshot. They do not throw `ConcurrentModificationException`, but they may miss concurrent modifications. This is the tradeoff: consistency vs visibility.

## How we use it in organizations

### Scenario 1: custom paginated iterator — fetching all records lazily

A database query returns 100K records, but loading them all into memory causes an OOM. Solution: a custom `Iterator` that fetches pages on demand.

```java
public class PagedEntityIterator<T> implements Iterator<T> {

    private final Function<Integer, Page<T>> pageFetcher;
    private int currentPage = 0;
    private Iterator<T> currentBatch;
    private boolean hasMore = true;

    public PagedEntityIterator(Function<Integer, Page<T>> pageFetcher) {
        this.pageFetcher = pageFetcher;
        loadNextPage();
    }

    private void loadNextPage() {
        Page<T> page = pageFetcher.apply(currentPage++);
        currentBatch = page.getContent().iterator();
        hasMore = !page.isLast();
    }

    @Override
    public boolean hasNext() {
        return currentBatch.hasNext() || hasMore;
    }

    @Override
    public T next() {
        if (!currentBatch.hasNext() && hasMore) {
            loadNextPage();
        }
        return currentBatch.next();
    }
}
```

```java
// Usage: process 100K orders without loading all into memory
public void processAllOrders() {
    PagedEntityIterator<Order> iterator = new PagedEntityIterator<>(
        page -> orderRepository.findAll(PageRequest.of(page, 1000))
    );

    while (iterator.hasNext()) {
        Order order = iterator.next();
        processOrder(order);  // each page fetched on demand
    }
}
```

### Scenario 2: Iterable on a service result — bulk operations

```java
public class AuditLogBatch implements Iterable<AuditEntry> {

    private final List<AuditEntry> entries;
    private final BatchSender sender;

    public AuditLogBatch(List<AuditEntry> entries, BatchSender sender) {
        this.entries = entries;
        this.sender = sender;
    }

    @Override
    public Iterator<AuditEntry> iterator() {
        return entries.iterator();
    }

    // Custom bulk send using the Iterable contract
    public SendResult sendAll() {
        int sent = 0;
        for (AuditEntry entry : this) {       // uses our iterator
            sender.send(entry);
            sent++;
        }
        return new SendResult(sent);
    }
}
```

```java
// Spring Data works with Iterable — JPA repositories accept Iterable<T> for batch delete
auditLogRepository.deleteAll(auditLogBatch);  // our Iterable, not a List
```

### Scenario 3: Iterator pattern in Stream API

The `Stream` API is built on `Spliterator` — the successor to `Iterator` that supports parallel iteration. When you call `stream()` on a collection, the collection's `spliterator()` is called:

```java
List<Order> orders = List.of(order1, order2, order3);

// Equivalent under the hood:
Spliterator<Order> spliterator = orders.spliterator();
Stream<Order> stream = StreamSupport.stream(spliterator, false);

// Our custom collection can participate too:
public class OrderQueue implements Iterable<Order> {

    @Override
    public Iterator<Order> iterator() { return queue.iterator(); }

    // Automatically works with streams:
    // orderQueue.stream() → StreamSupport.stream(orderQueue.spliterator(), false)
}
```

## Fail-fast behavior

```java
List<String> names = new ArrayList<>(List.of("Alice", "Bob", "Charlie"));

for (String name : names) {
    if (name.equals("Bob")) {
        names.remove(name);  // ConcurrentModificationException!
    }
}
```

The iterator detects that `names` was structurally modified and throws. **Safe alternatives:**

```java
// Option 1: use Iterator.remove()
Iterator<String> it = names.iterator();
while (it.hasNext()) {
    if (it.next().equals("Bob")) {
        it.remove();  // safe — iterator tracks its own modification
    }
}

// Option 2: removeIf (Java 8+)
names.removeIf(name -> name.equals("Bob"));

// Option 3: collect to a new list
List<String> filtered = names.stream()
    .filter(name -> !name.equals("Bob"))
    .toList();
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Implementing `Iterator` without `Iterable` | Cannot use `for-each` |
| Modifying collection during for-each | `ConcurrentModificationException` |
| Returning same `Iterator` instance | Second call gets empty iterator — iterator is single-use |
| Not implementing `remove()` in custom iterator | Default throws `UnsupportedOperationException` |
| Using `for-each` on a very large `Iterable` | Entire sequence loaded — use `Spliterator` or manual paging |
