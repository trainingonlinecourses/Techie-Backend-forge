---
title: Java Collections Framework — List, Set, Map, Queue Explained for Beginners
summary: The complete collections hierarchy with beginner-friendly explanations: ArrayList vs LinkedList, HashSet vs TreeSet, HashMap vs TreeMap, when to use Queue and Deque, immutable collections, and thread-safe alternatives with line-by-line code walkthroughs.
order: 5
minutes: 35
topics: [collections, arraylist, linkedlist, hashset, treeset, hashmap, treemap, queue, deque, immutable-collections, collections-utils]
docs:
  - https://docs.oracle.com/javase/tutorial/collections/
  - https://docs.oracle.com/javase/8/docs/api/java/util/Collections.html
---

# Java Collections Framework — List, Set, Map, Queue Explained for Beginners

## What is a Collection?

A **collection** is a container that holds multiple objects. Instead of creating 100 separate variables for 100 users, you put them in a collection (like a list, set, or map) and loop through them.

**Beginner mental model:**
- **List** = shopping list (ordered, can have duplicates)
- **Set** = collection of unique stamps (no duplicates, order depends on type)
- **Map** = dictionary (key → value pairs, like word → definition)
- **Queue** = restaurant waitlist (first in, first out)

## The Collections Family Tree

```
Collection
├── List (ordered, allows duplicates)
│   ├── ArrayList  — fast random access, slow insert/delete in middle
│   └── LinkedList — slow random access, fast insert/delete at ends
├── Set (no duplicates)
│   ├── HashSet    — fastest, no order guarantee
│   ├── LinkedHashSet — maintains insertion order
│   └── TreeSet    — sorted, O(log n) operations
├── Queue (FIFO processing)
│   ├── PriorityQueue — sorted by priority
│   └── ArrayDeque    — faster than LinkedList for stack/queue
└── Map (key → value)
    ├── HashMap       — fastest, no order guarantee
    ├── LinkedHashMap — maintains insertion order
    └── TreeMap       — sorted by key, O(log n)
```

## List — ordered collection with duplicates

### ArrayList — the default choice for most cases

```java
// ArrayList is like a dynamic array — grows automatically as you add elements
List<String> names = new ArrayList<>();     // empty list

// ADD elements
names.add("Alice");          // adds to end: ["Alice"]
names.add("Bob");            // adds to end: ["Alice", "Bob"]
names.add("Alice");          // DUPLICATES allowed: ["Alice", "Bob", "Alice"]
names.add(1, "Charlie");     // insert at index 1: ["Alice", "Charlie", "Bob", "Alice"]

// ACCESS elements by index (FAST — O(1) constant time)
String first = names.get(0);    // "Alice" — access first element
String third = names.get(2);    // "Bob" — access third element

// SIZE
int count = names.size();       // 4 — number of elements

// SEARCH
boolean hasAlice = names.contains("Alice");  // true — checks if element exists
int index = names.indexOf("Bob");             // 2 — position of "Bob" (or -1 if not found)

// REMOVE elements
names.remove("Charlie");       // remove by value: removes first "Charlie"
names.remove(0);               // remove by index: removes first element

// LOOP through all elements
for (String name : names) {              // enhanced for-each
    System.out.println(name);
}

// Or with index (when you need the position)
for (int i = 0; i < names.size(); i++) {
    System.out.println(i + ": " + names.get(i));
}

// CONVERT to array (when you need an array)
String[] array = names.toArray(new String[0]);
```

**When to use ArrayList:** Almost always. It's the default choice because:
- `get(index)` is instant (O(1)) — direct memory access
- `add()` at the end is instant (amortized O(1))
- Memory is contiguous — cache-friendly, fast iteration

### LinkedList — when you need fast insert/delete at both ends

