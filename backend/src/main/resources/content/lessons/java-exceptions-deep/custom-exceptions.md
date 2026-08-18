---
title: Custom Exceptions — Designing Failures That Mean Something
module: java-exceptions-deep
order: 3
minutes: 22
topics: ["custom exceptions", "exception design", "error codes", "exception wrapping", "causes"]
docs:
  - title: "Creating Exception Classes (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/create.html"
  - title: "Unchecked Exceptions — The Controversy (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/runtime.html"
---

# Custom Exceptions — Designing Failures That Mean Something

## The Concept: Why Not Just Throw RuntimeException?

You *can* throw `IllegalStateException("user not found")` everywhere and be done. But consider what happens six months later, when a new developer needs to handle failures: they must parse *string messages* to tell "user not found" from "user already exists" from "database unreachable." String matching is fragile, unreadable, and untypeable. The Java answer: **make failure a type.** A custom exception class turns "something went wrong" into "this specific thing went wrong," and gives the compiler, the IDE, and your `catch` blocks precise information to act on.

**The mental model:** built-in exceptions are like generic stamps ("INVALID", "NOT FOUND", "FAILED"). Custom exceptions are like pre-printed forms for your specific business: "ACCOUNT_LOCKED", "PAYMENT_DECLINED", "LESSON_NOT_AVAILABLE". Both convey failure; the custom form conveys *which* failure, with fields to carry the relevant data, and can be caught *selectively* — `catch (AccountLockedException e)` catches only that one, leaving every other failure to flow past untouched.

## When Should You Create a Custom Exception?

The rule of thumb: create one when **callers need to distinguish this failure from others by type** — to respond differently, to map it to a different HTTP status, to retry, or to surface a different user message. The decision is really about your *API contract*:

| Situation | What to use |
|---|---|
| Programming error (bad arg, null, illegal state) | Built-in unchecked: `IllegalArgumentException`, `NullPointerException`, `IllegalStateException` |
| Environmental failure with a standard type | Built-in checked: `IOException`, `SQLException` |
| A domain failure callers must handle differently | **Custom exception** |
| Infrastructure failure you'll wrap per layer | **Custom exception wrapping the cause** |

Creating an exception per *message* is over-engineering; creating one per *failure category that changes behavior* is good design. A banking app typically has `InsufficientFundsException`, `AccountLockedException`, `TransactionFailedException` — a handful, not hundreds.

## Building a Custom Exception, Step by Step

```java
// A checked custom exception: the compiler forces callers to plan for it.
public class AccountLockedException extends Exception {

    private final String accountId;   // domain data carried with the failure
    private final int lockoutMinutes;

    // Primary constructor: message + the domain fields.
    public AccountLockedException(String accountId, int lockoutMinutes) {
        super("Account " + accountId + " is locked for " + lockoutMinutes + " minutes");
        this.accountId = accountId;
        this.lockoutMinutes = lockoutMinutes;
    }

    // Convenience constructor that also wraps the root cause.
    public AccountLockedException(String accountId, int lockoutMinutes, Throwable cause) {
        super("Account " + accountId + " is locked for " + lockoutMinutes + " minutes", cause);
        this.accountId = accountId;
        this.lockoutMinutes = lockoutMinutes;
    }

    public String getAccountId() { return accountId; }
    public int getLockoutMinutes() { return lockoutMinutes; }
}
```

**Walking through it:** extending `Exception` makes this *checked* (callers must catch or declare it); extend `RuntimeException` instead if you want it unchecked. The class adds two domain fields, `accountId` and `lockoutMinutes`, captured at throw time. The first constructor builds a useful message from them and delegates to `super(message)`. The second adds the `Throwable cause` parameter and passes it to `super(message, cause)` — this is the *wrapping* pattern: when a lower-level failure (say, a database timeout) causes the account lock, the cause chain preserves the original exception for debugging. The getters let handlers act on the data: show a countdown, log the account id, notify security.

Why carry fields instead of just a message? Because a *typed* field is stable and queryable — `catch (AccountLockedException e) { e.getAccountId() }` works even if the message text changes; string-parsing the message does not.

