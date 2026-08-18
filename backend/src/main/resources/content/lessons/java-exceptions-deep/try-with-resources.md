---
title: Try-with-Resources — Safe Resource Management
module: java-exceptions-deep
order: 2
minutes: 24
topics: ["try-with-resources", "AutoCloseable", "resource leak", "suppressed exceptions", "finally"]
docs:
  - title: "Try-with-resources (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html"
  - title: "AutoCloseable (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/AutoCloseable.html"
---

# Try-with-Resources — Safe Resource Management

## The Concept: Who Closes the Door?

File handles, network sockets, database connections — Java calls these **resources**, and every one of them is a *limited, shared, kernel-backed thing*. Your operating system allows only so many open files per process; databases allow only so many connections. If your code opens a resource and never closes it, you **leak** it: the OS eventually refuses new opens, the database pool exhausts, and your application starts failing in baffling ways — "Too many open files," connection timeouts, hangs. The leak is invisible in tests (small programs rarely hit limits) and devastating in production (long-running servers hit limits constantly).

The classic, error-prone way to close resources is `finally`:

```java
BufferedReader reader = null;
try {
    reader = new BufferedReader(new FileReader("data.txt"));
    String line = reader.readLine();
    System.out.println(line);
} finally {
    // finally ALWAYS runs — even if the try block threw.
    if (reader != null) {
        reader.close();          // but close() can itself throw IOException!
    }
}
```

**Why this is fragile:** three separate things can go wrong. First, `close()` throws a checked `IOException` that itself needs handling. Second, if `readLine()` throws and then `close()` also throws, the *second* exception silently replaces the first — you lose the original failure, and debugging becomes archaeology. Third, you must remember the null-check and the finally block *every single time* — and with nested resources (a file reader wrapping a stream wrapping a socket), the nesting explodes into pyramids of try/finally.

Java 7 gave us the tool that makes all of this vanish: **try-with-resources**.

## The Mechanism: Try-with-Resources

```java
import java.io.BufferedReader;
import java.io.FileReader;
import java.io.IOException;

public class TryWithResourcesDemo {
    public static void main(String[] args) {
        // The resource is DECLARED inside the try's parentheses.
        // Java guarantees close() runs when the block exits — normally
        // OR via exception — in reverse order of declaration.
        try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
            String line = reader.readLine();
            System.out.println("First line: " + line);
        } catch (IOException e) {
            System.out.println("Problem reading the file: " + e.getMessage());
        }
        // At this point the file is ALREADY closed — no finally needed.
    }
}
```

**Walking through it, line by line:**

- `try (BufferedReader reader = new BufferedReader(new FileReader("data.txt")))` — the parentheses after `try` declare resources. The **only** requirement: the resource type must implement `AutoCloseable` (which `BufferedReader`, `FileReader`, `Connection`, `Statement`, `ResultSet`, `Socket`, and thousands of others do). That interface declares a single method, `close()`.

- The compiler rewrites this into a hidden try/finally for you: it inserts `reader.close()` in a finally block, in **reverse order** of declaration (so if you open `a` then `b`, `b` closes before `a` — correct dependency order).

- The `catch` and optional `finally` blocks work exactly as before; the automatic close happens *before* the catch runs. So after the block, the file is guaranteed closed whether the read succeeded, failed with `IOException`, or failed with a `RuntimeException`.

## What About Two Exceptions at Once? Suppressed Exceptions

The subtle case: the try block throws an `IOException` (say, the disk hiccuped mid-read), and **then** `close()` also throws. Which one does the caller see?

In the old finally style, the close exception replaced the original — bad. In try-with-resources, Java does something clever: the *primary* exception (from the try body) propagates, and any exceptions thrown by `close()` are attached to it as **suppressed exceptions**.

```java
try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
    throw new IOException("read failed");      // primary failure
} catch (IOException e) {
    System.out.println("Primary:   " + e.getMessage());
    for (Throwable s : e.getSuppressed()) {     // close() failures land here
        System.out.println("Suppressed: " + s.getMessage());
    }
}
```

