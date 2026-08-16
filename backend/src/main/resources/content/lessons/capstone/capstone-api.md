---
title: Capstone — REST API & Error Handling
summary: Controllers, DTOs, validation and the uniform error contract in the payments API.
order: 3
minutes: 15
topics: [capstone, rest, dto, validation, error-handling]
capstone: true
docs:
  - https://docs.spring.io/spring-boot/reference/web/index.html
---

# Capstone — REST API & Error Handling

Open `projects/payments-api/src/main/java/com/example/payments/` and follow along.

## DTOs: records at the boundary

```java
package com.example.payments.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record CreateAccountRequest(
        @NotBlank @Pattern(regexp = "[A-Z]{2}[0-9A-Z]{8,32}", message = "invalid IBAN") String iban,
        @NotBlank @Pattern(regexp = "[A-Z]{3}", message = "invalid currency") String currency,
        @NotBlank String owner,
        @Min(0) Long openingBalanceCents) {}   // optional initial deposit
```

```java
public record AccountView(Long id, String iban, String currency, long balanceCents, String owner,
                          java.time.Instant createdAt) {
    public static AccountView from(Account a) {
        return new AccountView(a.getId(), a.getIban(), a.getCurrency(), a.getBalanceCents(),
                a.getOwner(), a.getCreatedAt());
    }
}
```

**Entities never cross the boundary** — services return views, controllers return views. The wire format is stable even when the entity changes.

## The controller

```java
package com.example.payments.account;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/accounts")
public class AccountController {

    private final AccountService accountService;

    public AccountController(AccountService accountService) {
        this.accountService = accountService;
    }

    @GetMapping
    public List<AccountView> list() {
        return accountService.listAll();
    }

    @GetMapping("/{iban}")
    public AccountView find(@PathVariable String iban) {
        return accountService.findByIban(iban);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AccountView create(@Valid @RequestBody CreateAccountRequest request) {
        return accountService.create(request);
    }
}
```

## The transfer endpoint

```java
@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    private final TransferService transferService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransferView transfer(@Valid @RequestBody CreateTransferRequest request) {
        return transferService.execute(request.fromIban(), request.toIban(),
                request.amountCents(), request.idempotencyKey());
    }
}
```

```java
public record CreateTransferRequest(
        @NotBlank String fromIban,
        @NotBlank String toIban,
        @NotNull @Min(1) Long amountCents,
        @NotBlank String idempotencyKey) {}
```

## The uniform error contract

```java
package com.example.payments.common;

import java.time.Instant;
import java.util.List;

public record ApiError(String timestamp, int status, String error, String message, String path,
                       List<FieldError> fieldErrors) {
    public record FieldError(String field, String message) {}
}
```

```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(AccountNotFound.class)
    ResponseEntity<ApiError> notFound(AccountNotFound ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(ApiError.of(404, "Not Found", ex.getMessage(), req.getRequestURI()));
    }

    @ExceptionHandler({InsufficientFundsException.class, SelfTransferException.class, DuplicateTransferException.class})
    ResponseEntity<ApiError> conflict(RuntimeException ex, HttpServletRequest req) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiError.of(409, "Conflict", ex.getMessage(), req.getRequestURI()));
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

Every failure — validation, not-found, insufficient funds, duplicate idempotency key — comes back as the **same JSON shape** with the right status code.

## The status code map in this API

| Situation | Status |
|---|---|
| Valid create | 201 |
| Validation error | 400 with field errors |
| Unknown account | 404 |
| Insufficient funds / self transfer / duplicate key | 409 |
| Missing/expired token | 401 |
| Wrong role | 403 |

> **Why it matters (organizational view)** — The API contract is the team's promise to its consumers. Stable DTOs, `@Valid` at the boundary, and one error shape mean clients (web, mobile, partners) write one error handler and it works for every endpoint.

## Key takeaways

- DTO records at the boundary; entities stay inside.
- `@Valid` + records = validation in one place.
- One `ApiError` shape, one `@RestControllerAdvice`, correct status codes.
- Controllers are thin; all logic is in services.

**Official docs:** [Spring Boot web](https://docs.spring.io/spring-boot/reference/web/index.html)