```java
// LinkedList is a doubly-linked list — each element points to the next and previous
LinkedList<String> queue = new LinkedList<>();

// Add/remove at both ends — FAST (O(1))
queue.addFirst("Alice");    // ["Alice"]
queue.addLast("Bob");       // ["Alice", "Bob"]
queue.addLast("Charlie");   // ["Alice", "Bob", "Charlie"]

String first = queue.removeFirst();  // "Alice" — FIFO queue behavior
String last = queue.removeLast();    // "Charlie" — LIFO stack behavior

// LinkedList also implements Queue interface
queue.offer("David");       // add to end (alias for addLast)
queue.poll();               // remove from front (alias for removeFirst, returns null if empty)
queue.peek();               // look at front without removing (returns null if empty)
```

**When to use LinkedList:** Rarely in modern Java. Use it when:
- You frequently add/remove at both ends (queue/deque pattern)
- You never need random access by index
- **Performance note:** LinkedList is actually SLOWER than ArrayList for most operations due to memory overhead of node objects

## Set — no duplicates

### HashSet — fastest, no order

```java
// HashSet uses a HashMap internally — O(1) add/remove/contains
Set<String> uniqueNames = new HashSet<>();

uniqueNames.add("Alice");     // true — added
uniqueNames.add("Bob");       // true — added
uniqueNames.add("Alice");     // false — DUPLICATE rejected, still just ["Alice", "Bob"]

System.out.println(uniqueNames.size());          // 2 — duplicate was ignored
System.out.println(uniqueNames.contains("Alice")); // true — O(1) lookup

// Remove all duplicates from a List
List<String> allNames = List.of("Alice", "Bob", "Alice", "Charlie", "Bob");
Set<String> unique = new HashSet<>(allNames);    // ["Alice", "Bob", "Charlie"] — order undefined
List<String> uniqueList = new ArrayList<>(unique); // convert back to List if needed
```

### LinkedHashSet — maintains insertion order

```java
// Same as HashSet but preserves the order you added elements
Set<String> ordered = new LinkedHashSet<>();
ordered.add("Charlie");    // added first
ordered.add("Alice");      // added second
ordered.add("Bob");        // added third

System.out.println(ordered);  // [Charlie, Alice, Bob] — insertion order preserved
// HashSet would give arbitrary order
```

### TreeSet — sorted automatically

```java
// TreeSet sorts elements using natural ordering (alphabetical for Strings)
Set<String> sorted = new TreeSet<>();
sorted.add("Charlie");
sorted.add("Alice");
sorted.add("Bob");

System.out.println(sorted);  // [Alice, Bob, Charlie] — always sorted!

// TreeSet with custom comparator (sort by length, then alphabetical)
TreeSet<String> byLength = new TreeSet<>(
    Comparator.comparingInt(String::length)  // sort by string length
              .thenComparing(Comparator.naturalOrder())  // then alphabetical
);
byLength.add("Charlie");  // 7 chars
byLength.add("Bob");      // 3 chars
byLength.add("Alice");    // 5 chars
System.out.println(byLength);  // [Bob, Alice, Charlie] — sorted by length first
```

## Map — key → value pairs

### HashMap — the default choice

```java
// HashMap stores key-value pairs — like a dictionary
Map<String, Integer> ages = new HashMap<>();

// PUT key-value pairs
ages.put("Alice", 30);      // key="Alice", value=30
ages.put("Bob", 25);
ages.put("Charlie", 35);

// GET values by key (FAST — O(1))
int aliceAge = ages.get("Alice");     // 30
int bobAge = ages.get("Bob");         // 25

// CHECK if key exists
boolean hasAlice = ages.containsKey("Alice");      // true
boolean hasDavid = ages.containsKey("David");      // false

// GET with default (avoids null checks)
int davidAge = ages.getOrDefault("David", 0);      // 0 (default if not found)

// PUT IF ABSENT (only add if key doesn't exist)
ages.putIfAbsent("David", 28);      // added: David=28
ages.putIfAbsent("Alice", 99);      // NOT added: Alice already exists

// REMOVE
ages.remove("Bob");                   // removes Bob's entry
ages.remove("Charlie", 35);          // only removes if value matches 35

// SIZE
int count = ages.size();             // 3

// LOOP through all entries
for (Map.Entry<String, Integer> entry : ages.entrySet()) {
    System.out.println(entry.getKey() + " = " + entry.getValue());
}
// Or more concisely:
ages.forEach((name, age) -> System.out.println(name + " = " + age));

// GET ALL keys, values, or entries
Set<String> names = ages.keySet();           // ["Alice", "David"]
Collection<Integer> allAges = ages.values(); // [30, 28]
Set<Map.Entry<String, Integer>> all = ages.entrySet(); // [("Alice",30), ("David",28)]
```

