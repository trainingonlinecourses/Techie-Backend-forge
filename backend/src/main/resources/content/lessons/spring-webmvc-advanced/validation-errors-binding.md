---
title: Validation Errors & Data Binding — From Request to Validated Object
summary: @Valid + BindingResult, the field-error model, message codes, and the error-response shapes that frontends actually parse.
order: 13
minutes: 17
topics: [bindingresult, validation-errors, field-errors, message-codes, @Valid, error-response]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/modelattrib-methods.html
  - https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html
---

# Validation Errors & Data Binding — From Request to Validated Object

## The concept: binding then validating

When a controller takes `@Valid @RequestBody OrderRequest request` (or `@Valid @ModelAttribute`), Spring does two phases:

1. **Data binding** — map the request JSON/form onto the object's fields (type conversion, `@JsonCreator`/setters). A conversion failure (a string where a number goes) produces a `BindException`-style field error.
2. **Validation** — run Bean Validation constraints (`@NotBlank`, `@Email`, `@Min`...) over the bound object. Violations become **field errors** with a *code* and *message*.

On any error, the framework throws `MethodArgumentNotValidException` (request-body) or `BindException` (model-attribute) — and the @RestControllerAdvice turns it into a 400 with a structured body (see the error-handling lesson). The shape of that body is the contract your frontend parses, so it deserves deliberate design.

## The field-error model

Each violation has:

- **`field`** — `"customer.email"` (path into nested objects)
- **`defaultMessage`** — the resolved message ("must not be blank")
- **`code`** — the constraint key (`NotBlank`, `Email`, `Size`)
- **`rejectedValue`** — what was rejected (careful: may contain PII or huge values — often omitted from responses)

```java
@RestControllerAdvice
public class ValidationHandler {
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationError> invalid(MethodArgumentNotValidException e) {
        List<FieldErrorDto> fields = e.getBindingResult().getFieldErrors().stream()
            .map(fe -> new FieldErrorDto(fe.getField(), fe.getDefaultMessage()))
            .toList();
        return ResponseEntity.badRequest()
            .body(new ValidationError("VALIDATION_ERROR", fields));
    }

    public record ValidationError(String code, List<FieldErrorDto> fields) {}
    public record FieldErrorDto(String field, String message) {}
}
```

**The frontend contract:** the SPA maps `fields` to form inputs (`input name="customer.email"` gets the message). The org standard is: **always return the field path + a human message, never raw exception text.**

## Message codes — internationalized, constraint-driven

`defaultMessage` comes from **message-code resolution**: for a `@NotBlank` on `customer.name`, Spring tries in order:

1. `NotBlank.customer.name` — constraint + path
2. `NotBlank.name` — constraint + property
3. `NotBlank.java.lang.String` — constraint + type
4. `NotBlank` — constraint only
5. the annotation's own `message` default

With a `messages.properties` (or i18n setup), you get custom, localized messages:

```properties
NotBlank.customer.name=Customer name is required
Email=Please enter a valid email address
Size=Value must be between {min} and {max} characters
```

This is the same `MessageSource` as i18n (see the i18n lesson) — validation messages participate in locale-aware rendering.

## @ModelAttribute binding errors — the form-flow variant

```java
@PostMapping("/register")
public String register(@Valid @ModelAttribute("form") RegisterForm form,
                       BindingResult binding) {
    if (binding.hasErrors()) {
        return "register";                       // re-render the form with field errors
    }
    userService.register(form);
    return "redirect:/login";                    // PRG — see the redirect lesson
}
```

With `@ModelAttribute`, the `BindingResult` must immediately follow the validated parameter — the framework validates, and *you* decide the outcome (re-render vs redirect), unlike the `@RequestBody` path where the advice handles it.

## How we use it in an organization: the scenarios

**Scenario 1 — the SPA form contract.** Every validation error returns `{ field, message }` pairs; the frontend maps them under inputs. Adding a constraint (e.g., `@Pattern` on a phone) changes the message via `messages.properties` — no frontend change needed if the message text is the contract.

**Scenario 2 — cross-field validation.** Bean Validation's field constraints can't check "end ≥ start". Options: a class-level custom constraint, `@ScriptAssert`, or a `@AssertTrue` method on the DTO:

```java
public record BookingRequest(Instant start, Instant end) {
    @AssertTrue(message = "end must be after start")
    public boolean isRangeValid() { return end.isAfter(start); }
}
```

**Scenario 3 — group-based create vs update.** `@Validated(CreateGroup.class)` on the controller param activates only the create-group constraints (see the method-validation lesson for the service-side version).

**Scenario 4 — sanitizing instead of rejecting.** For free-text fields where rejecting breaks UX (bios, comments), teams validate *length* (`@Size`) strictly and sanitize *content* on output (escaping) rather than rejecting — validation policy per field, documented.

## Pitfalls

- **`BindingResult` must directly follow the `@Valid` parameter** — in any other position Spring raises a 500 "An Errors/BindingResult argument is expected to be declared immediately after the model attribute".
- **Global vs field errors** — `getGlobalErrors()` (class-level/cross-field) and `getFieldErrors()` are separate lists; the response shape should include both or the contract misses cross-field messages.
- **`rejectedValue` leakage** — echoing the rejected value can leak PII or huge payloads into error responses; usually omit it.
- **Message-code typos** — an unresolvable code falls back to the annotation default silently; test the message files.
- **Validation on the wrong layer** — DTO validation at the edge (good) vs validating every domain mutation (duplicated); pick one policy per codebase (see the method-validation lesson).

## Key takeaways

- Binding converts the request; validation runs constraints; failures become field errors with codes + messages.
- Return `{ field, message }` pairs from the advice — the frontend form contract.
- Message codes (`NotBlank.field`) enable custom, localized validation messages via `MessageSource`.
- `@ModelAttribute` + `BindingResult` gives the form-flow control; `@RequestBody` delegates to the advice.
- Handle cross-field rules with class-level constraints or `@AssertTrue` methods.
