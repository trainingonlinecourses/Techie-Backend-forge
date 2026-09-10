---
title: Java Collections Framework — List, Set, Map, Queue Explained for Beginners
summary: The complete collections hierarchy with beginner-friendly explanations: ArrayList vs LinkedList, HashSet vs TreeSet, HashMap vs TreeMap, when to use Queue and Deque, immutable collections, and thread-safe alternatives with line-by-line code walkthroughs.
order: 30
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


**What this code does — step by step:**

1. ArrayList is like a dynamic array — grows automatically as you add elements
2. `List<String> names = new ArrayList<>();` — empty list
3. ADD elements
4. `names.add("Alice");` — adds to end: ["Alice"]
5. `names.add("Bob");` — adds to end: ["Alice", "Bob"]
6. `names.add("Alice");` — DUPLICATES allowed: ["Alice", "Bob", "Alice"]
7. `names.add(1, "Charlie");` — insert at index 1: ["Alice", "Charlie", "Bob", "Alice"]
8. ACCESS elements by index (FAST — O(1) constant time)
9. `String first = names.get(0);` — "Alice" — access first element
10. `String third = names.get(2);` — "Bob" — access third element
11. SIZE
12. `int count = names.size();` — 4 — number of elements
13. SEARCH
14. `boolean hasAlice = names.contains("Alice");` — true — checks if element exists
15. `int index = names.indexOf("Bob");` — 2 — position of "Bob" (or -1 if not found)
16. REMOVE elements
17. `names.remove("Charlie");` — remove by value: removes first "Charlie"
18. `names.remove(0);` — remove by index: removes first element
19. LOOP through all elements
20. `for (String name : names) {` — enhanced for-each
21. Or with index (when you need the position)
22. CONVERT to array (when you need an array)

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        List<String> names = new ArrayList<>();

        names.add("Alice");
        names.add("Bob");
        names.add("Alice");
        names.add(1, "Charlie");

        String first = names.get(0);
        String third = names.get(2);

        int count = names.size();

        boolean hasAlice = names.contains("Alice");
        int index = names.indexOf("Bob");

        names.remove("Charlie");
        names.remove(0);

        for (String name : names) {
            System.out.println(name);
        }

        for (int i = 0; i < names.size(); i++) {
            System.out.println(i + ": " + names.get(i));
        }

        String[] array = names.toArray(new String[0]);
    }
}
```

**When to use ArrayList:** Almost always. It's the default choice because:
- `get(index)` is instant (O(1)) — direct memory access
- `add()` at the end is instant (amortized O(1))
- Memory is contiguous — cache-friendly, fast iteration

### LinkedList — when you need fast insert/delete at both ends


**What this code does — step by step:**

1. LinkedList is a doubly-linked list — each element points to the next and previous
2. Add/remove at both ends — FAST (O(1))
3. `queue.addFirst("Alice");` — ["Alice"]
4. `queue.addLast("Bob");` — ["Alice", "Bob"]
5. `queue.addLast("Charlie");` — ["Alice", "Bob", "Charlie"]
6. `String first = queue.removeFirst();` — "Alice" — FIFO queue behavior
7. `String last = queue.removeLast();` — "Charlie" — LIFO stack behavior
8. LinkedList also implements Queue interface
9. `queue.offer("David");` — add to end (alias for addLast)
10. `queue.poll();` — remove from front (alias for removeFirst, returns null if empty)
11. `queue.peek();` — look at front without removing (returns null if empty)

The same code, clean:

```java
LinkedList<String> queue = new LinkedList<>();

queue.addFirst("Alice");
queue.addLast("Bob");
queue.addLast("Charlie");

String first = queue.removeFirst();
String last = queue.removeLast();

