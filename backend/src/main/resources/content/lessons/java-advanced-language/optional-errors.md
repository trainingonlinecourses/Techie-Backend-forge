---
title: Optional, nullability and Error Handling
module: java-advanced-language
order: 4
minutes: 18
topics: ["Optional", "null safety", "exception hierarchy", "fail fast", "error handling idioms"]
docs:
  - title: "Optional"
    url: "https://docs.oracle.com/en/java/javase/21/core/optional.html"
---

# Optional, Nullability and Error Handling

Null references cause more production bugs than any other single feature. `Optional` is Java's answer for *nullable return values*; the exception hierarchy and fail-fast discipline cover everything else. This lesson is the modern null-and-error playbook.

## Optional: For Return Values Only

```java
public Optional<Course> findById(Long id) {
    return courseRepository.findById(id);
}
```

The rule: **Optional is a return type** — never a field, never a method parameter, never a collection element.

```java
// ❌ Optional field
public class Course {
    private Optional<String> description;   // serialization pain, no

    // ❌ Optional parameter
    public void update(Optional<String> description) { ... }

    // ✅ Optional return
    public Optional<Course> findBySlug(String slug) { ... }
}
```

## The Optional Pipeline

```java
Optional<Course> course = repository.findBySlug("spring-boot");

// Transform
String title = course.map(Course::title)
    .orElse("Untitled");

// Filter
boolean longCourse = course.filter(c -> c.minutes() >= 40).isPresent();

// Chain
String level = course.map(Course::level)
    .map(String::toUpperCase)
    .orElse("UNKNOWN");

// Conditional side effect
course.ifPresent(c -> log.info("Loaded {}", c.id()));

// Or throw
Course c = course.orElseThrow(() -> new CourseNotFoundException(slug));
```

## The Anti-Patterns

```java
// ❌ get() without checking — the NPE you tried to avoid
Course c = course.orElseThrow().get();  // NoSuchElementException instead

// ❌ isPresent() + get() — verbose, race-prone
if (course.isPresent()) {
    Course c = course.get();
}

// ✅ orElseThrow with a domain exception
Course c = course.orElseThrow(() -> new CourseNotFoundException(slug));

// ❌ orElse with an expensive default
Course c = course.orElse(loadDefaultCourse());   // eager! runs every time

// ✅ orElseGet with a supplier — lazy
Course c = course.orElseGet(this::loadDefaultCourse);
```

## Optional + Streams

```java
// Find the first course whose title matches, get its id or -1
long id = courses.stream()
    .map(Course::title)
    .filter(t -> t.contains("Spring"))
    .findFirst()
    .map(CourseRepository::findByTitle)
    .flatMap(Optional::stream)      // Java 9: Optional → Stream
    .map(Course::id)
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
```

Rule of thumb: **checked exceptions for recoverable external conditions** (file missing, connection refused) when the caller should decide; **unchecked for programmer errors** (bad args, null, invalid state).

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
public Optional<Course> findBySlug(String slug) { ... }
```

Repository → Optional; service → domain exception; controller → HTTP status. Each layer speaks its own language; nothing leaks.

## Testing Null and Error Paths

```java
@Test
void missingCourseThrows() {
    assertThrows(CourseNotFoundException.class,
        () -> courseService.findBySlug("does-not-exist"));
}

@Test
void optionalHandlesAbsence() {
    Optional<Course> result = repository.findBySlug("nope");
    assertTrue(result.isEmpty());
    assertEquals("Untitled", result.map(Course::title).orElse("Untitled"));
}

@Test
void nullInputRejected() {
    assertThrows(IllegalArgumentException.class,
        () -> courseService.enroll(null, 1L));
}
```

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
