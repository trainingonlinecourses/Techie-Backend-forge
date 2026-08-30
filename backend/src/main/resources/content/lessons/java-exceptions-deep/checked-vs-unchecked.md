---
title: Checked vs Unchecked — When the Compiler Forces Your Hand
module: java-exceptions-deep
order: 5
minutes: 25
topics: ["checked exceptions", "unchecked exceptions", "throws clause", "exception design", "Spring conventions"]
docs:
  - title: "The Catch or Specify Requirement (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/catchOrDeclare.html"
  - title: "Unchecked Exceptions — The Controversy (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/runtime.html"
summary: Every method in Java has an implicit contract: "what can go wrong here, and who deals with it?" Checked and unchecked exceptions are the two ways J...
---

# Checked vs Unchecked — When the Compiler Forces Your Hand

## The Concept: The Compiler as Enforcer of Failure Planning

Every method in Java has an implicit contract: "what can go wrong here, and who deals with it?" Checked and unchecked exceptions are the two ways Java encodes that contract, and the difference is enforced by the compiler itself.

**Checked exceptions** — every `Exception` subclass that is *not* a `RuntimeException` — trigger the **catch-or-specify requirement**: code that calls a method declaring a checked exception must either catch it or declare it in its own `throws` clause. The compiler *refuses to compile* code that ignores them. The message to the programmer is: "this operation can fail in a way you should anticipate — you are not allowed to forget."

**Unchecked exceptions** — `RuntimeException` and its subclasses (plus `Error`s) — carry no such requirement. The compiler lets them fly through any method without declaration. The message: "this is a programming error or an unrecoverable condition; you don't plan for it, you fix the code."

The naming is precise: **checked** = the compiler checks that you handled it; **unchecked** = the compiler does not check.

## The Two Sides in Action

```java
import java.io.*;

public class CheckedDemo {
    // THROWS A CHECKED EXCEPTION — the signature must say so.
    public static String readConfig() throws IOException {
        // FileReader / readLine throw IOException — a checked exception.
        try (BufferedReader reader = new BufferedReader(new FileReader("app.properties"))) {
            return reader.readLine();
        }
        // Without try-with-resources + catch, this method would NOT compile
        // unless it declares "throws IOException" — which it does.
    }

    // THROWS AN UNCHECKED EXCEPTION — no declaration needed.
    public static int divide(int a, int b) {
        if (b == 0) {
            throw new IllegalArgumentException("division by zero");
        }
        return a / b;
    }

    public static void main(String[] args) {
        // CALLING readConfig() FORCES handling — try/catch or throws.
        try {
            String line = readConfig();
            System.out.println("Config: " + line);
        } catch (IOException e) {
            System.out.println("Could not read config: " + e.getMessage());
        }

        // Calling divide() needs NO handling — IllegalArgumentException
        // is unchecked. The compiler won't complain if you ignore it.
        int result = divide(10, 2);
        System.out.println("Result: " + result);
    }
}
```

**Walking through it:** `readConfig` touches the file system, and the file API's methods *declare* `throws IOException`. Because `IOException` is checked, every caller must acknowledge it — here via try/catch. Remove the catch *and* the `throws` and the program won't compile; that's the compiler forcing you to plan for "the file might not exist." `divide` throws `IllegalArgumentException` — unchecked — so callers compile cleanly even though the method can fail. The compiler's stance: a missing file is an environmental reality you must design for; passing zero as a divisor is a bug in your code that you must fix.

## The Deep Reason: Who Can Recover?

The philosophical core: **checked exceptions are for failures the caller can reasonably do something about.** The file may exist on your machine and not on the server; the caller might have a fallback. The network may drop; the caller might retry. These failures are *part of the environment*, and the signature documents them so callers can plan.

Unchecked exceptions are for failures where **no caller can meaningfully recover at the point of failure**: `NullPointerException` means there's a bug to fix; `IllegalArgumentException` means someone passed bad data — the right response is to fix the caller, not to catch-and-continue. If you catch a `NullPointerException` and keep going, you're not handling a failure, you're papering over a bug.

## The Controversy: Why Many Modern Libraries Prefer Unchecked

Java's designers (and C# designers, who reversed the decision) learned that the checked/unchecked line is hard to draw in practice, and that *over-checking* has a cost: it pushes `try/catch` boilerplate into every layer, encourages "catch and swallow" to silence the compiler, and turns signatures into noise (`throws SQLException, IOException, ParseException`). 

