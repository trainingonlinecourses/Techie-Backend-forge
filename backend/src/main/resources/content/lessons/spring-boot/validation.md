---
title: "Bean Validation — Reject Bad Data Before It Touches Your Code"
summary: "What Bean Validation is, how @Valid works, custom constraints, group validation, and how organizations use it to enforce data quality at the API boundary."
order: 54
minutes: 20
topics: [bean-validation, hibernate-validator, @valid, custom-constraints, validation-groups, jakarta-validation]
docs:
  - https://beanvalidation.org/2.0/spec/
  - https://docs.jboss.org/hibernate/validator/8.0/reference/htmlsingle/
---

## The Concept, From Zero

### What is Bean Validation?

**Bean Validation = automatic input checking.** It's a standard (Jakarta Bean Validation) that lets you declare rules on your data classes, and the framework checks them automatically.

Without validation:

**What this code does — step by step:**

1. BAD — no validation
2. user.name could be null, empty, or "a". User.email could be "not-an-email". User.age could be -5 or 999
3. Garbage in, garbage out — bugs everywhere

The same code, clean:

```java
@PostMapping("/users")
public User create(@RequestBody User user) {
    return userService.create(user);
}
```

With validation:

**What this code does — step by step:**

1. GOOD — validation at the boundary
2. @Valid triggers automatic validation. If name is blank → 400 Bad Request with error message. If email is invalid → 400 Bad Request with error message. If age < 0 → 400 Bad Request with error message. Only valid data reaches your service layer

The same code, clean:

```java
@PostMapping("/users")
public User create(@Valid @RequestBody User user) {
    return userService.create(user);
}
```

### The Basics — Built-in Annotations


**What this code does — step by step:**

1. ↑ Cannot be null, empty, or whitespace-only
2. ↑ Must match email format
3. ↑ Cannot be null AND must be > 0
4. ↑ Length must be between 8 and 100
5. ↑ Must match regex pattern
6. ↑ Must be between 1 and 999
7. ↑ Must be between 0.01 and 99,999.99

The same code, clean:

```java
public class CreateUserRequest {

    @NotBlank(message = "Name is required")
    String name;

    @NotBlank @Email(message = "Email must be valid")
    String email;

    @NotNull @Positive(message = "Age must be positive")
    Integer age;

    @Size(min = 8, max = 100, message = "Password must be 8-100 chars")
    String password;

    @Pattern(regexp = "^[A-Z]{2}\\d{4}$", message = "Code must be 2 letters + 4 digits")
    String code;

    @Min(value = 1, message = "Quantity must be at least 1")
    @Max(value = 999, message = "Quantity cannot exceed 999")
    int quantity;

    @DecimalMin(value = "0.01", message = "Price must be positive")
    @DecimalMax(value = "99999.99", message = "Price cannot exceed 99,999.99")
    BigDecimal price;
}
```

### Common Annotations Reference

| Annotation | Purpose | Example |
|------------|---------|---------|
| `@NotNull` | Not null | `@NotNull String name` |
| `@NotBlank` | Not null, not empty, not whitespace | `@NotBlank String name` |
| `@NotEmpty` | Not null, not empty (but whitespace OK) | `@NotEmpty List<String> tags` |
| `@Email` | Valid email format | `@Email String email` |
| `@Size` | Length/range check | `@Size(min=2, max=50) String name` |
| `@Min` / `@Max` | Integer range | `@Min(0) @Max(100) int score` |
| `@Positive` | Must be > 0 | `@Positive int count` |
| `@PositiveOrZero` | Must be >= 0 | `@PositiveOrZero int count` |
| `@Negative` | Must be < 0 | `@Negative int offset` |
| `@Pattern` | Regex match | `@Pattern(regexp="\\d+") String digits` |
| `@Past` | Must be in the past | `@Past LocalDate birthday` |
| `@Future` | Must be in the future | `@Future LocalDate expiryDate` |

### Custom Constraints

Create your own validation annotations:

// Step 1: Define the annotation
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PhoneNumberValidator.class)
public @interface PhoneNumber {
    String message() default "Invalid phone number";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

// Step 2: Implement the validator
public class PhoneNumberValidator implements ConstraintValidator<PhoneNumber, String> {
    private static final Pattern PHONE_PATTERN = 
        Pattern.compile("^\\+?[1-9]\\d{1,14}$");
    
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null) return true; // @NotNull handles null
        return PHONE_PATTERN.matcher(value).matches();
    }
}

// Step 3: Use it
public class ContactRequest {
    @PhoneNumber String phone;
    @NotBlank String name;
}

### Nested Validation

Validate objects inside objects:


**What this code does — step by step:**

