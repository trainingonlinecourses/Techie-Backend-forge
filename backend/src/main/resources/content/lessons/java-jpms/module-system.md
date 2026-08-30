---
title: Java Platform Module System — Encapsulation at Scale
summary: What JPMS is, module-info.java, requires/exports, services, migration strategies, and how organizations modularize large codebases.
order: 1
minutes: 30
topics: [jpms, module-info, requires, exports, services, encapsulation, java9]
docs:
  - https://docs.oracle.com/javase/9/language/java-module-system.htm
  - https://openjdk.org/jeps/261
---

## The Concept, From Zero

Before Java 9, all public classes were accessible to everyone. If you had a `com.internal.DatabaseHelper` class marked `public`, any code could import and use it — even code that shouldn't.

The **Java Platform Module System (JPMS)** adds a layer of encapsulation:

```java
// module-info.java — the module descriptor
module com.myapp {
    // Only these packages are visible to other modules
    exports com.myapp.api;

    // These packages are internal — invisible outside
    // (com.myapp.internal is NOT exported)

    // Require other modules
    requires java.sql;
    requires com.database;
}
```

**Think of it like an apartment building:**
- **Module** = an apartment (self-contained unit)
- **exports** = which rooms have doors open to visitors
- **requires** = which other apartments you need access to
- **internal packages** = private rooms — no one else can enter

---

## The module-info.java File

Every module has a `module-info.java` at the root of its source tree:

```java
// src/main/java/module-info.java
module com.myapp.service {
    // Module dependencies
    requires java.sql;
    requires java.logging;
    requires static java.management;  // optional dependency

    // Packages visible to other modules
    exports com.myapp.service.api;
    exports com.myapp.service.model;

    // Service usage (consume a service provided by another module)
    uses com.myapp.spi.DataProvider;

    // Service provision (provide a service to other modules)
    provides com.myapp.spi.DataProvider
        with com.myapp.service.internal.PostgresDataProvider;
}
```

---

## Line-by-Line Walkthrough

```java
// === module-info.java for a web application ===
module com.acme.webapp {
    // Line 1: Require modules — these are dependencies
    requires java.net.http;           // Java HTTP Client
    requires java.sql;                // JDBC
    requires java.logging;            // JDK Logging
    requires static com.fasterxml.jackson.databind;  // optional (compile-only)

    // Line 2: Export packages — make them public to other modules
    exports com.acme.webapp.api;      // REST controllers
    exports com.acme.webapp.model;    // DTOs and domain objects

    // Line 3: Open packages — allow reflection (for Spring, Jackson, etc.)
    opens com.acme.webapp.model to
        com.fasterxml.jackson.databind,
        spring.core;

    // Line 4: Service usage — consume services from other modules
    uses com.acme.webapp.spi.DataProvider;

    // Line 5: Service provision — provide services to other modules
    provides com.acme.webapp.spi.DataProvider
        with com.acme.webapp.internal.PostgresDataProvider;

    // Line 6: Main class
    main class com.acme.webapp.Application {
        public static void main(String[] args) {
            // Application entry point
        }
    }
}

// === Using the module ===
// com.acme.webapp.api.UserController.java
package com.acme.webapp.api;

import com.acme.webapp.model.User;  // ✅ Allowed — model is exported
import com.acme.webapp.internal.Helper;  // ❌ COMPILE ERROR — internal not exported

public class UserController {
    // ✅ Can access exported packages
    // ❌ Cannot access non-exported packages from other modules
}
```

---

## Real-World Scenarios

### Scenario 1: Microservice module structure

```java
// module-info.java for a microservice
module order.service {
    // Spring Boot modules
    requires spring.web;
    requires spring.context;
    requires spring.data.jpa;

    // Java modules
    requires java.sql;
    requires java.net.http;

    // Internal modules
    requires order.domain;
    requires order.persistence;

    // Expose only the API
    exports order.service.api;

    // Open model for JPA/Hibernate reflection
    opens order.service.model to org.hibernate.orm.core;
}
```

### Scenario 2: Library module providing SPI

```java
// module-info.java for a library
module com.library.cache {
    requires java.logging;

    // Export the public API
    exports com.library.cache.api;

    // Open model for serialization
    opens com.library.cache.model to
        com.fasterxml.jackson.databind,
        com.google.gson;

    // Provide the CacheService SPI
    provides com.library.cache.spi.CacheService
        with com.library.cache.internal.RedisCacheService;
}

// module-info.java for a consumer
module my.app {
    requires com.library.cache;

    // Use the SPI
    uses com.library.cache.spi.CacheService;
}
```

### Scenario 3: Migration strategy

```java
// Step 1: Add module-info.java (automatic module)
// Just create an empty module-info.java:
module my.legacy.app {
    // Empty — all packages are auto-exported
}

// Step 2: Gradually add exports
module my.legacy.app {
    exports com.legacy.api;      // public API only
    opens com.legacy.model to orm;  // open for reflection
}

// Step 3: Add requires for dependencies
module my.legacy.app {
    requires java.sql;
    requires spring.web;
    // ...
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `opens` for reflection | Spring/Jackson can't access fields | Add `opens` for frameworks that use reflection |
| Not exporting API packages | Other modules can't use your code | Export public packages explicitly |
| Over-exporting internals | Breaks encapsulation | Only export what's part of your public API |
| Using `requires` without knowing transitivity | Missing dependencies | Add `requires transitive` for API dependencies |
| Not handling optional modules | ClassNotFoundException at runtime | Use `requires static` for optional dependencies |