## Throwing and Handling the Custom Exception

```java
public class LoginService {
    // The signature DECLARES the checked exception — part of the contract.
    public void login(String accountId, String password)
            throws AccountLockedException {

        if (isLocked(accountId)) {
            int remaining = lockoutMinutesLeft(accountId);
            throw new AccountLockedException(accountId, remaining);
        }
        // ... normal login logic
    }

    private boolean isLocked(String id) { return true; /* demo */ }
    private int lockoutMinutesLeft(String id) { return 15; /* demo */ }
}
```

And the caller handles it by type:

```java
try {
    loginService.login("acc-42", password);
    System.out.println("Welcome!");
} catch (AccountLockedException e) {
    // Type-based handling: we KNOW this is a lockout, not a bad password.
    System.out.println("Account " + e.getAccountId() +
                       " is locked. Try again in " + e.getLockoutMinutes() + " min.");
    // -> route to a "reset password / contact support" screen
} catch (BadCredentialsException e) {
    // A DIFFERENT custom type gets a DIFFERENT response.
    System.out.println("Wrong password. Try again.");
}
```

**Notice the payoff:** the two failure modes are handled by `catch` type, not by parsing text. The compiler *enforces* that callers at least acknowledge `AccountLockedException` (it's checked) — so the "forgot to handle lockout" bug class is eliminated. And a `catch (Exception e)` far upstream won't accidentally swallow this specific failure's data.

## Wrapping: The Multi-Layer Pattern

Real applications have layers: controller → service → repository. An `SQLException` from deep in the data layer should not leak its raw type (and stack) to the controller. The standard pattern — used heavily in Spring — is to **wrap at the boundary**:

```java
public class UserRepository {
    public User findById(long id) {
        try {
            // ... JDBC / JPA call that throws SQLException
            throw new java.sql.SQLException("connection refused");
        } catch (java.sql.SQLException e) {
            // Translate the low-level failure into a domain failure,
            // preserving the original as the CAUSE.
            throw new UserNotFoundException("User " + id + " not found", e);
        }
    }
}
```

`UserNotFoundException` is checked (extends Exception) or unchecked (extends RuntimeException) depending on the layer's contract — Spring convention is unchecked for data-access failures. The `cause` parameter keeps `getCause()` pointing at the `SQLException`, so logs still show the full chain: `UserNotFoundException ← SQLException ← connect timeout`.

**The rule:** each layer throws exceptions in *its own vocabulary*. The controller thinks in HTTP-friendly domain errors; the service in business rules; the repository in persistence terms. Wrapping is the translation layer — and it's exactly what lets a single `@RestControllerAdvice` map domain exceptions to clean HTTP responses with proper status codes and JSON bodies.

## Anti-Patterns to Avoid

1. **Swallowing:** `catch (Exception e) {}` — silently discarding failure. If you must ignore, at least log: `log.warn("Non-critical", e)`.
2. **Catching `Throwable` or `Error`:** you're claiming you can handle JVM death. You can't.
3. **Catching generic `Exception` when specific types are possible:** it hides which failure actually occurred and catches bugs you didn't intend to handle.
4. **Re-throwing the same exception without cause:** `catch (SQLException e) { throw new MyException(e.getMessage()); }` destroys the stack trace and the original type. Always pass `e` as the cause.
5. **Using exceptions for control flow:** `throw`/`catch` as a fancy `if/else`. Exceptions are for *exceptional* conditions — using them for expected logic is thousands of times slower and unreadable.
6. **Exception-per-message classes:** one class with a message field beats twenty classes differing only in text.

## Recap

Custom exceptions convert failures into typed, queryable domain concepts. Create one when callers must distinguish the failure by type; carry relevant data as fields, not just messages; support a `cause` constructor for wrapping across layers; and let each architectural layer speak its own failure vocabulary via wrap-and-rethrow. The reward is `catch` blocks that read like business rules, compiler-enforced handling for checked failures, and debugging sessions that start at the root cause instead of at a swallowed exception. Keep the set small, the names precise, and the causes always attached.
