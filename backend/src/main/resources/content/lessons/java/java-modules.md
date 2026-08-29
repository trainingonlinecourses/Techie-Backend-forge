---
title: Java Platform Module System (JPMS) — Java 9+ Modules
summary: What modules solve (the JAR hell), module-info.java anatomy, automatic vs named modules, and how organizations modularize large codebases. Beginner-friendly with line-by-line code.
order: 85
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

```java
// File: src/main/java/module-info.java
module com.myapp.orders {                            // Module name

    // === WHAT THIS MODULE NEEDS ===
    requires java.sql;                               // Needs JDBC APIs
    requires java.net.http;                          // Needs HttpClient
    requires spring.context;                         // Needs Spring DI
    requires spring.web;                             // Needs Spring MVC
    requires static org.slf4j;                       // Compile-only dependency (optional)

    // === WHAT THIS MODULE PROVIDES ===
    exports com.myapp.orders.api;                    // Public API — other modules can use this
    exports com.myapp.orders.model;                  // Public models
    // Note: com.myapp.orders.internal is NOT exported — private to this module

    // === SERVICE PROVIDERS ===
    provides com.myapp.common.spi.PaymentProcessor    // Implements this service interface
        with com.myapp.orders.StripePaymentProcessor; // The implementation class

    // === OPENS (for reflection — Spring needs this) ===
    opens com.myapp.orders.model;                    // Allow reflection on these classes
    opens com.myapp.orders.service;                  // Spring can inject into these
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

```java
// In a module that USES the orders module:
module com.myapp.api {
    requires com.myapp.orders;      // Need the orders module
    requires spring.web;

    // Now you can import and use the exported classes:
}
```

```java
// In a class inside com.myapp.api:
import com.myapp.orders.api.OrderService;      // ✅ This package is exported
import com.myapp.orders.model.Order;           // ✅ This package is exported
import com.myapp.orders.internal.CacheManager; // ❌ COMPILE ERROR — not exported!
```

### Automatic Modules (Legacy JARs)

When you put a regular JAR (without `module-info.java`) on the module path, it becomes an **automatic module**:

```
# The module name is derived from the JAR filename:
orders-service-1.0.jar  →  module orders.service   (dots from dashes, version stripped)
```

```java
// An automatic module "reads" all other modules:
module orders.service {   // Auto-generated name
    // Implicitly requires EVERY module on the module path
    // No exports — all packages are exported
}
```

**Line-by-line explained:**
- Automatic modules are a **migration bridge** — they let you use non-modular JARs in a modular system.
- But they have quirks: implicit requires, no encapsulation. Migrate to named modules when possible.

---

## Real-World Scenarios

### Scenario 1: Clean API Boundaries

```java
// Module: com.myapp.payment
module com.myapp.payment {
    exports com.myapp.payment.api;      // Public: PaymentService, PaymentResult
    // com.myapp.payment.stripe is NOT exported — internal implementation

    provides com.myapp.payment.api.PaymentProcessor
        with com.myapp.payment.stripe.StripeProcessor;   // Stripe is the implementation
}
```

```java
// Module: com.myapp.orders (uses payment)
module com.myapp.orders {
    requires com.myapp.payment;         // Can use the exported API

    // Can import: PaymentService, PaymentResult ✅
    // Cannot import: StripeProcessor ❌ (internal, not exported)
}
```

**Benefit:** The Orders module depends on the Payment **API**, not the Stripe implementation. You can swap Stripe for PayPal by changing the `provides` declaration — Orders doesn't know or care.

### Scenario 2: Spring Boot Application

```java
module com.myapp {
    requires spring.boot;              // Spring Boot starter
    requires spring.context;           // Spring DI
    requires spring.web;               // Spring MVC
    requires spring.data.jpa;          // Spring Data JPA
    requires java.sql;                 // JDBC
    requires static org.mapstruct;     // Compile-time only

    opens com.myapp.controller;        // Spring MVC needs reflection
    opens com.myapp.service;           // Spring DI needs reflection
    opens com.myapp.model;             // JPA needs reflection
    exports com.myapp;                 // Main module
}
```

### Scenario 3: Testing Modules

```java
// Test module (src/test/java/module-info.java):
open module com.myapp.test {
    requires com.myapp;                // Test the main module
    requires org.junit.jupiter;        // JUnit 5
    requires spring.test;              // Spring Test
    opens com.myapp.controller;        // @WebMvcTest needs reflection
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
