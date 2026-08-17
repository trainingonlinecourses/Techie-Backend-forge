---
title: Forms, Validation and Data Binding
module: spring-webmvc-advanced
order: 3
minutes: 20
topics: ["@ModelAttribute", "form binding", "@Valid", "BindingResult", "custom validators", "error rendering"]
docs:
  - title: "Data binding and validation"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-ann-modelattrib-method-args"
---

# Forms, Validation and Data Binding

REST APIs validate `@RequestBody`. Classic MVC apps bind **form data** to model objects with `@ModelAttribute` and render validation errors back to the user. Both paths share the same Bean Validation engine — this lesson covers the full form lifecycle.

## Binding Form Data

```html
<form method="post" action="/register">
  <input name="email" type="email">
  <input name="password" type="password">
  <button>Register</button>
</form>
```

```java
@PostMapping("/register")
public String register(@Valid @ModelAttribute RegistrationForm form,
                       BindingResult bindingResult,
                       Model model) {
    if (bindingResult.hasErrors()) {
        return "register";          // re-render the form with errors
    }
    userService.register(form);
    return "redirect:/welcome";
}
```

Spring binds `request.getParameter("email")` → `form.email`, runs validation, and populates `BindingResult`. The order matters: **`BindingResult` must immediately follow the `@Valid` parameter**, or Spring throws a 500 instead of binding errors.

## The BindingResult Contract

- `hasErrors()` — any field or global errors?
- `getFieldErrors("email")` — per-field errors with codes/messages.
- `rejectValue("email", "error.email")` — programmatic errors (e.g., duplicate email).

```java
@PostMapping("/register")
public String register(@Valid @ModelAttribute RegistrationForm form,
                       BindingResult bindingResult, Model model) {

    if (userService.emailExists(form.getEmail())) {
        bindingResult.rejectValue("email", "error.email.duplicate",
            "This email is already registered");
    }
    if (bindingResult.hasErrors()) {
        return "register";
    }
    userService.register(form);
    return "redirect:/welcome";
}
```

## Bean Validation on the Form

```java
public record RegistrationForm(
    @NotBlank @Email String email,
    @NotBlank @Size(min = 8, max = 64) String password,
    @NotBlank String firstName,
    @NotNull @Min(13) Integer age
) {}
```

Full constraint toolbox:

| Constraint | Use |
|-----------|-----|
| `@NotBlank` / `@NotEmpty` | Strings / collections |
| `@Size(min, max)` | Length / size bounds |
| `@Email` | Format check |
| `@Min` / `@Max` | Numeric bounds |
| `@Pattern(regexp)` | Custom format |
| `@Positive` / `@PositiveOrZero` | Sign |
| `@Past` / `@Future` | Temporal bounds |
| `@Valid` (nested) | Cascade into nested objects |

## Custom Constraint Validator

```java
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = PhoneNumberValidator.class)
public @interface ValidPhone {
    String message() default "Invalid phone number";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}
```

```java
public class PhoneNumberValidator
        implements ConstraintValidator<ValidPhone, String> {

    private static final Pattern PHONE =
        Pattern.compile("^\\+?[1-9]\\d{1,14}$");   // E.164

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        if (value == null || value.isBlank()) return true;   // @NotBlank handles null
        return PHONE.matcher(value).matches();
    }
}
```

## Grouped Validation

Different rules per operation on the same form:

```java
public class AccountForm {
    public interface Create {}
    public interface Update {}

    @NotBlank(groups = Create.class)
    @Size(min = 3, groups = {Create.class, Update.class})
    private String username;

    @NotBlank(groups = Create.class)
    private String password;
}
```

```java
@PostMapping("/accounts")
public String create(@Validated(AccountForm.Create.class) @ModelAttribute AccountForm form,
                     BindingResult bindingResult) { ... }
```

Registration requires the password; an update doesn't touch it.

## Server-Side Validation Is Mandatory

Client-side validation is UX; server-side validation is **security**. Never trust the browser:

```java
// ❌ Trusting client input
public void register(RegistrationForm form) { ... }

// ✅ Always validate server-side, even with client-side checks
@PostMapping("/register")
public String register(@Valid @ModelAttribute RegistrationForm form,
                       BindingResult bindingResult) {
    ...
}
```

## Rendering Errors in Thymeleaf

```html
<form th:action="@{/register}" th:object="${form}" method="post">
  <input type="text" th:field="*{email}">
  <p th:if="${#fields.hasErrors('email')}" th:errors="*{email}">
    Email error
  </p>
  <button>Register</button>
</form>
```

Thymeleaf's `th:errors` renders the first error message; `th:field` re-populates the submitted value (so users don't retype everything on error).

## Programmatic Validation (non-controller)

Validation isn't only in controllers — validate anywhere:

```java
@Service
public class RegistrationService {

    private final jakarta.validation.Validator validator;

    public void register(RegistrationForm form) {
        Set<ConstraintViolation<RegistrationForm>> violations =
            validator.validate(form);
        if (!violations.isEmpty()) {
            throw new ValidationException(violations.stream()
                .map(ConstraintViolation::getMessage).toList());
        }
        // ...
    }
}
```

## Testing Form Binding

```java
@SpringBootTest
@AutoConfigureMockMvc
class RegistrationFormTest {

    @Autowired MockMvc mockMvc;

    @Test
    void validFormRegisters() throws Exception {
        mockMvc.perform(post("/register")
                .param("email", "a@b.com")
                .param("password", "s3cret!!")
                .param("firstName", "Ada")
                .param("age", "30"))
            .andExpect(status().is3xxRedirection());
    }

    @Test
    void invalidFormRerendersWithErrors() throws Exception {
        mockMvc.perform(post("/register")
                .param("email", "not-an-email")
                .param("password", "x")
                .param("age", "10"))
            .andExpect(status().isOk())              // form re-rendered
            .andExpect(model().attributeHasFieldErrors("form", "email"))
            .andExpect(model().attributeHasFieldErrors("form", "password"));
    }
}
```

## Summary

| Concern | Mechanism |
|---------|-----------|
| Bind form → object | `@ModelAttribute` |
| Validate | `@Valid` + Bean Validation constraints |
| Capture errors | `BindingResult` (must follow `@Valid`) |
| Programmatic errors | `bindingResult.rejectValue(...)` |
| Custom rules | `@Constraint` + `ConstraintValidator` |
| Different rules per op | Validation groups (`@Validated(Create.class)`) |
| Rendering | `th:errors` / `th:field` |
| Security | Server-side validation always |

The form lifecycle is a loop: bind, validate, re-render on error, redirect on success. Get the loop right — including the `BindingResult` ordering rule — and forms become one of the most reliable parts of the app.
