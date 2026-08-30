---
title: Stream Idioms for Real Code
module: java-streams-deep
order: 5
minutes: 22
topics: ["stream idioms", "flatMap", "Optional streams", "nullable streams", "grouping patterns", "refactoring loops"]
summary: The previous lessons covered the mechanics; this one is the vocabulary. These are the stream idioms that appear in every real codebase — flatMap fo...
docs:
  - title: "Stream usage patterns"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html"
---

# Stream Idioms for Real Code

The previous lessons covered the mechanics; this one is the vocabulary. These are the stream idioms that appear in every real codebase — `flatMap` for nested collections, `Optional` bridges, null-safe pipelines, and the loop-to-stream refactoring that makes code shorter and safer.

## flatMap: Flattening Nested Structures

```java
// One course → many lessons
List<Lesson> allLessons = courses.stream()
    .map(Course::lessons)         // Stream<List<Lesson>>
    .flatMap(List::stream)        // Stream<Lesson>
    .toList();

// Multiple sources flattened
List<String> allTags = courses.stream()
    .flatMap(c -> c.tags().stream())
    .distinct()
    .toList();
```

`flatMap` is the answer to "each element produces many" — the map gives you collections, flatMap unwraps one level.

## The Nested Stream Pattern

```java
// Lessons for published courses, in module order
List<Lesson> lessons = courses.stream()
    .filter(Course::published)
    .flatMap(course -> course.lessons().stream()
        .sorted(Comparator.comparingInt(Lesson::order)))
    .toList();
```

## Optional Bridges

```java
// Optional → Stream (Java 9+): the elegant "maybe" in a pipeline
List<Course> results = slugs.stream()
    .map(slug -> repository.findBySlug(slug))    // Stream<Optional<Course>>
    .flatMap(Optional::stream)                    // Stream<Course> — drops empties
    .toList();
```

`Optional.stream()` turns present→1-element stream, empty→0-element stream. The pipeline skips misses without `filter(Optional::isPresent).map(Optional::get)`.

## Null-Safe Streams

```java
// Stream a possibly-null collection safely
Stream<String> safe = Stream.ofNullable(courses)     // Stream<List<Course>> or empty
    .flatMap(List::stream)                            // Stream<Course>
    .map(Course::title);
```

`Stream.ofNullable` is the stream's `Optional.ofNullable` — null source becomes an empty stream instead of NPE.

## Filtering With a Predicate Chain

```java
// Composable predicates (Java 11+: Predicate.not)
List<Course> eligible = courses.stream()
    .filter(Predicate.not(Course::archived))
    .filter(c -> c.published() && c.minutes() >= 10)
    .toList();

// Predefined predicates, reused
Predicate<Course> longEnough = c -> c.minutes() >= 10;
Predicate<Course> published = Course::published;
courses.stream().filter(longEnough.and(published)).toList();
```

## The Loop-to-Stream Refactoring

```java
// Before: imperative loop with mutation
Map<String, List<Course>> byLevel = new HashMap<>();
for (Course c : courses) {
    byLevel.computeIfAbsent(c.level(), k -> new ArrayList<>()).add(c);
}

// After: declarative, thread-safe, one line
Map<String, List<Course>> byLevel = courses.stream()
    .collect(Collectors.groupingBy(Course::level));
```

```java
// Before: search loop
Course found = null;
for (Course c : courses) {
    if (c.slug().equals(slug)) { found = c; break; }
}
if (found == null) throw new NotFoundException(slug);

// After
Course found = courses.stream()
    .filter(c -> c.slug().equals(slug))
    .findFirst()
    .orElseThrow(() -> new NotFoundException(slug));
```

## State Machines and Streams: The fold

```java
// Accumulate state across elements with reduce
record RunningTotal(int count, int minutes) {}

RunningTotal total = courses.stream()
    .reduce(new RunningTotal(0, 0),
        (acc, c) -> new RunningTotal(acc.count() + 1, acc.minutes() + c.minutes()),
        (a, b) -> new RunningTotal(a.count() + b.count(), a.minutes() + b.minutes()));
```

The 3-arg reduce (identity, accumulator, combiner) is the fold — the combiner makes it parallel-safe.

## Infinite Streams Done Right

```java
// Always pair generation with a bound
Stream.generate(() -> counter.incrementAndGet())
    .filter(n -> n % 2 == 0)
    .limit(10)                     // bound!
    .toList();

Stream.iterate(0, n -> n + 1)
    .takeWhile(n -> n < 100)       // bound
    .toList();
```

Infinite streams are only safe with `limit`/`findFirst`/`takeWhile` — never collect one unbounded.

## The Zip Pattern (no built-in zip)

```java
// Pair two lists element-wise
List<Course> a = ...; List<Course> b = ...;
List<Pair<Course, Course>> pairs = IntStream.range(0, Math.min(a.size(), b.size()))
    .mapToObj(i -> new Pair<>(a.get(i), b.get(i)))
    .toList();
```

## Idiom Cheat Sheet

| Want | Idiom |
|------|-------|
| Flatten nested collections | `flatMap(List::stream)` |
| Skip empty Optionals | `flatMap(Optional::stream)` |
| Stream a nullable collection | `Stream.ofNullable(x).flatMap(List::stream)` |
| Compose predicates | `Predicate.not(...)`, `.and(...)`, `.or(...)` |
| First match or throw | `filter(...).findFirst().orElseThrow(...)` |
| Group by key | `groupingBy(...)` |
| Running accumulation | 3-arg `reduce` |
| Bounded generation | `limit` / `takeWhile` |

## Testing Stream Idioms

```java
@Test
void flatMapsLessonsFromCourses() {
    Course c1 = course("Java", lesson(1), lesson(2));
    Course c2 = course("Spring", lesson(3));

    List<Lesson> lessons = List.of(c1, c2).stream()
        .flatMap(c -> c.lessons().stream())
        .toList();

    assertEquals(3, lessons.size());
}

@Test
void skipsEmptyOptionals() {
    List<String> slugs = List.of("exists", "missing", "exists2");
    List<Course> found = slugs.stream()
        .map(repository::findBySlug)
        .flatMap(Optional::stream)
        .toList();
    assertEquals(2, found.size());
}
```

## Summary

Streams aren't just loops with nicer syntax — they're a *declarative vocabulary*: `flatMap` for structure, `Optional::stream` for presence, `groupingBy` for aggregation, `reduce` for folds. Once these idioms are second nature, stream code gets shorter, safer (no mutable state), and more honest about intent. The next lesson covers the cases where streams *aren't* the answer — and what to use instead.
