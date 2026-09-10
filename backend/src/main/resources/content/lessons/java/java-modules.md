---
title: Java Platform Module System (JPMS) — Java 9+ Modules
summary: What modules solve (the JAR hell), module-info.java anatomy, automatic vs named modules, and how organizations modularize large codebases. Beginner-friendly with line-by-line code.
order: 38
minutes: 20
topics: [JPMS, modules, module-info.java, requires, exports, automatic module, module path, encapsulation]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/java-platform-module-system.html
  - https://openjdk.org/projects/jigsaw/
---

# Java Platform Module System (JPMS) — Java 9+ Modules

## What are Java Modules? (From Zero)

Before Java 9, the entire JDK was one giant package — you could access anything from anywhere. This caused problems:

1. **JAR Hell**: Two libraries using the same package name but different classes → conflicts
2. **No encapsulation**: You could `sun.misc.Unsafe` your way into anything
3. **Slow startup**: The JVM had to load the entire JDK even if you only used `java.lang.String`

Java 9 introduced the **Platform Module System (JPMS)** — a way to divide code into modules that declare what they **provide** (export) and what they **need** (requires).

Think of it like an apartment building:
- Each apartment (module) has a public entrance (exported packages)
- Private rooms inside (non-exported packages — invisible to other modules)
- A list of neighbors they depend on (requires)

---

## The Module Declaration

Every module has a `module-info.java` at the root of its source tree:


**What this code does — step by step:**

1. File: src/main/java/module-info.java
2. `module com.myapp.orders {` — Module name
3. === WHAT THIS MODULE NEEDS ===
4. `requires java.sql;` — Needs JDBC APIs
5. `requires java.net.http;` — Needs HttpClient
6. `requires spring.context;` — Needs Spring DI
7. `requires spring.web;` — Needs Spring MVC
8. `requires static org.slf4j;` — Compile-only dependency (optional)
9. === WHAT THIS MODULE PROVIDES ===
10. `exports com.myapp.orders.api;` — Public API — other modules can use this
11. `exports com.myapp.orders.model;` — Public models. Note: com.myapp.orders.internal is NOT exported — private to this module
12. === SERVICE PROVIDERS ===
13. `provides com.myapp.common.spi.PaymentProcessor` — Implements this service interface
14. `with com.myapp.orders.StripePaymentProcessor;` — The implementation class
15. === OPENS (for reflection — Spring needs this) ===
16. `opens com.myapp.orders.model;` — Allow reflection on these classes
17. `opens com.myapp.orders.service;` — Spring can inject into these

The same code, clean:

```java
module com.myapp.orders {

    requires java.sql;
    requires java.net.http;
    requires spring.context;
    requires spring.web;
    requires static org.slf4j;

    exports com.myapp.orders.api;
    exports com.myapp.orders.model;

    provides com.myapp.common.spi.PaymentProcessor
        with com.myapp.orders.StripePaymentProcessor;

    opens com.myapp.orders.model;
    opens com.myapp.orders.service;
}
```

**Line-by-line explained:**
- `module com.myapp.orders` — The module's unique name. Convention: reverse domain name.
- `requires java.sql` — "I need the java.sql module." At compile time and runtime, this module must be present.
- `requires static` — "I need this at compile time, but it's optional at runtime." Good for annotation processors.
- `exports com.myapp.orders.api` — These packages are PUBLIC. Other modules can import and use classes from here.
- `provides ... with ...` — This module implements a service interface. Other modules can discover the implementation via `ServiceLoader`.
- `opens` — Allows deep reflection (Spring, Hibernate need this for DI and ORM). Without `opens`, Spring can't inject into your classes.

---

## The Code — Line by Line

### Module Dependencies

// In a module that USES the orders module:
module com.myapp.api {
    requires com.myapp.orders;      // Need the orders module
    requires spring.web;

    // Now you can import and use the exported classes:
}

// In a class inside com.myapp.api:
import com.myapp.orders.api.OrderService;      // ✅ This package is exported
import com.myapp.orders.model.Order;           // ✅ This package is exported
import com.myapp.orders.internal.CacheManager; // ❌ COMPILE ERROR — not exported!

### Automatic Modules (Legacy JARs)

