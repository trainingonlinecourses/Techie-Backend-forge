---
title: Method Validation — @Validated on Services and Param Constraints
summary: Jakarta Bean Validation on method parameters and return values, @Validated, groups, and the scenarios where service-layer validation beats field-only checks.
order: 24
minutes: 17
topics: [method-validation, validated, constraint, param-validation, return-value-validation, validation-groups, jakarta-validation]
docs:
  - https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html
  - https://jakarta.ee/specifications/bean-validation/
---

# Method Validation — @Validated on Services and Param Constraints

## The concept: constraints on methods, not just fields

Most developers know Bean Validation on **DTO fields** (`@NotNull`, `@Email` on a record checked by `@Valid` in a controller). **Method validation** applies the same constraints to **method parameters and return values** — so a service can declare its *contract* and the framework enforces it:

```java
@Service
@Validated                              // enables constraint checking on method params/returns
public class OrderService {
    public Order placeOrder(@NotNull @Valid OrderRequest request,
                            @NotBlank String customerId) {
        // request validated (nested @Valid), customerId must be non-blank
        ...
    }

    @Size(max = 10)
    public List<Order> recentOrders(@Min(1) @Max(100) int limit) {
        ...   // return value checked: at most 10 items; limit must be 1..100
    }
}
```

Spring Boot auto-configures the method-validation interceptor when a Bean Validation provider (e.g., `spring-boot-starter-validation` with Hibernate Validator) is on the classpath — so `@Validated` + constraints "just work" on services.

## Parameters and return values — both sides of the contract

- **Parameter constraints** — validate what callers may pass: `@NotNull`, `@NotBlank`, `@Min`/`@Max`, `@Pattern`, `@Size`, and `@Valid` to cascade into nested objects.
- **Return-value constraints** — validate what the method promises to return: `@NotNull`, `@Size`, `@Valid` on the returned object.
- **Cross-parameter constraints** — `@ScriptAssert` or a custom class-level constraint to check relations between parameters (start ≤ end, for example).

The value: **the service self-documents and self-defends** — a caller passing a bad argument gets a `ConstraintViolationException` instead of a confusing downstream failure.

## How we use it in an organization: the scenarios

**Scenario 1 — the multi-entry-point service.** The same service method is called by a controller, a message consumer, and a batch job. Field validation on the DTO only fires in the controller path; the consumer and batch callers bypass it. **Method validation enforces the contract at the service boundary for every caller:**

```java
@Service @Validated
public class OrderService {
    public void placeOrder(@NotNull @Valid PlaceOrderCommand cmd) { ... }
    // controller POST /api/orders AND kafka listener AND batch import — all validated
}
```

**Scenario 2 — validation groups for partial updates.** The same DTO validated differently by operation:

```java
public interface CreateGroup {}
public interface UpdateGroup {}

@Service @Validated
public class CustomerService {
    public void create(@Validated(CreateGroup.class) @Valid CustomerDto dto) { ... }
    public void update(@Validated(UpdateGroup.class) @Valid CustomerDto dto) { ... }
}
// @NotNull(groups = CreateGroup.class) on email → required on create, optional on update
```

**Scenario 3 — return-value contracts.** A repository or client wrapper guarantees non-null results:

```java
public interface ProductClient {
    @NotNull
    Product fetch(@NotBlank String sku);   // "never returns null" — enforced, not hoped
}
```

**Scenario 4 — programmatic validation for reused rules.** When you need the same rule outside a bean method, `Validator` works directly:

```java
@Service
public class ImportService {
    private final Validator validator;      // jakarta.validation.Validator

    public void importRow(String raw) {
        ParsedRow row = parser.parse(raw);
        Set<ConstraintViolation<ParsedRow>> violations = validator.validate(row);
        if (!violations.isEmpty()) throw new ImportException(violations);
        repo.save(row);
    }
}
```

## How it differs from controller validation

| | Controller `@Valid` | Service `@Validated` |
|---|---|---|
| Where | request body binding (Spring MVC) | any bean method (AOP interceptor) |
| Failure | `MethodArgumentNotValidException` → 400 | `ConstraintViolationException` |
| Coverage | HTTP entry point only | every caller: HTTP, messaging, batch |
| Groups | `@Validated(Group)` on the param | group on the method |

Both are used in production: **controller validation** gives clean 400s with field messages for the API; **service method validation** is the backstop for all other entry points and the cross-cutting contract. For a JPA entity, `@Valid` in services also catches state before `save`.

## Pitfalls

- **`@Validated` must be on the bean (class)** — missing it, and constraints on methods silently never run. For `@Validated` on an *interface*, both interface and implementation need it in some setups.
- **Constraints on private methods are ignored** — method validation only applies to *public* (proxied) methods; self-invocation bypasses it (same proxy rule as transactions).
- **`ConstraintViolationException` must be mapped** — an unhandled violation becomes a 500; a `@RestControllerAdvice` handler should translate it to 400 with the field messages.
- **Over-constraining can backfire** — a too-strict return constraint breaks legitimate values at runtime; keep return constraints to genuinely invariant promises.
- **Groups that are never passed** — a constraint in a group that no caller activates is dead; test both groups.

## Key takeaways

- Method validation enforces parameter and return contracts on any bean method — all entry points, not just HTTP.
- `@Validated` on the service + constraints on params/returns; `@Valid` cascades into nested objects.
- Validation groups adapt one DTO to multiple operations (create vs update).
- Map `ConstraintViolationException` to 400 in a `@RestControllerAdvice`.
- Controller validation for clean API errors; method validation as the contract for every caller.
