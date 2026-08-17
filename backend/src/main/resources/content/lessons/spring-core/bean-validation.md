---
title: Bean Validation with Jakarta Validation
summary: Declarative validation with @Valid, @NotNull and friends — jakarta.validation annotations, custom constraints, groups and error handling in REST APIs.
order: 11
minutes: 15
topics: [bean validation, jakarta validation, constraints, validation groups, error handling]
docs:
  - https://docs.spring.io/spring-framework/reference/core/validation.html
  - https://docs.spring.io/spring-boot/reference/io/validation.html
---

# Bean Validation with Jakarta Validation

## Why declarative validation

Hand-written validation (`if (x == null) throw ...`) scatters rules across the code and drifts from the API contract. Bean Validation (JSR-380 / Jakarta Validation, implemented by **Hibernate Validator**) keeps rules **on the field, next to the model**:

```java
public record CreateOrderRequest(
    @NotBlank String customer,
    @Email String contact,
    @NotNull @Positive BigDecimal amount,
    @Size(min = 1, max = 50) String note
) {}
```

Spring Boot autoconfigures a `Validator` (`LocalValidatorFactoryBean`) the moment `spring-boot-starter-validation` is on the classpath — no config needed.

## The core constraints

| Annotation | Validates |
|---|---|
| `@NotNull` / `@Null` | reference is / isn't null |
| `@NotEmpty` / `@NotBlank` | collection/string non-empty / string has non-whitespace |
| `@Size(min, max)` | length / size bounds (strings, collections, maps, arrays) |
| `@Min` / `@Max` / `@Positive` / `@Negative` / `@DecimalMin` | numeric bounds |
| `@Email` | string looks like an email |
| `@Pattern(regexp = ...)` | full-string regex match |
| `@Past` / `@PastOrPresent` / `@Future` / `@FutureOrPresent` | dates relative to now |
| `@Valid` | cascade into nested objects / collections of objects |

Note the trap: `@NotNull` vs `@NotEmpty` vs `@NotBlank` — blank means *whitespace-only*, which `@NotEmpty` allows.

## Triggering validation

In a `@RestController`, validate the request body and let Spring produce a 400 with the violations:

```java
@PostMapping("/orders")
ResponseEntity<Order> create(@Valid @RequestBody CreateOrderRequest req) { ... }

@GetMapping("/orders")
List<Order> list(@RequestParam @Min(1) @NotNull Integer page) { ... }  // method params too
```

`@Validated` on the class enables method-parameter and path-variable validation. Failures throw `MethodArgumentNotValidException` (body) or `ConstraintViolationException` (params).

## Custom constraints

When built-ins don't fit, write a constraint + validator pair:

```java
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = StrongPasswordValidator.class)
public @interface StrongPassword {
    String message() default "password must contain a digit and a symbol";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class StrongPasswordValidator implements ConstraintValidator<StrongPassword, String> {
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
        return value != null && value.matches("(?=.*\\d)(?=.*[!@#$%]).{8,}");
    }
}
```

## Validation groups

Groups let one class carry different rules for different flows (create vs. update):

```java
public interface OnCreate {}
public interface OnUpdate {}

@NotNull(groups = OnCreate.class)          // required on create
@Null(groups = OnUpdate.class)             // must not be sent on update
Long id;

// later:
@Validated(OnCreate.class) ... // select which group Spring applies
```

## Error responses

Default 400 bodies expose internals; map violations to a clean DTO with `@RestControllerAdvice`:

```java
@RestControllerAdvice
public class ValidationAdvice {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    Map<String, String> handle(MethodArgumentNotValidException ex) {
        return ex.getBindingResult().getFieldErrors().stream()
            .collect(Collectors.toMap(FieldError::getField, FieldError::getDefaultMessage));
    }
}
```

For `ConstraintViolationException` use `ex.getConstraintViolations()` — the API differs between the two exception types.

## Key takeaways

- Put constraints on the model, validate at the boundary with `@Valid @RequestBody`.
- Know the null family: `@NotNull` → `@NotEmpty` → `@NotBlank` (reference → collection → text).
- Custom constraints = `@Constraint` + a `ConstraintValidator`; groups handle create-vs-update.
- Translate violations into a stable JSON error shape in one `@RestControllerAdvice`.

Official docs: [Spring Validation](https://docs.spring.io/spring-framework/reference/core/validation.html) · [Spring Boot Validation](https://docs.spring.io/spring-boot/reference/io/validation.html)