The result — visible throughout the Spring ecosystem — is a strong drift toward unchecked exceptions for *infrastructure* failures:

- Spring's `DataAccessException` (wrapping JDBC/Hibernate failures) is **unchecked**.
- Spring's `JdbcTemplate`, `RestTemplate`, and `JmsTemplate` translate checked platform exceptions into unchecked ones.
- `@Transactional` machinery propagates runtime exceptions to trigger rollback; checked exceptions do **not** roll back by default — a sharp edge many developers hit.
- Mockito, Jackson, and most modern libraries likewise use unchecked exceptions.

Why is that OK? Because a database hiccup deep in a repository is usually *not* something the caller can handle at the point of failure — the service layer above will translate it, and the controller will map it to a 503. Forcing every intermediate method to declare `throws SQLException` adds noise without adding safety. The modern consensus: **use checked exceptions for failures the immediate caller is expected to handle meaningfully; use unchecked for bugs and for failures that will be handled far up the stack.**

## The Two Conventions You'll Actually Meet

**The classic (pre-2005 era, JDK APIs) convention:** checked for recoverable environmental failures — `IOException`, `SQLException`, `InterruptedException`. The JDK is full of it, and you must live with it when calling those APIs (or wrap them).

**The modern framework convention (Spring et al.):** unchecked for infrastructure failures, with translation at boundaries. When you see `JdbcTemplate.query(...)` throwing `DataAccessException` with no `throws` in sight, that's this convention working.

Your own code gets to choose — and the tie-breaker is *who handles it*:

```java
// CHECKED — the immediate caller is expected to handle this specifically:
public class PaymentService {
    public void refund(String txnId) throws InsufficientBalanceException { ... }
    // Callers MUST decide: can I refund? Present an error? Retry?
}

// UNCHECKED — a bug or a far-up-the-stack failure:
public class Config {
    public int timeout() {
        String raw = System.getenv("APP_TIMEOUT");
        if (raw == null) throw new IllegalStateException("APP_TIMEOUT is not set");
        return Integer.parseInt(raw);
    }
    // No caller needs to catch this; the app's startup failure handler owns it.
}
```

## The Sharp Edges

1. **`@Transactional` rollback asymmetry.** In Spring, an unchecked exception thrown inside a `@Transactional` method triggers rollback automatically; a *checked* exception does not (unless you add `rollbackFor = SomeCheckedException.class`). This bites people constantly: they throw a checked business exception, the transaction *commits* half-written data. Know your framework's default and set `rollbackFor` explicitly when your checked exceptions are meant to abort.

2. **The "throws everything" signature.** `public void m() throws Exception` is a red flag: it forces every caller to handle `Exception`, erasing the specificity that made checked exceptions valuable. Narrow your throws to what actually can happen.

3. **Lambda friction.** Functional interfaces like `Runnable` and `Function` declare *no* checked exceptions, so you can't `throw new IOException` inside a lambda without wrapping it in a runtime exception. This is a practical reason libraries lean unchecked: checked exceptions fight the functional style.

4. **The InterruptedException special case.** It's checked, and the correct response when you can't propagate it is to restore the interrupt flag: `Thread.currentThread().interrupt();` — never swallow it silently, or your threads stop responding to cancellation.

## A Decision Checklist for Your Own Exceptions

- Can the *immediate* caller meaningfully respond (different message, retry, fallback, different status)? → **Checked.**
- Is it a programming error that should never happen in correct code? → **Unchecked** (and fix the code).
- Will it be handled far up the stack (global handler, error boundary)? → **Unchecked**.
- Does it cross a framework boundary where the framework's convention is unchecked (Spring data access, messaging)? → **Unchecked**, wrap the cause.
- Does your API contract *promise* callers will handle it? → **Checked**, and design the handling.

## Recap

Checked exceptions are the compiler enforcing "plan for this failure": they must be caught or declared, and they suit failures the immediate caller can act on. Unchecked exceptions are bugs or far-up-the-stack failures that no local handler should own. Modern frameworks — Spring first among them — have drifted toward unchecked for infrastructure failures, translating at boundaries, which is why `JdbcTemplate` throws `DataAccessException` with no `throws` clause. Decide by asking *who handles this and can they meaningfully respond*; set `rollbackFor` explicitly around `@Transactional`; and never let the compiler's enforcement become an excuse to swallow. The checked/unchecked split isn't bureaucracy — it's the language giving you a tool to encode failure responsibility, and the skill is choosing the right tool per failure.