queue.offer("David");
queue.poll();
queue.peek();
```

**When to use LinkedList:** Rarely in modern Java. Use it when:
- You frequently add/remove at both ends (queue/deque pattern)
- You never need random access by index
- **Performance note:** LinkedList is actually SLOWER than ArrayList for most operations due to memory overhead of node objects

## Set — no duplicates

### HashSet — fastest, no order


**What this code does — step by step:**

1. HashSet uses a HashMap internally — O(1) add/remove/contains
2. `uniqueNames.add("Alice");` — true — added
3. `uniqueNames.add("Bob");` — true — added
4. `uniqueNames.add("Alice");` — false — DUPLICATE rejected, still just ["Alice", "Bob"]
5. `System.out.println(uniqueNames.size());` — 2 — duplicate was ignored
6. `System.out.println(uniqueNames.contains("Alice"));` — true — O(1) lookup
7. Remove all duplicates from a List
8. `Set<String> unique = new HashSet<>(allNames);` — ["Alice", "Bob", "Charlie"] — order undefined
9. `List<String> uniqueList = new ArrayList<>(unique);` — convert back to List if needed

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Set<String> uniqueNames = new HashSet<>();

        uniqueNames.add("Alice");
        uniqueNames.add("Bob");
        uniqueNames.add("Alice");

        System.out.println(uniqueNames.size());
        System.out.println(uniqueNames.contains("Alice"));

        List<String> allNames = List.of("Alice", "Bob", "Alice", "Charlie", "Bob");
        Set<String> unique = new HashSet<>(allNames);
        List<String> uniqueList = new ArrayList<>(unique);
    }
}
```

### LinkedHashSet — maintains insertion order


**What this code does — step by step:**

1. Same as HashSet but preserves the order you added elements
2. `ordered.add("Charlie");` — added first
3. `ordered.add("Alice");` — added second
4. `ordered.add("Bob");` — added third
5. `System.out.println(ordered);` — [Charlie, Alice, Bob] — insertion order preserved
6. HashSet would give arbitrary order

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Set<String> ordered = new LinkedHashSet<>();
        ordered.add("Charlie");
        ordered.add("Alice");
        ordered.add("Bob");

        System.out.println(ordered);
    }
}
```

### TreeSet — sorted automatically


**What this code does — step by step:**

1. TreeSet sorts elements using natural ordering (alphabetical for Strings)
2. `System.out.println(sorted);` — [Alice, Bob, Charlie] — always sorted!
3. TreeSet with custom comparator (sort by length, then alphabetical)
4. `Comparator.comparingInt(String::length)` — sort by string length
5. `.thenComparing(Comparator.naturalOrder())` — then alphabetical
6. `byLength.add("Charlie");` — 7 chars
7. `byLength.add("Bob");` — 3 chars
8. `byLength.add("Alice");` — 5 chars
9. `System.out.println(byLength);` — [Bob, Alice, Charlie] — sorted by length first

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Set<String> sorted = new TreeSet<>();
        sorted.add("Charlie");
        sorted.add("Alice");
        sorted.add("Bob");

        System.out.println(sorted);

        TreeSet<String> byLength = new TreeSet<>(
            Comparator.comparingInt(String::length)
                      .thenComparing(Comparator.naturalOrder())
        );
        byLength.add("Charlie");
        byLength.add("Bob");
        byLength.add("Alice");
        System.out.println(byLength);
    }
}
```

## Map — key → value pairs

### HashMap — the default choice


**What this code does — step by step:**

