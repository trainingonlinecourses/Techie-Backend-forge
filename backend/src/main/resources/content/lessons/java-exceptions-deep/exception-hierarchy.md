---
title: The Exception Hierarchy — Throwable, Error, and Exception
module: java-exceptions-deep
order: 1
minutes: 23
topics: ["exception hierarchy", "Throwable", "Error", "checked exceptions", "unchecked exceptions"]
docs:
  - title: "Exceptions (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/index.html"
  - title: "Throwable (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Throwable.html"
---

# The Exception Hierarchy — Throwable, Error, and Exception

## The Concept: Failure Is Data, Not Chaos

When a program fails, the worst thing it can do is fail *silently* — corrupt data, skip a step, and pretend everything is fine. Java's answer to failure is a structured object: an **exception**. When something goes wrong, the program "throws" a description of the problem (a Java object), and the runtime carries that object up the call stack until something "catches" it. Crucially, this is not chaos — it's a *data structure with rules*, and every exception in Java lives in one well-defined family tree.

**The mental model:** imagine a restaurant kitchen. A cook who burns a dish doesn't just stand there silently serving charred food — they call out the problem. The shout travels up the chain (line cook → sous chef → head chef) until someone who can handle it hears it. The shout is the exception object; the chain is the call stack; the person who handles it is the catch block. If nobody hears the shout, the kitchen shuts down (the program crashes).

## The Family Tree

Every exception object is an instance of `Throwable` or one of its subclasses. There are exactly three meaningful branches:

```
Throwable
├── Error                         — the JVM is in trouble; you don't catch these
│   ├── OutOfMemoryError
│   ├── StackOverflowError
│   └── NoClassDefFoundError
└── Exception                     — your program has a problem
    ├── RuntimeException          — unchecked: compiler doesn't force handling
    │   ├── NullPointerException
    │   ├── IllegalArgumentException
    │   ├── IndexOutOfBoundsException
    │   └── ClassCastException
    └── (other Exception subclasses) — checked: compiler forces handling
        ├── IOException
        ├── SQLException
        └── InterruptedException
```

**Why does this hierarchy exist?** Because different kinds of failure demand different responses:

- **`Error`** subclasses mean the *platform* itself is in trouble: memory exhausted (`OutOfMemoryError`), stack overflow, missing classes. By convention you never catch `Error` — there's usually nothing sensible your code can do, and attempting recovery can hide catastrophic conditions. `Error` is the JVM saying "the building is on fire," not "one dish was burned."

- **`Exception`** subclasses mean *your program's* logic or environment has a problem. These are the failures you design responses for.

- **`RuntimeException`** (and its subclasses) are the *unchecked* exceptions. The compiler does **not** force you to declare or catch them, because they represent programming errors — bugs — that shouldn't happen in correct code: dereferencing `null`, indexing past the end of an array, casting to the wrong type. You fix the bug, not the exception handling.

- **Checked exceptions** (all `Exception` subclasses *except* `RuntimeException`) are the opposite: the compiler *requires* you to either catch them or declare them (`throws`). These represent *anticipated, recoverable* failures of the environment: a file is missing, the network dropped, the database is down. The compiler is enforcing a contract: "this operation can fail in a way you should plan for — plan for it."

## Reading the Hierarchy in Code

Let's see what this means with a tiny program that trips several of these:

```java
public class HierarchyDemo {
    public static void main(String[] args) {
        // 1. A RuntimeException: dereferencing null.
        String name = null;
        try {
            System.out.println(name.length());   // NullPointerException!
        } catch (NullPointerException e) {
            System.out.println("Caught NPE: " + e.getMessage());
        }

        // 2. A checked exception: the compiler FORCES us to handle
        //    InterruptedException (thrown by Thread.sleep).
        try {
            Thread.sleep(10);                    // throws InterruptedException
        } catch (InterruptedException e) {
            // Restore the interrupted status and give up politely.
            Thread.currentThread().interrupt();
            System.out.println("Interrupted while sleeping");
        }
    }
}
```

**Walking through it:** the first `try` block throws `NullPointerException`, a `RuntimeException`. Notice the code *compiles* even without the try/catch — unchecked. We add the catch to demonstrate the flow: the thrown object travels up, matches the catch clause's type, and the handler runs. The second block calls `Thread.sleep(10)`, which *declares* `throws InterruptedException` — a checked exception. If you removed the try/catch, this program would **not compile**. The compiler literally refuses to ship code that ignores a declared checked failure. That's the checked/unchecked contract in action.

## Why Checked Exceptions Exist (and Why Opinions Differ)

Checked exceptions are Java's most controversial feature. Their defenders say: a file-read API *must* force you to think about "what if the file doesn't exist?" — otherwise failures slip silently into production. Their critics (including many language designers) say the forcing leads to boilerplate `try/catch` blocks that either swallow exceptions (`catch (Exception e) {}` — the worst line in Java) or clutter every method signature with `throws`.

**Where the industry has landed:** modern Java practice is more nuanced than the strict checked/unchecked split. The pragmatic rules used by most Spring, Kafka, and microservice codebases:

1. **Use checked exceptions for failures the caller is expected to handle** — missing file, unreachable server, closed stream.
2. **Use unchecked (`RuntimeException`) subclasses for programming errors** — invalid arguments, nulls, illegal state — and for failures that *no* caller can reasonably handle at the point of failure.
3. **Wrap and rethrow across layers**: a low-level `SQLException` should become a domain-meaningful `UserNotFoundException` as it crosses boundaries — but wrap the cause so the original is preserved.
4. **Never swallow exceptions.** An empty catch block converts a diagnosable failure into a mystery.

Spring, notably, largely abandons checked exceptions for its own abstractions (`DataAccessException`, `JdbcTemplate` methods, and so on are unchecked) — precisely because forcing every caller to handle a database hiccup produces noise without safety. The takeaway: the hierarchy is a *tool*, and matching the tool to the failure mode is the skill.

## The Three Parts of Every Exception Object

When you catch an exception, you hold an object with three useful pieces:

```java
catch (IOException e) {
    String message  = e.getMessage();      // human-readable description
    Throwable cause = e.getCause();        // the wrapped underlying failure
    e.printStackTrace();                   // full stack trace for logs
}
```

- **`getMessage()`** — the short description ("File not found: config.yml").
- **`getCause()`** — the *original* exception that this one wraps, enabling the chain `SQLException ← DataAccessException ← ServiceException` to be walked back to the root cause.
- **The stack trace** — the ordered list of method calls from the throw site up to the catch site. This is the single most valuable debugging artifact Java produces; learn to read it top-down (where the throw happened) rather than from the bottom.

## Recap

All Java failures are `Throwable` objects in a strict hierarchy: `Error` for platform catastrophes (don't catch), `Exception` for program failures, with `RuntimeException` and its subclasses unchecked (bugs — don't force handling) and everything else checked (environmental failures — the compiler forces planning). The hierarchy isn't bureaucracy: it encodes *what kind of failure this is and who is responsible for responding to it*. Master the three branches, respect the checked/unchecked contract, wrap-and-rethrow across layers, and never swallow — and exception handling stops being boilerplate and starts being the safety net of your design.
