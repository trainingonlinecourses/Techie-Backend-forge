---
title: Building REST APIs
summary: Controllers, bean validation, error handling, pagination, and the layering that keeps APIs maintainable.
order: 4
minutes: 20
topics: [rest, validation, pagination, controllers, dto]
docs:
  - https://docs.spring.io/spring-boot/reference/web/index.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html
---

# Building REST APIs

## The layered shape of an API

```
Controller (HTTP, DTOs) → Service (business rules, transactions) → Repository (persistence)
     │                          │                                        │
     └── validation here        └── @Transactional here                  └── Spring Data
```

Controllers stay thin: parse/validate input, call one service method, map the result. Business rules live in services. This is the layering every Spring team follows.

## A complete controller

```java
@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountService service;

    @GetMapping
    public Page<AccountView> list(Pageable pageable) {
        return service.list(pageable);
    }

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

## Bean validation at the boundary

```java
public record CreateAccountRequest(
        @NotBlank @Size(min = 8, max = 34) String iban,
        @NotBlank String currency,
        @NotNull @DecimalMin("0.00") BigDecimal openingBalance,
        @Email String contactEmail) {}
```

With `@Valid` on the parameter, Spring runs the validator and `MethodArgumentNotValidException` fires → your `@RestControllerAdvice` returns 400 with per-field errors. **Validate at the API boundary; assume services are called correctly.**

## Pagination with Pageable

```java
@GetMapping
public Page<AccountView> list(@PageableDefault(size = 20, sort = "createdAt,desc") Pageable pageable) {
    return service.list(pageable);   // ?page=0&size=20&sort=iban,asc for free
}
```

```java
@Service
public class AccountService {
    public Page<AccountView> list(Pageable pageable) {
        return accounts.findAll(pageable).map(AccountView::from);
    }
}
```

Never return full tables without pagination; `Page` gives you `totalElements`, `totalPages`, and next/prev metadata.

## Error handling, one shape

```java
public record ApiError(String timestamp, int status, String error, String message, String path,
                       List<FieldError> fieldErrors) {
    public record FieldError(String field, String message) {}
}
```

All errors — validation, not-found, auth — return this shape with a correct HTTP status, via one `@RestControllerAdvice`. Clients learn one error contract.

## Status codes that matter

| Code | When |
|---|---|
| 200/201 | OK / Created |
| 204 | No content (DELETE) |
| 400 | Invalid input (validation) |
| 401 | Not authenticated |
| 403 | Authenticated, not authorized |
| 404 | Resource not found |
| 409 | Conflict (e.g. duplicate username) |
| 422 | Semantic error in valid input |
| 500 | Unexpected failure (never leak details) |

> **Why it matters (organizational view)** — A consistent API contract (naming, errors, pagination, status codes) is what lets dozens of clients and teams integrate without churn. Org standards: `/api` prefix, DTOs never entities, `@Valid` on every body, one error shape, pagination everywhere, and versioning (`/api/v1`) when breaking changes are possible.

## Key takeaways

- Thin controllers → services → repositories; transactions in services.
- `@Valid` + records make the boundary safe by default.
- `Pageable` gives pagination for free; never return unbounded lists.
- One `@RestControllerAdvice`, one `ApiError` shape, correct status codes.

**Official docs:** [Spring Boot web](https://docs.spring.io/spring-boot/reference/web/index.html) · [Controllers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html)
