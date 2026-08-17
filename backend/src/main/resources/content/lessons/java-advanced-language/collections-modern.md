---
title: Modern Collection APIs
module: java-advanced-language
order: 5
minutes: 18
topics: ["List.of", "Map.of", "unmodifiable", "copyOf", "Collection toArray", "new APIs"]
docs:
  - title: "Collection interfaces"
    url: "https://docs.oracle.com/en/java/javase/21/core/collections.html"
---

# Modern Collection APIs

Java 9–21 added factory methods, `copyOf`, and stream-friendly `toArray` overloads that replaced a decade of boilerplate. This lesson is the modern collection idiom: immutable collections by default, defensive copies without hand-rolling, and the small APIs that make collection code shorter and safer.

## Immutable Factories

```java
// The old way
List<String> tags = Arrays.asList("java", "spring");        // fixed-size, mutable
List<String> mutable = new ArrayList<>(); mutable.add("x");

// The modern way
List<String> tags = List.of("java", "spring");
Set<String> levels = Set.of("BEGINNER", "ADVANCED");
Map<String, Integer> limits = Map.of("cpu", 2, "memory", 1024);
```

- **Immutable**: any mutation throws `UnsupportedOperationException`
- **No nulls allowed**: `List.of(null)` throws NPE at creation
- **Compact**: `List.of` can be a single object under the hood (empty/singleton optimizations)

### Map.of Entries

```java
Map<String, Integer> config = Map.of(
    "core-pool", 4,
    "max-pool", 16,
    "queue-capacity", 200);

// More than 10 entries:
Map<String, Integer> big = Map.ofEntries(
    Map.entry("a", 1), Map.entry("b", 2), /* ... */);
```

## copyOf: Defensive Copies

```java
public record CourseDto(List<String> tags) {

    // Defensive copy in the compact constructor
    public CourseDto {
        tags = List.copyOf(tags);
    }
}
```

`List.copyOf` — and its `Set`/`Map` siblings — return an immutable copy. The caller's mutable list can never corrupt the record. This is the modern replacement for the `Collections.unmodifiableList(new ArrayList<>(...))` dance.

```java
// Collection → immutable list
List<String> immutable = List.copyOf(mutableList);

// If already immutable, copyOf may return the same instance — cheap
```

## Stream.toList() and toArray

```java
// Java 16+: Stream.toList() — immutable, no collectors needed
List<String> titles = courses.stream()
    .map(Course::title)
    .toList();                       // instead of .collect(Collectors.toList())

// Java 11+: toArray(IntFunction)
String[] arr = titles.stream().toArray(String[]::new);
```

`Stream.toList()` returns an immutable list — a subtle behavioral change from `Collectors.toList()` (mutable). Prefer it unless you need mutability.

## The Modern Immutability Rules

| Want | Use |
|------|-----|
| Empty immutable list | `List.of()` |
| 2–10 known values | `List.of(a, b, c)` |
| Copy a collection, immutable | `List.copyOf(coll)` |
| Stream result, immutable | `stream.toList()` |
| Mutable list | `new ArrayList<>(...)` explicitly |

**Default to immutable.** Immutable collections are thread-safe, safe to share, and fail loudly if code tries to mutate them.

## Collection Methods That Return This

The fluent mutation style (Java 8+):

```java
List<String> tags = new ArrayList<>();
tags.add("java");
tags.add("spring");
// vs
List<String> tags = new ArrayList<>();
Collections.addAll(tags, "java", "spring");
```

## The takeWhile/dropWhile Stream Additions (Java 9)

```java
// Take courses until the first one over 40 minutes
List<Course> shortOnes = courses.stream()
    .takeWhile(c -> c.minutes() <= 40)
    .toList();

// Drop everything up to and including the first long course
List<Course> after = courses.stream()
    .dropWhile(c -> c.minutes() <= 40)
    .toList();
```

`takeWhile`/`dropWhile` are the ordered-prefix operators — ideal for sorted data.

## iterate: The Stream Loop

```java
// Finite iteration with a predicate (Java 9+)
List<Integer> powers = Stream.iterate(1, n -> n < 1000, n -> n * 2)
    .toList();   // [1, 2, 4, 8, ..., 512]

// Old: infinite + limit
List<Integer> powers = Stream.iterate(1, n -> n * 2)
    .limit(10).toList();
```

## Records and Collections: The DTO Pattern

```java
public record CourseSummary(Long id, String title, int minutes) {
    public static CourseSummary from(Course c) {
        return new CourseSummary(c.id(), c.title(), c.minutes());
    }
}

// Mapping collections is now trivial:
List<CourseSummary> summaries = courses.stream()
    .map(CourseSummary::from)
    .toList();
```

## Unmodifiable View vs. Immutable

```java
// Unmodifiable VIEW: reflects changes to the source
List<String> view = Collections.unmodifiableList(backing);

// Immutable COPY: snapshotted, isolated
List<String> copy = List.copyOf(backing);

backing.add("new");     // view now shows it; copy doesn't
```

Know the difference: views are cheap but leak mutations; copies are safe but cost a traversal. For records and API boundaries, prefer copies.

## Testing

```java
@Test
void immutableCollectionsRejectMutation() {
    List<String> tags = List.of("java", "spring");
    assertThrows(UnsupportedOperationException.class, () -> tags.add("x"));
    assertThrows(NullPointerException.class, () -> List.of(null));
}

@Test
void copyOfIsolatesFromSource() {
    List<String> source = new ArrayList<>(List.of("a"));
    List<String> copy = List.copyOf(source);
    source.add("b");
    assertEquals(List.of("a"), copy);
}
```

## Summary

| API | Since | Use |
|-----|-------|-----|
| `List.of` / `Set.of` / `Map.of` | Java 9 | Immutable literals |
| `List.copyOf` | Java 10 | Immutable defensive copies |
| `Stream.toList()` | Java 16 | Immutable stream results |
| `takeWhile`/`dropWhile` | Java 9 | Ordered prefix operations |
| `toArray(IntFunction)` | Java 11 | Stream → array |

Modern collection code defaults to immutable, uses factory methods for literals, and copies defensively at boundaries. The result: fewer aliasing bugs, easier concurrency, and code that states its contract in the type system.
