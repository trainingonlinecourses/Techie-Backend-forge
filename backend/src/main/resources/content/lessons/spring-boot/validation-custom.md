---
title: Bean Validation and Custom Constraints — Beyond @NotNull
summary: @Valid vs @Validated, validation groups, custom constraint annotations with Validator implementation, nested object validation, and how organizations enforce data quality at the API boundary.
order: 30
minutes: 20
topics: [bean-validation, custom-constraint, @valid, @validated, validation-groups, nested-validation, hibernate-validator]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/web.html#web.servlet.spring-mvc.data-binding.validation
  - https://beanvalidation.org/2.0/spec/
---

# Bean Validation and Custom Constraints — Beyond @NotNull

## The concept

Bean Validation (JSR 380) is a standard for declarative data quality. You annotate fields, methods, or classes with constraints (`@NotNull`, `@Size`, `@Email`), and a validator checks them before your code runs.

Spring Boot ships with Hibernate Validator — the reference implementation. When you annotate a `@RequestBody` with `@Valid`, Spring automatically validates it and returns 400 Bad Request if constraints fail.

**The common mistake:** using only built-in annotations. Real applications need custom constraints for domain-specific rules: valid order states, currency codes, business hours, referential integrity.

## @Valid vs @Validated

| Annotation | Where it works | Supports groups? | Nested validation? |
|---|---|---|---|
| `@Valid` | Controller method parameters | ❌ | ✅ |
| `@Validated` | Controller method parameters, class-level | ✅ | ✅ (but loses method-level validation) |

Use `@Valid` for simple cases. Use `@Validated` when you need **validation groups** (e.g., create vs update have different rules).

## Custom constraint annotation

Define a custom constraint with `@Constraint`:

```java
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ValidOrderStateValidator.class)
public @interface ValidOrderState {
    String message() default "Invalid order state transition";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

The validator checks the business rule:

```java
public class ValidOrderStateValidator implements ConstraintValidator<ValidOrderState, String> {

    private static final Set<String> VALID_STATES = Set.of(
        "CREATED", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true;  // @NotNull handles null
        return VALID_STATES.contains(value.toUpperCase());
    }
}
```

```java
public record OrderRequest(
    @NotNull String customerId,
    @ValidOrderState String status,
    @Positive BigDecimal amount
) {}
```

## Validation groups

Different operations have different rules:

```java
public interface CreateGroup {}
public interface UpdateGroup {}

public record UserRequest(
    @NotBlank(groups = CreateGroup.class)   // required only on create
    String id,

    @NotBlank(groups = {CreateGroup.class, UpdateGroup.class})
    String email,

    @Size(min = 8, groups = CreateGroup.class)  // password required on create
    String password
) {}
```

```java
@PostMapping
public ResponseEntity<Void> create(@Validated(CreateGroup.class) @RequestBody UserRequest req) {
    // id, email, password all validated
}

@PutMapping("/{id}")
public ResponseEntity<Void> update(@PathVariable String id,
                                   @Validated(UpdateGroup.class) @RequestBody UserRequest req) {
    // only email validated — id comes from path, password not required
}
```

## Nested validation

`@Valid` cascades validation into nested objects:

```java
public record OrderRequest(
    @NotNull String customerId,
    @Valid @NotNull List<@Valid OrderLineItem> items,  // each item is validated
    @NotNull Address shippingAddress
) {}

public record OrderLineItem(
    @NotBlank String productId,
    @Positive int quantity,
    @Positive BigDecimal price
) {}

public record Address(
    @NotBlank String street,
    @NotBlank String city,
    @Pattern(regexp = "^[A-Z]{2}$") String state,  // two-letter state code
    @NotBlank String zipCode
) {}
```

When `OrderRequest` is validated, Spring validates `shippingAddress` and every item in `items` — recursively.

## How we use it in organizations

### Scenario 1: custom constraint for currency code

```java
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ValidCurrencyValidator.class)
public @interface ValidCurrency {
    String message() default "Invalid ISO 4217 currency code";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class ValidCurrencyValidator implements ConstraintValidator<ValidCurrency, String> {

    private static final Set<String> CURRENCIES = Set.of(
        "USD", "EUR", "GBP", "JPY", "INR", "CAD", "AUD"
    );

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true;
        return CURRENCIES.contains(value.toUpperCase());
    }
}
```

### Scenario 2: cross-field validation with a class-level constraint

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = ValidPaymentRequestValidator.class)
public @interface ValidPayment {
    String message() default "Invalid payment request";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class ValidPaymentRequestValidator implements ConstraintValidator<ValidPayment, PaymentRequest> {

    @Override
    public boolean isValid(PaymentRequest req, ConstraintValidatorContext context) {
        if (req == null) return true;

        // Cross-field rule: credit card payments must have a card token
        if ("CREDIT_CARD".equals(req.method()) && (req.cardToken() == null || req.cardToken().isBlank())) {
            return false;
        }

        // Cross-field rule: bank transfer must have routing number
        if ("BANK_TRANSFER".equals(req.method()) && (req.routingNumber() == null)) {
            return false;
        }

        return true;
    }
}
```

### Scenario 3: validation error response contract

```java
@RestControllerAdvice
public class ValidationExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationError> handleValidation(MethodArgumentNotValidException ex) {
        List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
            .map(fe -> new FieldError(fe.getField(), fe.getDefaultMessage()))
            .toList();

        return ResponseEntity.badRequest().body(new ValidationError("Validation failed", errors));
    }

    public record ValidationError(String message, List<FieldError> errors) {}
    public record FieldError(String field, String message) {}
}
```

```json
{
  "message": "Validation failed",
  "errors": [
    {"field": "email", "message": "must be a well-formed email address"},
    {"field": "password", "message": "size must be between 8 and 100"}
  ]
}
```

## Built-in constraints reference

| Annotation | Purpose |
|---|---|
| `@NotNull` / `@NotBlank` / `@NotEmpty` | Non-null, non-blank, non-empty |
| `@Size(min, max)` | String/collection size |
| `@Min` / `@Max` | Numeric range (inclusive) |
| `@Positive` / `@PositiveOrZero` | Positive number |
| `@Email` | Email format |
| `@Pattern(regexp)` | Regex match |
| `@Past` / `@Future` | Date must be in past/future |

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `@Valid` instead of `@Validated` for groups | Groups silently ignored |
| Forgetting `@Valid` on nested objects | Nested constraints skipped |
| Returning raw `ConstraintViolationException` | Leaks internal field names to client |
| Validating everything at the API layer only | Invalid data reaches the database |
| Over-validating (too many annotations) | Hard to maintain, confusing error messages |
