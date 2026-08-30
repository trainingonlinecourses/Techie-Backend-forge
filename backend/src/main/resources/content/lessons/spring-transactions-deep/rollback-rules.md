---
title: Rollback Rules and the Transaction Boundary
module: spring-transactions-deep
order: 5
minutes: 20
topics: ["rollbackFor", "noRollbackFor", "checked exceptions", "transaction boundary", "readOnly", "transaction listeners"]
summary: @Transactional rolls back on RuntimeException — and not on checked exceptions. That one default causes more "committed when it should have rolled b...
docs:
  - title: "Rollback rules"
    url: "https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/tx-annotation.html"
---

# Rollback Rules and the Transaction Boundary

`@Transactional` rolls back on `RuntimeException` — and **not** on checked exceptions. That one default causes more "committed when it should have rolled back" bugs than anything else. This lesson covers rollback rules, where the transaction boundary belongs, and the `readOnly` contract.

## The Default Rollback Rules

| Exception type | Default behavior |
|----------------|------------------|
| RuntimeException | **Rollback** |
| Error | Rollback |
| Checked exception | **Commit** (!!) |

```java
// ❌ Surprise: a checked failure COMMITS
@Transactional
public void createCourse(CourseDto dto) throws IOException {
    courseRepository.save(...);
    fileService.upload(dto.coverArt());   // throws IOException → the save COMMITS
}
```

Spring's philosophy: checked exceptions signal "handle me, maybe it's fine"; runtime exceptions signal "something is broken, roll back." Production code usually disagrees with this default.

## Explicit Rollback Rules

```java
// Roll back on specific exceptions
@Transactional(rollbackFor = {IOException.class, FileUploadException.class})
public void createCourse(CourseDto dto) throws IOException { ... }

// ...including checked exceptions
@Transactional(rollbackFor = Exception.class)   // everything rolls back
public void fragileOperation() throws Exception { ... }

// Never roll back on this one
@Transactional(noRollbackFor = OptimisticLockException.class)
public void updateWithRetryHandled() { ... }
```

**The rule**: declare `rollbackFor` explicitly whenever a checked exception can fail the operation — otherwise the default commits a half-done write.

## Where the Boundary Belongs

```
❌ WRONG: transaction in the controller
@RestController
public class CourseController {
    @Transactional                       // every request = one tx — terrible
    @PostMapping("/courses")
    public CourseDto create(@Valid @RequestBody CourseDto dto) { ... }
}

✅ RIGHT: transaction at the service layer
@Service
public class CourseService {
    @Transactional                       // the business operation is the unit
    public CourseDto create(CourseDto dto) {
        Course saved = repository.save(toEntity(dto));
        auditService.log("course-created", saved.getId());
        return CourseDto.from(saved);
    }
}
```

**The boundary is the business operation**: the service method that must be all-or-nothing. Controllers orchestrate HTTP; repositories do single operations; services own the transaction.

### Repository-Level Transactions

```java
@Repository
public interface CourseRepository extends JpaRepository<Course, Long> {
    // Each repository method participates in the caller's tx (REQUIRED)
    // — no @Transactional needed on the repository itself
}
```

Spring Data repositories are already transactional (each method joins or creates one). Don't add `@Transactional` to repository methods — the service owns the boundary.

## readOnly = true: The Contract

```java
@Transactional(readOnly = true)
public CourseDto getCourse(Long id) {
    Course course = courseRepository.findById(id).orElseThrow();
    return CourseDto.from(course);
}
```

What `readOnly` really does:

- **Hint to the driver/DB** — Postgres/JDBC can route to read replicas
- **JPA flush mode set to MANUAL** — no dirty-checking flushes (performance)
- **Does NOT prevent writes** — a readOnly tx can still insert if you try (JPA throws on flush of new entities in some providers, but it's not a hard guarantee)

```java
@Transactional(readOnly = true)
public void sneaky() {
    repository.save(entity);   // ⚠️ not prevented by readOnly in all providers
}
```

Treat `readOnly` as documentation + optimization hint, not a write guard. For hard write-prevention, use a read-only datasource/user.

## The Transaction Synchronization Callbacks

Run code after commit — safely outside the transaction:

```java
@Transactional
public CourseDto createCourse(CourseDto dto) {
    Course saved = courseRepository.save(toEntity(dto));

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                // runs AFTER the tx commits — safe to publish events,
                // send emails, invalidate caches
                eventPublisher.publishEvent(new CourseCreated(saved.getId()));
            }
        });

    return CourseDto.from(saved);
}
```

**Why this pattern matters**: sending an email or publishing an event *inside* the transaction means it fires even if the tx later rolls back — a phantom notification. `afterCommit` guarantees the message only goes out when the data is durable.

## The Event-Transaction Pattern

```java
@Transactional
public void placeOrder(OrderDto dto) {
    Order order = orderRepository.save(toEntity(dto));
    applicationEventPublisher.publishEvent(new OrderPlaced(order));
    // OrderPlaced listener runs synchronously INSIDE the tx
    // — if it throws, the order rolls back too (desired or not?)
}

// Better: transactional event listener
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void onOrderPlaced(OrderPlaced event) {
    emailService.sendConfirmation(event.order());   // only after commit
}
```

`@TransactionalEventListener(AFTER_COMMIT)` is the declarative version of the synchronization pattern — the event listener runs only after the transaction commits.

## Testing Rollback Rules

```java
@SpringBootTest
class RollbackRuleTest {

    @Autowired CourseService courseService;

    @Test
    void checkedExceptionRollsBackWithRule() {
        assertThrows(IOException.class,
            () -> courseService.createCourseFails(dto));

        assertEquals(0, courseRepository.count());   // rolled back ✅
    }

    @Test
    void defaultCommitsOnCheckedException() {
        assertThrows(IOException.class,
            () -> courseService.createCourseDefault(dto));

        assertEquals(1, courseRepository.count());   // COMMITTED — the trap
    }
}
```

## Summary

| Concern | Rule |
|---------|------|
| Default rollback | RuntimeException + Error only |
| Checked failures | `rollbackFor = X.class` — explicitly |
| Never roll back | `noRollbackFor = ...` |
| Boundary | Service layer = business operation |
| readOnly | Hint + flush optimization, not a guard |
| After commit | `TransactionSynchronization.afterCommit` / `@TransactionalEventListener` |

Transactions are a contract: everything in the boundary commits or rolls back together. The three mistakes — checked exceptions committing, boundaries in the controller, side effects inside the transaction — are all preventable with deliberate `rollbackFor`, service-layer boundaries, and after-commit hooks for side effects.