### TreeMap — sorted by key

```java
// TreeMap sorts entries by key — useful for alphabetical indexing
TreeMap<String, Integer> sorted = new TreeMap<>();
sorted.put("Charlie", 35);
sorted.put("Alice", 30);
sorted.put("Bob", 25);

System.out.println(sorted);  // {Alice=30, Bob=25, Charlie=35} — always sorted by key!

// Range queries — unique to TreeMap
sorted.headMap("Charlie");   // entries before "Charlie": {Alice=30, Bob=25}
sorted.tailMap("Bob");       // entries from "Bob" onward: {Bob=25, Charlie=35}
sorted.subMap("Alice", "Charlie");  // entries from "Alice" to "Charlie" (exclusive)
```

## Queue and Deque — processing orders

```java
// Queue: FIFO (First In, First Out) — like a line at a bank
Queue<String> printQueue = new LinkedList<>();
printQueue.offer("Document1");     // add to end
printQueue.offer("Document2");
printQueue.offer("Document3");

String next = printQueue.poll();   // "Document1" — removes from front
String peek = printQueue.peek();   // "Document2" — looks without removing

// Deque: Double-Ended Queue — can add/remove from BOTH ends
Deque<String> stack = new ArrayDeque<>();  // use as a stack (LIFO)
stack.push("Bottom");    // add to top
stack.push("Middle");
stack.push("Top");       // stack is now: [Top, Middle, Bottom]

String top = stack.pop();    // "Top" — removes from top (LIFO)
String peek2 = stack.peek(); // "Middle" — looks at top without removing

// PriorityQueue: elements sorted by priority (smallest first by default)
Queue<String> priorityQueue = new PriorityQueue<>();
priorityQueue.offer("Low priority");
priorityQueue.offer("High priority");
priorityQueue.offer("Medium priority");

// poll() returns elements in priority order (alphabetical for Strings)
priorityQueue.poll();   // "High priority" — first alphabetically
priorityQueue.poll();   // "Low priority"
priorityQueue.poll();   // "Medium priority"
```

## Immutable collections — safe to share

```java
// Java 10+: factory methods create unmodifiable collections
List<String> immutableList = List.of("Alice", "Bob", "Charlie");
Set<Integer> immutableSet = Set.of(1, 2, 3);
Map<String, Integer> immutableMap = Map.of("Alice", 30, "Bob", 25);

// These throw UnsupportedOperationException if you try to modify them:
// immutableList.add("David");  // CRASH! Cannot modify immutable collection

// For existing collections, use Collections.unmodifiable*
List<String> mutable = new ArrayList<>(List.of("Alice", "Bob"));
List<String> readOnly = Collections.unmodifiableList(mutable);
// readOnly.add("Charlie");  // CRASH!
// But modifying 'mutable' still affects 'readOnly' — not truly immutable

// For truly immutable copies:
List<String> safeCopy = List.copyOf(mutable);  // independent copy
```

## Collections utility methods

```java
List<Integer> numbers = new ArrayList<>(List.of(5, 2, 8, 1, 9, 3));

// SORT
Collections.sort(numbers);                     // [1, 2, 3, 5, 8, 9] — modifies the list
List<Integer> sorted = numbers.stream().sorted().toList();  // creates new sorted list

// REVERSE
Collections.reverse(numbers);                  // reverses in place

// FIND min/max
int min = Collections.min(numbers);            // 1
int max = Collections.max(numbers);            // 9

// FILL
List<String> empty = new ArrayList<>(List.of("", "", ""));
Collections.fill(empty, "default");            // ["default", "default", "default"]

// COPY
List<String> source = List.of("Alice", "Bob");
List<String> dest = new ArrayList<>(List.of("", "", ""));
Collections.copy(dest, source);               // ["Alice", "Bob", ""] — overwrites first 2

// FREQUENCY
List<String> names = List.of("Alice", "Bob", "Alice", "Charlie");
int count = Collections.frequency(names, "Alice");  // 2

// DISJOINT (check if two collections have no common elements)
boolean noOverlap = Collections.disjoint(Set.of(1, 2), Set.of(3, 4));  // true
```

