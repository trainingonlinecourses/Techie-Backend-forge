---
title: Clean Architecture and the Dependency Rule
module: ddd-architecture
order: 4
minutes: 25
topics: ["clean architecture", "dependency rule", "use cases", "entities", "boundaries", "layers"]
summary: Clean Architecture (Uncle Bob) generalizes hexagonal: concentric circles of responsibility, with the dependency rule — source code dependencies poi...
docs:
  - title: "Clean architecture"
    url: "https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html"
---

# Clean Architecture and the Dependency Rule

Clean Architecture (Uncle Bob) generalizes hexagonal: concentric circles of responsibility, with **the dependency rule** — source code dependencies point *inward only*. Outer circles (frameworks, UI, DB) depend on inner circles (use cases, entities); never the reverse.

## The Circles

```
┌─────────────────────────────────────────┐
│  Frameworks & Drivers                   │  ← HTTP, JPA, Kafka, Spring
│  ┌───────────────────────────────────┐  │
│  │  Interface Adapters               │  ← Controllers, repositories, presenters
│  │  ┌─────────────────────────────┐  │  │
│  │  │  Use Cases                  │  │  │  ← Application business rules
│  │  │  ┌───────────────────────┐  │  │  │
│  │  │  │  Entities             │  │  │  │  ← Enterprise business rules
│  │  │  └───────────────────────┘  │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

**The Dependency Rule**: nothing in an inner circle may know about anything in an outer circle. Dependencies always point inward.

## The Four Layers

| Layer | Contains | Knows about |
|-------|----------|-------------|
| Entities | Business objects with critical rules | Nothing outer |
| Use Cases | Application-specific orchestration | Entities only |
| Interface Adapters | Controllers, presenters, repository impls | Use cases (via interfaces) |
| Frameworks & Drivers | Spring, JPA, Kafka, HTTP | Everything (outermost) |

## Entities: The Innermost

```java
// Entity — pure, no framework
public class Course {
    private final CourseId id;
    private String title;
    private CourseStatus status;

    public Course(CourseId id, String title) {
        this.id = id;
        this.title = title;
        this.status = CourseStatus.DRAFT;
    }

    public void publish() {
        if (status == CourseStatus.ARCHIVED) {
            throw new IllegalStateException("Cannot publish an archived course");
        }
        this.status = CourseStatus.PUBLISHED;
    }

    // ... no imports beyond java.*
}
```

## Use Cases: Application-Specific Rules

```java
public class PublishCourseUseCase {

    private final CourseRepository repository;

    public PublishCourseUseCase(CourseRepository repository) {
        this.repository = repository;
    }

    public void publish(CourseId id) {
        Course course = repository.findById(id)
            .orElseThrow(() -> new CourseNotFound(id));
        course.publish();                      // entity rule
        repository.save(course);
    }
}
```

The use case orchestrates: load entity, apply rule, persist. It knows the *entity's* interface (an inbound abstraction), not JPA.

## Interface Adapters: Controllers and Repositories

```java
// Adapter depends on the use case interface — points inward
@RestController
@RequestMapping("/api/courses")
public class CourseController {

    private final PublishCourseUseCase publish;   // interface

    @PostMapping("/{id}/publish")
    public ResponseEntity<Void> publish(@PathVariable Long id) {
        publish.publish(CourseId.of(id));
        return ResponseEntity.noContent().build();
    }
}
```

```java
// Repository adapter — implements the interface, uses JPA
@Repository
public class JpaCourseRepository implements CourseRepository {

    @Override
    public void save(Course course) {
        jpa.save(CourseMapper.toEntity(course));
    }
}
```

## The Dependency Inversion in Practice

The rule manifests as **interfaces owned by the inner layer**:

```java
// In the use-case layer — the OUTER layer implements it
public interface CourseRepository {
    Optional<Course> findById(CourseId id);
    void save(Course course);
}
```

JPA adapter implements it. The use case depends on the *interface*, not the framework — swap JPA for MyBatis without touching the use case.

## The Input/Output Boundary: Request/Response Models

Crossing a boundary means translating — don't leak DTOs into the use case:

```java
// Controller's DTO (outer layer)
public record PublishRequest(Long courseId, String reason) {}

// Use case input (inner layer)
public record PublishCourseCommand(CourseId courseId, String reason) {}
```

```java
@PostMapping("/{id}/publish")
public ResponseEntity<Void> publish(@PathVariable Long id,
                                    @RequestBody PublishRequest request) {
    publish.publish(new PublishCourseCommand(CourseId.of(id), request.reason()));
    return ResponseEntity.noContent().build();
}
```

The mapping happens at the boundary — the use case never sees the HTTP DTO.

## The Spring Annotations Question

Where do Spring annotations go? On the *adapters*:

```java
// ❌ Entity with JPA annotations — leaks the framework inward
@Entity
public class Course {
    @Id @GeneratedValue private Long id;
}

// ✅ Entity pure — mapping in the adapter
public class Course { ... }

@Entity
public class CourseEntity {        // adapter's persistence model
    @Id @GeneratedValue private Long id;
    // ...
}

public class JpaCourseRepository implements CourseRepository {
    // maps CourseEntity ↔ Course
}
```

Pragmatic note: many teams annotate entities directly for simplicity (the "pragmatic clean architecture" school). The strict form keeps the domain pristine; the pragmatic form accepts framework coupling in exchange for less mapping code. Choose deliberately.

## The Dependency Rule as Tests

```java
// The architecture test — enforces the rule mechanically
class ArchitectureTest {

    @Test
    void domainDoesNotDependOnSpring() {
        // Scan the domain package: no Spring/JPA imports allowed
        Set<Class<?>> domainClasses = new ClassGraph()
            .acceptPackages("com.acme.domain")
            .getClasses().loadClasses();

        for (Class<?> clazz : domainClasses) {
            Arrays.stream(clazz.getDeclaredFields())
                .forEach(f -> assertFalse(
                    f.getType().getName().startsWith("org.springframework"),
                    "Domain depends on Spring: " + clazz.getName()));
        }
    }
}
```

ArchUnit does this properly:

```java
@AnalyzeClasses(packages = "com.acme")
class ArchitectureTest {

    @ArchTest
    static final ArchRule domainRule = classes()
        .that().resideInAPackage("..domain..")
        .should().onlyDependOnClassesThat()
        .resideInAnyPackage("..domain..", "java..");

    @ArchTest
    static final ArchRule dependencyRule = layeredArchitecture()
        .consideringAllDependencies()
        .layer("Controllers").definedBy("..adapter.in..")
        .layer("UseCases").definedBy("..application..")
        .layer("Domain").definedBy("..domain..")
        .whereLayer("Controllers").mayNotBeAccessedByAnyLayer()
        .whereLayer("Domain").mayOnlyBeAccessedByLayers("UseCases");
}
```

## Summary

| Layer | Responsibility | Depends on |
|-------|----------------|------------|
| Entities | Core business rules | Nothing |
| Use Cases | Application rules | Entities |
| Adapters | Translation | Use cases (interfaces) |
| Frameworks | Plumbing | Everything |

Clean architecture is the dependency rule enforced as a discipline: inner circles pure, outer circles swappable, boundaries translated. The tests that enforce it (ArchUnit) are cheap insurance — they make the architecture a checked contract instead of an aspiration.