When you put a regular JAR (without `module-info.java`) on the module path, it becomes an **automatic module**:

```
# The module name is derived from the JAR filename:
orders-service-1.0.jar  →  module orders.service   (dots from dashes, version stripped)
```

// An automatic module "reads" all other modules:
module orders.service {   // Auto-generated name
    // Implicitly requires EVERY module on the module path
    // No exports — all packages are exported
}

**Line-by-line explained:**
- Automatic modules are a **migration bridge** — they let you use non-modular JARs in a modular system.
- But they have quirks: implicit requires, no encapsulation. Migrate to named modules when possible.

---

## Real-World Scenarios

### Scenario 1: Clean API Boundaries

// Module: com.myapp.payment
module com.myapp.payment {
```java
    exports com.myapp.payment.api;      // Public: PaymentService, PaymentResult
    // com.myapp.payment.stripe is NOT exported — internal implementation
```

    provides com.myapp.payment.api.PaymentProcessor
        with com.myapp.payment.stripe.StripeProcessor;   // Stripe is the implementation
}

// Module: com.myapp.orders (uses payment)
module com.myapp.orders {
    requires com.myapp.payment;         // Can use the exported API

    // Can import: PaymentService, PaymentResult ✅
    // Cannot import: StripeProcessor ❌ (internal, not exported)
}

**Benefit:** The Orders module depends on the Payment **API**, not the Stripe implementation. You can swap Stripe for PayPal by changing the `provides` declaration — Orders doesn't know or care.

### Scenario 2: Spring Boot Application


**What this code does — step by step:**

1. `requires spring.boot;` — Spring Boot starter
2. `requires spring.context;` — Spring DI
3. `requires spring.web;` — Spring MVC
4. `requires spring.data.jpa;` — Spring Data JPA
5. `requires java.sql;` — JDBC
6. `requires static org.mapstruct;` — Compile-time only
7. `opens com.myapp.controller;` — Spring MVC needs reflection
8. `opens com.myapp.service;` — Spring DI needs reflection
9. `opens com.myapp.model;` — JPA needs reflection
10. `exports com.myapp;` — Main module

The same code, clean:

```java
module com.myapp {
    requires spring.boot;
    requires spring.context;
    requires spring.web;
    requires spring.data.jpa;
    requires java.sql;
    requires static org.mapstruct;

    opens com.myapp.controller;
    opens com.myapp.service;
    opens com.myapp.model;
    exports com.myapp;
}
```

### Scenario 3: Testing Modules


**What this code does — step by step:**

1. Test module (src/test/java/module-info.java):
2. `requires com.myapp;` — Test the main module
3. `requires org.junit.jupiter;` — JUnit 5
4. `requires spring.test;` — Spring Test
5. `opens com.myapp.controller;` — @WebMvcTest needs reflection

The same code, clean:

```java
open module com.myapp.test {
    requires com.myapp;
    requires org.junit.jupiter;
    requires spring.test;
    opens com.myapp.controller;
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Not adding `opens` for Spring | Spring can't inject, Hibernate can't proxy | `opens` every package with `@Component`/`@Entity` |
| Forgetting `requires java.sql` | JDBC classes not found at runtime | Add `requires java.sql` if using JPA/JDBC |
| Using `requires transitive` carelessly | Forces downstream modules to inherit dependencies | Only use when your API exposes the dependency's types |
| Module name collisions | Two modules with same name → resolution fails | Use reverse domain convention (`com.myapp.x`) |
| Not testing on module path | Bugs only appear when modularized | Run integration tests on the module path |

---

## Key Takeaways

- **Modules enforce boundaries** — unexported packages are truly hidden, not just a convention.
- **`exports`** = public API, **`opens`** = reflection-friendly (needed for Spring/Hibernate).
- **Automatic modules** are a migration bridge for legacy JARs, but prefer named modules.
- **Service providers** (`provides...with`) enable plug-in architectures with clean decoupling.
- **Spring Boot + modules**: always add `opens` for packages with DI/ORM annotations.

Official docs: [JPMS Tutorial](https://docs.oracle.com/en/java/javase/21/language/java-platform-module-system.html) · [Project Jigsaw](https://openjdk.org/projects/jigsaw/)

## References

- [dev.java — the official OpenJDK site](https://dev.java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