## How we use it in organizations

### Scenario 1: User session cache with HashMap

```java
@Service
public class SessionCache {
    // ConcurrentHashMap for thread-safe caching (multiple threads access sessions)
    private final ConcurrentHashMap<String, UserSession> sessions = new ConcurrentHashMap<>();

    public void createSession(String userId, UserSession session) {
        sessions.put(userId, session);          // O(1) — instant
    }

    public Optional<UserSession> getSession(String userId) {
        return Optional.ofNullable(sessions.get(userId));  // O(1) — returns Optional for null safety
    }

    public void invalidateExpired() {
        Instant cutoff = Instant.now().minus(Duration.ofMinutes(30));
        sessions.entrySet().removeIf(entry ->      // remove all expired sessions
            entry.getValue().getLastAccess().isBefore(cutoff)
        );
    }
}
```

### Scenario 2: Frequency counter for log analysis

```java
public class LogAnalyzer {
    public Map<String, Long> countErrorsByType(List<LogEntry> logs) {
        // Group logs by error type and count occurrences
        return logs.stream()
            .filter(log -> log.getLevel() == Level.ERROR)
            .collect(Collectors.groupingBy(
                LogEntry::getErrorType,          // group by error type
                Collectors.counting()            // count in each group
            ));
        // Returns: {"NullPointerException": 15, "TimeoutException": 8, ...}
    }
}
```

### Scenario 3: Dependency resolution with TreeMap

```java
// When deploying services, you need to start them in dependency order
public class ServiceDeploymentOrder {
    private final TreeMap<String, Set<String>> dependencyGraph = new TreeMap<>();

    public void addService(String name, Set<String> dependsOn) {
        dependencyGraph.put(name, dependsOn);
    }

    // Topological sort — returns services in correct startup order
    public List<String> getDeploymentOrder() {
        List<String> ordered = new ArrayList<>();
        Set<String> visited = new HashSet<>();

        for (String service : dependencyGraph.keySet()) {
            visit(service, visited, ordered);
        }
        return ordered;
    }

    private void visit(String service, Set<String> visited, List<String> ordered) {
        if (visited.contains(service)) return;    // already processed
        for (String dep : dependencyGraph.getOrDefault(service, Set.of())) {
            visit(dep, visited, ordered);          // process dependencies first
        }
        visited.add(service);
        ordered.add(service);                      // add after all deps are processed
    }
}
```

## Choosing the right collection

| Need | Use | Why |
|---|---|---|
| Ordered, allows duplicates | `ArrayList` | Fast random access, cache-friendly |
| Unique elements | `HashSet` | O(1) add/remove/contains |
| Unique + sorted | `TreeSet` | Auto-sorted, O(log n) |
| Key → value lookup | `HashMap` | O(1) get/put |
| Key → value + sorted by key | `TreeMap` | Auto-sorted keys, O(log n) |
| FIFO queue | `ArrayDeque` | Faster than LinkedList |
| Stack (LIFO) | `ArrayDeque` | Faster than Stack class |
| Thread-safe list | `CopyOnWriteArrayList` | Safe for read-heavy scenarios |
| Thread-safe map | `ConcurrentHashMap` | Safe for concurrent access |

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using LinkedList as default | Slower than ArrayList for most operations | Use ArrayList unless you need fast insert/delete at ends |
| Using HashMap for sorted data | No order guarantee | Use TreeMap for sorted keys |
| Modifying collection during for-each | ConcurrentModificationException | Use Iterator.remove() or removeIf() |
| Using `==` on Map keys (String) | May fail for non-pooled strings | Use immutable keys (Integer, Long, records) |
| Not checking null in HashMap.get | Returns null (easy to forget) | Use getOrDefault() or Optional.ofNullable() |
