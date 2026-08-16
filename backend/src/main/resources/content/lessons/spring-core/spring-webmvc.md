---
title: Spring MVC & the Servlet Stack
summary: DispatcherServlet, controllers, argument resolution, message converters and exception handling — the request lifecycle.
order: 9
minutes: 18
topics: [mvc, dispatcherservlet, controllers, rest]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html
---

# Spring MVC & the Servlet Stack

## The request lifecycle

```
HTTP request
  → Tomcat (servlet container)
  → Filter chain (security, CORS, logging, ...)
  → DispatcherServlet
       → HandlerMapping      (URL + method → controller method)
       → HandlerAdapter      (invoke; resolve method arguments)
       → Interceptors        (preHandle → controller → postHandle)
       → @RestControllerAdvice (on exception)
       → HttpMessageConverters (serialize return → JSON)
  → HTTP response
```

```java
@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountService service;

    @GetMapping("/{iban}")
    public AccountView find(@PathVariable String iban) {
        return service.findByIban(iban);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountView create(@Valid @RequestBody CreateAccountRequest req) {
        return service.create(req);
    }
}
```

## Argument resolution (what the framework fills in for you)

Spring resolves method parameters automatically: `@PathVariable`, `@RequestParam`, `@RequestBody`, `@RequestHeader`, `@AuthenticationPrincipal`, `Pageable`, `HttpServletRequest`, and more. Controllers stay thin — no parsing, no binding code.

## JSON via message converters

`@RestController` + Jackson = automatic JSON. `HttpMessageConverters` map request/response bodies. Jackson's rules that matter in review:

```java
record AccountView(String iban, Money balance, @JsonFormat(shape = STRING) BigDecimal amount) {}
// - ISO-8601 for dates (JavaTimeModule)
// - @JsonIgnore for fields that must never leak (password hashes!)
// - DTOs, never entities, over the wire
```

## Error handling: one place, one shape

```java
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    ResponseEntity<ApiError> notFound(NotFoundException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(404, "Not Found", ex.getMessage(), req.getRequestURI()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiError> validation(MethodArgumentNotValidException ex, HttpServletRequest req) {
        List<FieldError> errors = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> new FieldError(e.getField(), e.getDefaultMessage()))
                .toList();
        return ResponseEntity.badRequest()
                .body(ApiError.of(400, "Bad Request", "Validation failed", req.getRequestURI(), errors));
    }
}
```

## Filters vs interceptors

| | Filter | Interceptor |
|---|---|---|
| Layer | Servlet (before DispatcherServlet) | Spring MVC (after HandlerMapping) |
| Sees | Raw request/response | Handler + ModelAndView |
| Use | Security, CORS, request logging | Authz per handler, view prep |

```java
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestLoggingFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        long start = System.nanoTime();
        chain.doFilter(req, res);
        long ms = (System.nanoTime() - start) / 1_000_000;
        log.info("{} {} -> {} ({}ms)", req.getMethod(), req.getRequestURI(),
                res.getStatus(), ms);
    }
}
```

> **Why it matters (organizational view)** — MVC is the contract your APIs are built on. Teams standardize: thin controllers (no business logic), DTOs in/out, `@Valid` at the boundary, one `@RestControllerAdvice` for uniform errors, and filters for cross-cutting HTTP concerns. Understanding the pipeline (filters → DispatcherServlet → interceptors → converters) explains most "where do I hook X?" questions.

## Key takeaways

- DispatcherServlet routes requests: mapping → invocation → conversion.
- Thin controllers + argument resolution; `@Valid` on request bodies.
- One global exception handler; DTOs over the wire, never entities.
- Filters for HTTP-level concerns; interceptors for handler-level.

**Official docs:** [Web MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html) · [Controllers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html)