1. HashMap stores key-value pairs — like a dictionary
2. PUT key-value pairs
3. `ages.put("Alice", 30);` — key="Alice", value=30
4. GET values by key (FAST — O(1))
5. `int aliceAge = ages.get("Alice");` — 30
6. `int bobAge = ages.get("Bob");` — 25
7. CHECK if key exists
8. `boolean hasAlice = ages.containsKey("Alice");` — true
9. `boolean hasDavid = ages.containsKey("David");` — false
10. GET with default (avoids null checks)
11. `int davidAge = ages.getOrDefault("David", 0);` — 0 (default if not found)
12. PUT IF ABSENT (only add if key doesn't exist)
13. `ages.putIfAbsent("David", 28);` — added: David=28
14. `ages.putIfAbsent("Alice", 99);` — NOT added: Alice already exists
15. REMOVE
16. `ages.remove("Bob");` — removes Bob's entry
17. `ages.remove("Charlie", 35);` — only removes if value matches 35
18. SIZE
19. `int count = ages.size();` — 3
20. LOOP through all entries
21. Or more concisely:
22. GET ALL keys, values, or entries
23. `Set<String> names = ages.keySet();` — ["Alice", "David"]
24. `Collection<Integer> allAges = ages.values();` — [30, 28]
25. `Set<Map.Entry<String, Integer>> all = ages.entrySet();` — [("Alice",30), ("David",28)]

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Map<String, Integer> ages = new HashMap<>();

        ages.put("Alice", 30);
        ages.put("Bob", 25);
        ages.put("Charlie", 35);

        int aliceAge = ages.get("Alice");
        int bobAge = ages.get("Bob");

        boolean hasAlice = ages.containsKey("Alice");
        boolean hasDavid = ages.containsKey("David");

        int davidAge = ages.getOrDefault("David", 0);

        ages.putIfAbsent("David", 28);
        ages.putIfAbsent("Alice", 99);

        ages.remove("Bob");
        ages.remove("Charlie", 35);

        int count = ages.size();

        for (Map.Entry<String, Integer> entry : ages.entrySet()) {
            System.out.println(entry.getKey() + " = " + entry.getValue());
        }
        ages.forEach((name, age) -> System.out.println(name + " = " + age));

        Set<String> names = ages.keySet();
        Collection<Integer> allAges = ages.values();
        Set<Map.Entry<String, Integer>> all = ages.entrySet();
    }
}
```

### TreeMap — sorted by key


**What this code does — step by step:**

1. TreeMap sorts entries by key — useful for alphabetical indexing
2. `System.out.println(sorted);` — {Alice=30, Bob=25, Charlie=35} — always sorted by key!
3. Range queries — unique to TreeMap
4. `sorted.headMap("Charlie");` — entries before "Charlie": {Alice=30, Bob=25}
5. `sorted.tailMap("Bob");` — entries from "Bob" onward: {Bob=25, Charlie=35}
6. `sorted.subMap("Alice", "Charlie");` — entries from "Alice" to "Charlie" (exclusive)

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        TreeMap<String, Integer> sorted = new TreeMap<>();
        sorted.put("Charlie", 35);
        sorted.put("Alice", 30);
        sorted.put("Bob", 25);

        System.out.println(sorted);

        sorted.headMap("Charlie");
        sorted.tailMap("Bob");
        sorted.subMap("Alice", "Charlie");
    }
}
```

## Queue and Deque — processing orders


**What this code does — step by step:**

1. Queue: FIFO (First In, First Out) — like a line at a bank
2. `printQueue.offer("Document1");` — add to end
3. `String next = printQueue.poll();` — "Document1" — removes from front
4. `String peek = printQueue.peek();` — "Document2" — looks without removing
5. Deque: Double-Ended Queue — can add/remove from BOTH ends
6. `Deque<String> stack = new ArrayDeque<>();` — use as a stack (LIFO)
7. `stack.push("Bottom");` — add to top
8. `stack.push("Top");` — stack is now: [Top, Middle, Bottom]
9. `String top = stack.pop();` — "Top" — removes from top (LIFO)
10. `String peek2 = stack.peek();` — "Middle" — looks at top without removing
11. PriorityQueue: elements sorted by priority (smallest first by default)
12. poll() returns elements in priority order (alphabetical for Strings)
13. `priorityQueue.poll();` — "High priority" — first alphabetically. "Low priority". "Medium priority"

The same code, clean:

```java
Queue<String> printQueue = new LinkedList<>();
printQueue.offer("Document1");
printQueue.offer("Document2");
printQueue.offer("Document3");

String next = printQueue.poll();
String peek = printQueue.peek();

Deque<String> stack = new ArrayDeque<>();
stack.push("Bottom");
stack.push("Middle");
stack.push("Top");

String top = stack.pop();
String peek2 = stack.peek();

Queue<String> priorityQueue = new PriorityQueue<>();
priorityQueue.offer("Low priority");
priorityQueue.offer("High priority");
priorityQueue.offer("Medium priority");

priorityQueue.poll();
priorityQueue.poll();
priorityQueue.poll();
```

