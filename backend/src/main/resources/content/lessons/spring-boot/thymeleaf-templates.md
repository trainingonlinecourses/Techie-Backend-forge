---
title: Thymeleaf — Server-Side HTML Templates in Spring Boot
summary: How Thymeleaf renders HTML on the server with natural templating, th:text vs th:utext security, iteration and conditionals, form binding to objects, and when organizations choose it over a JS frontend.
order: 52
minutes: 24
topics: [thymeleaf, server-side-rendering, templates, form-binding, fragments]
docs:
  - https://www.thymeleaf.org/doc/tutorials/3.1/usingthymeleaf.html
  - https://docs.spring.io/spring-boot/reference/web/servlet.html
---

## The Concept, From Zero

So far this curriculum has served JSON from REST endpoints, rendered by a React frontend. But plenty of production systems — admin panels, internal tools, email templates, marketing pages — use **server-side rendering** instead: the *server* produces complete HTML, and the browser just displays it.

**Thymeleaf** is Spring Boot's default engine for that. You write normal HTML files; Thymeleaf adds `th:*` attributes that the server replaces at render time:

```html
<!-- templates/greeting.html -->
<html xmlns:th="http://www.thymeleaf.org">
<body>
    <h1 th:text="${username}">placeholder</h1>   <!-- server swaps in the real value -->
    <p th:text="'Today is ' + ${#temporals.day(today)}">date here</p>
</body>
</html>
```

The clever part ("natural templating"): open the file directly in a browser without the server and it still looks reasonable — you see "placeholder". That makes designer/developer collaboration possible.

### The controller side

```java
@Controller                                     // NOT @RestController — returns view names, not data
public class GreetingController {

    @GetMapping("/greeting")
    public String greeting(Model model) {       // Model = bag of key/value pairs for the template
        model.addAttribute("username", "Amy");  // template reads this as ${username}
        model.addAttribute("today", LocalDate.now());
        return "greeting";                      // logical view name → templates/greeting.html
    }
}
```

Line by line:

| Line | Why |
|---|---|
| `@Controller` | Return values are treated as template names (with `@ResponseBody` or `@RestController` they'd be raw JSON) |
| `Model model` | Spring injects it; anything you add becomes available via `${...}` in the template |
| `return "greeting"` | View resolver maps it to `src/main/resources/templates/greeting.html` |

## Escaping — `th:text` vs `th:utext`

```html
<p th:text="${comment}"></p>     <!-- <script>alert(1)</script> renders as harmless TEXT -->
<p th:utext="${comment}"></p>    <!-- UNescaped: script actually executes = XSS vulnerability -->
```

`th:text` HTML-escapes by default — this is your XSS shield. Use `th:utext` only for content you explicitly trust (e.g., your own pre-sanitized rich text).

> 🔒 **Org rule seen everywhere:** code review rejects any `th:utext` on user-supplied content. This single attribute choice is one of the most common stored-XSS vectors in Java web apps.

## Iteration & Conditionals

```java
@GetMapping("/orders")
public String orders(Model model) {
    model.addAttribute("orders", orderService.findAll());
    return "order-list";
}
```

```html
<tr th:each="order : ${orders}">                        <!-- loop over the list -->
    <td th:text="${order.id}">1</td>
    <td th:text="${#numbers.formatDecimal(order.total, 1, 'COMMA', 2, 'POINT')}">9.99</td>
    <td>
        <span th:if="${order.status == T(Status).PAID}"      <!-- conditional element -->
              class="badge green" th:text="#{status.paid}">Paid</span>
        <span th:unless="${order.status == T(Status).PAID}"
              class="badge red">Pending</span>
    </td>
</tr>

<p th:if="${#lists.isEmpty(orders)}">No orders found.</p>   <!-- empty-state handling -->
```

- `th:each="order : ${orders}"` — classic for-each over the model attribute.
- `th:if / th:unless` — render-or-skip elements.
- `#{status.paid}` — message bundle lookup (i18n), separate syntax from `${model}`.
- `T(Status)` — SpEL type reference for comparing enum constants.

## Form Binding — Objects Round-Tripping

```java
@GetMapping("/register")
public String showForm(Model model) {
    model.addAttribute("user", new RegisterForm());   // backing object for the form
    return "register";
}

@PostMapping("/register")
public String register(@Valid @ModelAttribute("user") RegisterForm user,  // binds submitted fields
                       BindingResult errors) {                             // collects validation failures
    if (errors.hasErrors()) {
        return "register";             // re-render form WITH error messages attached
    }
    userService.create(user);
    return "redirect:/welcome";        // POST-redirect-GET pattern prevents double submits
}
```

```html
<form th:action="@{/register}" th:object="${user}" method="post">
    <input type="text"  th:field="*{email}" />
    <p th:if="${#fields.hasErrors('email')}" th:errors="*{email}" class="error"></p>
    <button type="submit">Sign up</button>
</form>
```

- `th:object="${user}"` — the whole form is bound to the backing object.
- `th:field="*{email}"` — asterisk syntax = property of the bound object; also auto-fills the input's value on re-render.
- `th:errors` — prints the validation message Bean Validation produced (`@NotBlank`, `@Email`, ...).
- `redirect:/welcome` — after a successful POST, redirect so refresh doesn't resubmit.

## Fragments — Reusable Chunks

```html
<!-- fragments/layout.html -->
<nav th:fragment="navbar">...</nav>
```

```html
<div th:replace="~{fragments/layout :: navbar}"></div>   <!-- paste the fragment here -->
```

Fragments are how template projects get a shared navbar/footer without a JS framework.

## Real Organizational Scenarios

**Scenario 1 — Internal admin tools.** A logistics company runs 14 internal tools built with Thymeleaf + Spring Security. Reasoning: no npm pipeline, no SPA state management, server-side sessions, and a change deploys as one jar. For CRUD-heavy back-office software this is dramatically cheaper than React.

**Scenario 2 — Transactional emails.** Order confirmation emails are Thymeleaf templates rendered with `TemplateEngine.process(...)` then sent via SMTP — same templating skills reused outside the browser.

**Scenario 3 — SEO-critical public pages.** Product listing pages must be crawlable with fast first paint. Server-rendered Thymeleaf ships complete HTML instantly; an SPA would need extra SSR infrastructure for the same result.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Using `@RestController` for page controllers | Browser shows raw string like `"greeting"` | Plain `@Controller` for views |
| `th:utext` on user content | Stored XSS | Always `th:text`; sanitize before ever using utext |
| Forgetting the no-arg constructor on form DTOs | Cryptic binding 500s | Forms need default construction (or records with matching binder) |
| Rendering after POST without redirect | Refresh resubmits the form | POST-redirect-GET pattern |