1. ↑ @Valid triggers validation on Customer fields too
2. ↑ Each item in the list is also validated
3. `String notes;` — Optional, no validation
4. When you validate OrderRequest: - customer.name must not be blank. - customer.email must be valid. - Each item.productId must not be blank. - Each item.quantity must be positive. - etc.

The same code, clean:

```java
public class OrderRequest {
    @NotNull @Valid
    Customer customer;

    @NotEmpty @Valid
    List<OrderItem> items;

    String notes;
}

public class Customer {
    @NotBlank String name;
    @Email String email;
    @NotBlank String address;
}

public class OrderItem {
    @NotBlank String productId;
    @Positive int quantity;
    @PositiveOrZero BigDecimal price;
}
```

### Global Exception Handler

Handle validation errors gracefully:

@RestControllerAdvice
public class ValidationExceptionHandler {
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(
            MethodArgumentNotValidException ex) {
        
        Map<String, String> errors = new HashMap<>();
        
        ex.getBindingResult().getFieldErrors().forEach(error -> {
            errors.put(error.getField(), error.getDefaultMessage());
        });
        
        return ResponseEntity.badRequest().body(errors);
        // Returns: {"name": "Name is required", "email": "Email must be valid"}
    }
}

### Validation Groups

Validate different fields for different operations:


**What this code does — step by step:**

1. Define groups
2. `@NotBlank(groups = Create.class)` — Required only on create
3. `@NotBlank(groups = {Create.class, Update.class})` — Always required
4. `@NotBlank(groups = Create.class)` — Required only on create
5. Controller — use different groups

The same code, clean:

```java
public interface Create {}
public interface Update {}

public class UserRequest {
    @NotBlank(groups = Create.class)
    Long id;

    @NotBlank(groups = {Create.class, Update.class})
    String name;

    @NotBlank(groups = Create.class)
    @Size(min = 8, groups = Create.class)
    String password;
}

@PostMapping
public User create(@Validated(Create.class) @RequestBody UserRequest request) {
    return userService.create(request);
}

@PutMapping("/{id}")
public User update(@PathVariable Long id,
                   @Validated(Update.class) @RequestBody UserRequest request) {
    return userService.update(id, request);
}
```

### Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `@Valid` | Validation never runs | Add `@Valid` before `@RequestBody` |
| Validating in service layer | Late validation — data already processed | Validate at the API boundary (controller) |
| No global exception handler | Ugly error messages | Add `@RestControllerAdvice` handler |
| Using `@Valid` on non-JPA classes | Nothing happens | Use `@Validated` for non-JPA validation |
| Null values pass `@Min`/`@Max` | Null is allowed by numeric constraints | Add `@NotNull` separately |

### Line-by-Line Code Explanation


**What this code does — step by step:**

1. ↑ Java Record — immutable, auto-generates everything
2. ↑ Constraint: name cannot be null, empty, or whitespace-only. ↑ message = custom error message shown to client
3. ↑ Field type: String — the user's display name
4. ↑ Two constraints on the same field — BOTH must pass. ↑ @Email checks format: something@something.domain
5. ↑ Only validated when Create group is active. ↑ On Update, password can be null (user keeps existing password)
6. ↑ Optional field — if provided, must match E.164 format. ↑ null is allowed (phone is optional)

The same code, clean:

```java
public record CreateUserRequest(

    @NotBlank(message = "Name is required")

    String name,

    @NotBlank(message = "Email is required")
    @Email(message = "Must be a valid email address")

    String email,

    @NotBlank(groups = Create.class, message = "Password required")
    @Size(min = 8, max = 100, groups = Create.class, message = "8-100 characters")
    String password,

    @Pattern(regexp = "^\\+?[1-9]\\d{1,14}$", message = "Invalid phone")
    String phone
) {}
```

### Key Takeaways

1. **Always use `@Valid`** — validation doesn't run without it
2. **Validate at the API boundary** — catch bad data before it enters your system
3. **Use `@NotBlank` not `@NotNull`** — for strings, you usually want non-empty too
4. **Create custom constraints** — for business-specific rules
5. **Handle errors with `@RestControllerAdvice`** — return clean JSON errors
6. **Use validation groups** — different rules for create vs update

### Real-World Organization Scenario

A healthcare platform validates patient data with 20+ custom constraints: `@ValidPatientId`, `@ValidDosage`, `@ValidDateOfBirth`. They use validation groups to enforce different rules for `Admission` vs `Discharge` vs `Update` operations. The global exception handler returns structured error messages that the frontend displays inline next to each form field.

## References

- [Learn Java Online — interactive exercises](https://www.learnjavaonline.org/)
- [docs.spring.io/spring-boot/reference](https://docs.spring.io/spring-boot/reference/)