## Immutable collections — safe to share


**What this code does — step by step:**

1. Java 10+: factory methods create unmodifiable collections
2. These throw UnsupportedOperationException if you try to modify them: immutableList.add("David"); // CRASH! Cannot modify immutable collection
3. For existing collections, use Collections.unmodifiable*
4. readOnly.add("Charlie"); // CRASH! But modifying 'mutable' still affects 'readOnly' — not truly immutable
5. For truly immutable copies:
6. `List<String> safeCopy = List.copyOf(mutable);` — independent copy

The same code, clean:

```java
List<String> immutableList = List.of("Alice", "Bob", "Charlie");
Set<Integer> immutableSet = Set.of(1, 2, 3);
Map<String, Integer> immutableMap = Map.of("Alice", 30, "Bob", 25);


List<String> mutable = new ArrayList<>(List.of("Alice", "Bob"));
List<String> readOnly = Collections.unmodifiableList(mutable);

List<String> safeCopy = List.copyOf(mutable);
```

## Collections utility methods


**What this code does — step by step:**

1. SORT
2. `Collections.sort(numbers);` — [1, 2, 3, 5, 8, 9] — modifies the list
3. `List<Integer> sorted = numbers.stream().sorted().toList();` — creates new sorted list
4. REVERSE
5. `Collections.reverse(numbers);` — reverses in place
6. FIND min/max
7. `int min = Collections.min(numbers);` — 1
8. `int max = Collections.max(numbers);` — 9
9. FILL
10. `Collections.fill(empty, "default");` — ["default", "default", "default"]
11. COPY
12. `Collections.copy(dest, source);` — ["Alice", "Bob", ""] — overwrites first 2
13. FREQUENCY
14. `int count = Collections.frequency(names, "Alice");` — 2
15. DISJOINT (check if two collections have no common elements)
16. `boolean noOverlap = Collections.disjoint(Set.of(1, 2), Set.of(3, 4));` — true

The same code, clean:

```java
List<Integer> numbers = new ArrayList<>(List.of(5, 2, 8, 1, 9, 3));

Collections.sort(numbers);
List<Integer> sorted = numbers.stream().sorted().toList();

Collections.reverse(numbers);

int min = Collections.min(numbers);
int max = Collections.max(numbers);

List<String> empty = new ArrayList<>(List.of("", "", ""));
Collections.fill(empty, "default");

List<String> source = List.of("Alice", "Bob");
List<String> dest = new ArrayList<>(List.of("", "", ""));
Collections.copy(dest, source);

List<String> names = List.of("Alice", "Bob", "Alice", "Charlie");
int count = Collections.frequency(names, "Alice");

boolean noOverlap = Collections.disjoint(Set.of(1, 2), Set.of(3, 4));
```

## How we use it in organizations

### Scenario 1: User session cache with HashMap

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

### Scenario 2: Frequency counter for log analysis

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

### Scenario 3: Dependency resolution with TreeMap


**What this code does — step by step:**

1. When deploying services, you need to start them in dependency order
2. Topological sort — returns services in correct startup order
3. `if (visited.contains(service)) return;` — already processed
4. `visit(dep, visited, ordered);` — process dependencies first
5. `ordered.add(service);` — add after all deps are processed

The same code, clean:

```java
public class ServiceDeploymentOrder {
    private final TreeMap<String, Set<String>> dependencyGraph = new TreeMap<>();

    public void addService(String name, Set<String> dependsOn) {
        dependencyGraph.put(name, dependsOn);
    }

    public List<String> getDeploymentOrder() {
        List<String> ordered = new ArrayList<>();
        Set<String> visited = new HashSet<>();

        for (String service : dependencyGraph.keySet()) {
            visit(service, visited, ordered);
        }
        return ordered;
    }

    private void visit(String service, Set<String> visited, List<String> ordered) {
        if (visited.contains(service)) return;
        for (String dep : dependencyGraph.getOrDefault(service, Set.of())) {
            visit(dep, visited, ordered);
        }
        visited.add(service);
        ordered.add(service);
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

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
