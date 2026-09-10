---
title: Optional, nullability and Error Handling
module: java-advanced-language
order: 2
minutes: 18
topics: ["Optional", "null safety", "exception hierarchy", "fail fast", "error handling idioms"]
```java
summary: Null references cause more production bugs than any other single feature. Optional is Java's answer for nullable return values; the exception hiera...
docs:
```
  - title: "Optional"
    url: "https://docs.oracle.com/en/java/javase/21/core/optional.html"
---

# Optional, Nullability and Error Handling

Null references cause more production bugs than any other single feature. `Optional` is Java's answer for *nullable return values*; the exception hierarchy and fail-fast discipline cover everything else. This lesson is the modern null-and-error playbook.

## Optional: For Return Values Only

public Optional<Course> findById(Long id) {
    return courseRepository.findById(id);
}

The rule: **Optional is a return type** — never a field, never a method parameter, never a collection element.

// ❌ Optional field
public class Course {
    private Optional<String> description;   // serialization pain, no

    // ❌ Optional parameter
    public void update(Optional<String> description) { ... }

    // ✅ Optional return
    public Optional<Course> findBySlug(String slug) { ... }
}

## The Optional Pipeline


**What this code does — step by step:**

1. Transform
2. Filter
3. Chain
4. Conditional side effect
5. Or throw

The same code, clean:

```java
Optional<Course> course = repository.findBySlug("spring-boot");

String title = course.map(Course::title)
    .orElse("Untitled");

boolean longCourse = course.filter(c -> c.minutes() >= 40).isPresent();

String level = course.map(Course::level)
    .map(String::toUpperCase)
    .orElse("UNKNOWN");

course.ifPresent(c -> log.info("Loaded {}", c.id()));

Course c = course.orElseThrow(() -> new CourseNotFoundException(slug));
```

## The Anti-Patterns


**What this code does — step by step:**

1. ❌ get() without checking — the NPE you tried to avoid
2. `Course c = course.orElseThrow().get();` — NoSuchElementException instead
3. ❌ isPresent() + get() — verbose, race-prone
4. ✅ orElseThrow with a domain exception
5. ❌ orElse with an expensive default
6. `Course c = course.orElse(loadDefaultCourse());` — eager! runs every time
7. ✅ orElseGet with a supplier — lazy

The same code, clean:

```java
Course c = course.orElseThrow().get();

if (course.isPresent()) {
    Course c = course.get();
}

Course c = course.orElseThrow(() -> new CourseNotFoundException(slug));

Course c = course.orElse(loadDefaultCourse());

Course c = course.orElseGet(this::loadDefaultCourse);
```

## Optional + Streams

// Find the first course whose title matches, get its id or -1
long id = courses.stream()
    .map(Course::title)
    .filter(t -> t.contains("Spring"))
    .findFirst()
    .map(CourseRepository::findByTitle)
    .flatMap(Optional::stream)      // Java 9: Optional → Stream
    .map(Course::id)
```java
    .orElse(-1L);
```

`Optional.stream()` turns an Optional into a 0-or-1-element stream — the clean bridge between Optional and stream pipelines.

## Null Annotations: Document the Contract

```java
import org.springframework.lang.NonNull;
import org.springframework.lang.Nullable;

public class CourseService {

    @NonNull
    public Course create(@NonNull CourseDto dto) { ... }

    @Nullable
    public Course findInCache(String slug) { ... }
}
```

With IDE support, `@Nullable`/`@NonNull` turn null bugs into warnings at the call site. Spring ships these annotations; add `-Xep:NullAway` or IDE inspections to enforce.

## Fail Fast vs. Fail Safe

```java
// FAIL FAST: reject bad input immediately
public void enroll(String userId, Long courseId) {
    Objects.requireNonNull(userId, "userId is required");
    if (courseId == null) throw new IllegalArgumentException("courseId is required");
    // ... proceed, state is guaranteed valid
}

// FAIL SAFE: degrade gracefully
public Course getCourseOrDefault(String slug) {
    return repository.findBySlug(slug).orElse(defaultCourse);
}
```

The discipline: **fail fast at boundaries** (controllers, service entry points), **fail safe in the middle** (lookups with defaults, cache misses).

## The Exception Hierarchy

```
Throwable
├── Error          — JVM problems, don't catch (OutOfMemoryError, StackOverflowError)
└── Exception
    ├── RuntimeException  — unchecked: program bugs, Spring maps to 500/400
    │   ├── NullPointerException, IllegalArgumentException,
    │   ├── IllegalStateException, NoSuchElementException
    │   └── Spring's DataAccessException hierarchy (wraps SQLException)
    └── (checked)  — IOException, SQLException: must declare or wrap
```

## Checked vs. Unchecked in Practice

```java
// Modern practice: runtime exceptions for domain errors
public class CourseNotFoundException extends RuntimeException { ... }

// Services throw domain exceptions; controllers map them to status codes
@GetMapping("/courses/{slug}")
public CourseDto get(@PathVariable String slug) {
    return CourseDto.from(courseService.findBySlug(slug)
        .orElseThrow(() -> new CourseNotFoundException(slug)));
}

Rule of thumb: **checked exceptions for recoverable external conditions** (file missing, connection refused) when the caller should decide; **unchecked for programmer errors** (bad args, null, invalid state).
```

## The Three-Layer Error Pattern

```java
// Controller: translate to HTTP
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(CourseNotFoundException.class)
    public ProblemDetail handle(CourseNotFoundException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    }
}

// Service: throw domain exceptions
public Course findBySlug(String slug) {
    return repository.findBySlug(slug)
        .orElseThrow(() -> new CourseNotFoundException(slug));
}

// Repository: return Optional
```
public Optional<Course> findBySlug(String slug) { ... }

Repository → Optional; service → domain exception; controller → HTTP status. Each layer speaks its own language; nothing leaks.

## Testing Null and Error Paths

@Test
void missingCourseThrows() {
    assertThrows(CourseNotFoundException.class,
```java
        () -> courseService.findBySlug("does-not-exist"));
}

@Test
void optionalHandlesAbsence() {
```
    Optional<Course> result = repository.findBySlug("nope");
```java
    assertTrue(result.isEmpty());
```
    assertEquals("Untitled", result.map(Course::title).orElse("Untitled"));
```java
}

@Test
void nullInputRejected() {
```
    assertThrows(IllegalArgumentException.class,
        () -> courseService.enroll(null, 1L));
}

## Summary

| Situation | Idiom |
|-----------|-------|
| Lookup may miss | `Optional<Course>` return |
| Default on miss | `orElseGet(supplier)` |
| Fail on miss | `orElseThrow(domain exception)` |
| Transform | `map` / `flatMap` |
| Null input guard | `Objects.requireNonNull` / fail-fast |
| External recoverable failure | Checked exception or domain exception |
| Programmer error | IllegalArgumentException / IllegalStateException |
| Never | `Optional.get()`, Optional fields, catching `Error` |

Null safety is a contract you enforce at boundaries: repositories return `Optional`, services throw domain exceptions, controllers translate to HTTP. Follow the pattern and "it's null somewhere" stops being a debugging mystery — it becomes a compile-time or contract-level signal.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/language/java-language-changes.html)