The `getSuppressed()` array is where you find close-time failures — they're preserved for debugging instead of stomping on the real error. This is why logs of try-with-resources code show the true root cause with "Suppressed:" lines beneath it.

## Multiple Resources in One try

```java
try (FileInputStream in = new FileInputStream("in.dat");
     FileOutputStream out = new FileOutputStream("out.dat")) {
    byte[] buffer = new byte[4096];
    int read;
    while ((read = in.read(buffer)) != -1) {
        out.write(buffer, 0, read);
    }
} catch (IOException e) {
    System.out.println("Copy failed: " + e.getMessage());
}
```

Both resources close automatically, **in reverse order** — `out` first, then `in`. That ordering matters: you want the destination flushed and closed before you release the source. A file copy with zero explicit close calls — this is the everyday power of the construct.

## Can I Still Use finally? Yes — for Cleanup, Not Closing

try-with-resources doesn't forbid a `finally` block; it just makes it unnecessary for *resource closing*. Use `finally` for cleanup that isn't a closable resource:

```java
try (Connection conn = dataSource.getConnection();
     PreparedStatement ps = conn.prepareStatement(sql)) {
    // ... work
} catch (SQLException e) {
    log.error("DB failure", e);
} finally {
    // Non-AutoCloseable cleanup, e.g., release a lock or log timing
    metrics.record();
}
```

The JDBC `Connection`, `Statement`, and `ResultSet` are all `AutoCloseable`, so the `try (...)` does the closing — the `finally` is purely for your own bookkeeping.

## What About Resources You Can't Put in the Parentheses?

Rarely, you'll meet a resource that is created *inside* the try body (not in the declaration) — try-with-resources can't auto-close it because the compiler needs the resource declared in the parentheses. The fix: declare it in the parentheses anyway:

```java
// WRONG: reader is created inside the body — no auto-close.
try {
    BufferedReader reader = new BufferedReader(new FileReader("f.txt"));
    // ... work — but reader leaks if this throws!
} catch (IOException e) { }

// RIGHT: declare in the parentheses.
try (BufferedReader reader = new BufferedReader(new FileReader("f.txt"))) {
    // ... work — reader is auto-closed
} catch (IOException e) { }
```

If the resource genuinely can only exist after some logic, wrap that logic in a helper method that returns the resource, and call the helper inside the parentheses: `try (BufferedReader reader = openReader()) { ... }`.

## Writing Your Own AutoCloseable

Implementing `AutoCloseable` is a one-method interface — this is how you give *your* classes the same safety:

```java
public class ApiConnection implements AutoCloseable {
    private boolean open = true;

    public void send(String payload) {
        if (!open) throw new IllegalStateException("Connection is closed");
        System.out.println("Sending: " + payload);
    }

    @Override
    public void close() {
        if (open) {
            open = false;
            System.out.println("Connection closed — resources released");
        }
    }

    public static void main(String[] args) {
        try (ApiConnection conn = new ApiConnection()) {
            conn.send("hello");
        }   // close() called automatically here
    }
}
```

Note the guard inside `close()` — it makes close idempotent (safe to call twice). That's a good habit: try-with-resources guarantees `close()` is called once, but defensive double-close protection costs nothing.

## Recap

Resources are scarce kernel-level things, and leaking them is the classic invisible production bug. try-with-resources makes the compiler generate correct closing for you: declare `AutoCloseable` resources in the parentheses, and `close()` runs automatically — normally and on exceptions — in reverse declaration order. When both the body and `close()` throw, the body's exception propagates and the close failure is preserved as a *suppressed* exception instead of destroying the original. Prefer it over manual try/finally for every closable resource, and implement `AutoCloseable` in your own classes that own external resources. The result is shorter code that is also *more* correct — the best kind of refactoring.
