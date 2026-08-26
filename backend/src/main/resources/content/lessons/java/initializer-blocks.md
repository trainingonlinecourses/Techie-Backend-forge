---
title: Initializer Blocks & Initialization Order — The Hidden Constructor Code
summary: Instance initializer blocks, static initializer blocks, the exact execution order rules, and why organizations mostly avoid them in favor of clearer alternatives.
order: 77
minutes: 15
topics: [initializer-blocks, static-block, initialization-order, field-initializers]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/initial.html
---

## The Concept, From Zero

Java gives you **four** places to initialize an object's fields — most beginners know only two:

1. Field initializers: `int x = 5;`
2. Constructors
3. **Instance initializer blocks** (the forgotten one)
4. **Static initializer blocks**

An initializer block is a naked `{ ... }` sitting inside a class body:

```java
public class ConnectionPool {
    private static Properties defaults;    // shared across ALL instances → belongs to the class

    static {                               // STATIC block: runs ONCE, when the class first loads
        defaults = new Properties();
        defaults.setProperty("timeout", "30");
        System.out.println("Class loaded, defaults prepared");
    }

    private final Socket socket;

    {                                      // INSTANCE block: runs before EVERY constructor body
        System.out.println("Instance initializing");
        this.socket = openSocket();        // logic common to all constructors goes here
    }

    public ConnectionPool(String host) {
        System.out.println("Constructor(host) runs AFTER the instance block");
        // host-specific setup only
    }

    public ConnectionPool(String host, int port) {
        System.out.println("This constructor also ran the instance block above first");
        // port-specific setup only
    }
}
```

Line by line:

| Element | When it runs | Runs how many times |
|---|---|---|
| `static { ... }` | Once, at class-load time (first use of the class) | once per JVM |
| `{ ... }` (instance) | Before each constructor's body | every `new` |
| constructor body | after instance blocks | every `new` |

## The Exact Order (with inheritance)

For `new Child()` where both classes have fields, blocks, and constructors:

```
1. Parent static init          ┐
2. Child  static init          ┘ once per class load
3. Parent field initializers + parent instance blocks (in source order)
4. Parent constructor body
5. Child  field initializers + child instance blocks
6. Child  constructor body
```

Proof program:

```java
class Base {
    { log("2. base instance block"); }                 // appears before base constructor output
    Base() { log("3. base constructor"); }
}

class Derived extends Base {
    int x = setup();                                   // field initializer
    int setup() { log("4. derived field init"); return 1; }
    { log("5. derived instance block"); }
    Derived() { log("6. derived constructor"); }
}
// Output order: (statics first if any), then 2,3,4,5,6
```

## What Static Blocks Are Actually Used For

```java
public class DatabaseDriver {
    static {
        try {
            DriverManager.registerDriver(new DriverImpl());   // side-effect registration
            System.out.println("Driver registered");
        } catch (SQLException e) {                            // checked exceptions ARE allowed here
            throw new ExceptionInInitializerError(e);         // wrap: init failures become this type
        }
    }
}
```

Classic uses:
- Registering JDBC drivers (older JDBC versions).
- Loading native libraries: `System.loadLibrary("native")`.
- Building immutable static maps/lookup tables.

## Why Organizations Limit Their Use

Initializer blocks have real drawbacks:

1. **Invisibility** — a `{ }` between methods is easy to miss; readers assume constructors hold all setup.
2. **Ordering fragility** — interleaving of field initializers and blocks follows *source order*, so reordering lines silently changes behavior.
3. **Exception opacity** — failures surface as `ExceptionInInitializerError`, hiding the real cause from stack-trace scanners.

Modern replacements teams prefer:

| Instead of... | Use |
|---|---|
| Static block building a map | Static factory method or enum |
| Complex static init | Lazy holder idiom (`private static class Holder`) |
| Shared instance-block logic | A private `init()` method called by every constructor |

## Real Organizational Scenarios

**Scenario 1 — The cryptic startup crash.** An app died with `ExceptionInInitializerError` and no obvious cause; root cause was a config file read inside a static block that failed when the working directory differed in Docker. Team rule afterwards: no I/O in static blocks — configuration belongs to the framework lifecycle.

**Scenario 2 — Legacy SDK maintenance.** Enterprise teams maintaining old JDBC-based SDKs still *must* understand static blocks because third-party drivers rely on them — you'll see `Class.forName("com.mysql.Driver")` whose entire purpose is to trigger the driver's static registration block.

**Scenario 3 — Constant lookup tables.** A shipping service builds `Map<String, BigDecimal> zoneRates` once in a static initializer. Correct and safe — it's immutable, cheap, and needs no I/O — showing that the tool isn't evil, just easily misused.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Assuming blocks run "before fields" | Wrong ordering assumptions | They interleave with field initializers in strict source order |
| Heavy work / I/O in static blocks | `ExceptionInInitializerError` masks real errors | Move work into lazy factories or framework hooks |
| Instance blocks used for constructor sharing | Hard-to-trace setup flow | Prefer a private helper method invoked explicitly |
| Forward-referencing fields in initializers | Compile error ("illegal forward reference") | Declare before you initialize |
