---
title: Java Platform Module System — Encapsulation at Scale
summary: What JPMS is, module-info.java, requires/exports, services, migration strategies, and how organizations modularize large codebases.
order: 4
minutes: 30
topics: [jpms, module-info, requires, exports, services, encapsulation, java9]
docs:
  - https://docs.oracle.com/javase/9/language/java-module-system.htm
  - https://openjdk.org/jeps/261
---

## The Concept, From Zero

Before Java 9, all public classes were accessible to everyone. If you had a `com.internal.DatabaseHelper` class marked `public`, any code could import and use it — even code that shouldn't.

The **Java Platform Module System (JPMS)** adds a layer of encapsulation:


**What this code does — step by step:**

1. module-info.java — the module descriptor
2. Only these packages are visible to other modules
3. These packages are internal — invisible outside. (com.myapp.internal is NOT exported)
4. Require other modules

The same code, clean:

```java
module com.myapp {
    exports com.myapp.api;


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


**What this code does — step by step:**

1. src/main/java/module-info.java
2. Module dependencies
3. `requires static java.management;` — optional dependency
4. Packages visible to other modules
5. Service usage (consume a service provided by another module)
6. Service provision (provide a service to other modules)

The same code, clean:

```java
module com.myapp.service {
    requires java.sql;
    requires java.logging;
    requires static java.management;

    exports com.myapp.service.api;
    exports com.myapp.service.model;

    uses com.myapp.spi.DataProvider;

    provides com.myapp.spi.DataProvider
        with com.myapp.service.internal.PostgresDataProvider;
}
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. === module-info.java for a web application ===
2. Line 1: Require modules — these are dependencies
3. `requires java.net.http;` — Java HTTP Client
4. `requires java.sql;` — JDBC
5. `requires java.logging;` — JDK Logging
6. `requires static com.fasterxml.jackson.databind;` — optional (compile-only)
7. Line 2: Export packages — make them public to other modules
8. `exports com.acme.webapp.api;` — REST controllers
9. `exports com.acme.webapp.model;` — DTOs and domain objects
10. Line 3: Open packages — allow reflection (for Spring, Jackson, etc.)
11. Line 4: Service usage — consume services from other modules
12. Line 5: Service provision — provide services to other modules
13. Line 6: Main class
14. Application entry point
15. === Using the module ===. Com.acme.webapp.api.UserController.java
16. `import com.acme.webapp.model.User;` — ✅ Allowed — model is exported
17. `import com.acme.webapp.internal.Helper;` — ❌ COMPILE ERROR — internal not exported
18. ✅ Can access exported packages. ❌ Cannot access non-exported packages from other modules

The same code, clean:

```java
module com.acme.webapp {
    requires java.net.http;
    requires java.sql;
    requires java.logging;
    requires static com.fasterxml.jackson.databind;

    exports com.acme.webapp.api;
    exports com.acme.webapp.model;

    opens com.acme.webapp.model to
        com.fasterxml.jackson.databind,
        spring.core;

    uses com.acme.webapp.spi.DataProvider;

    provides com.acme.webapp.spi.DataProvider
        with com.acme.webapp.internal.PostgresDataProvider;

    main class com.acme.webapp.Application {
        public static void main(String[] args) {
        }
    }
}

package com.acme.webapp.api;

import com.acme.webapp.model.User;
import com.acme.webapp.internal.Helper;

public class UserController {
}
```

---

## Real-World Scenarios

### Scenario 1: Microservice module structure


**What this code does — step by step:**

1. module-info.java for a microservice
2. Spring Boot modules
3. Java modules
4. Internal modules
5. Expose only the API
6. Open model for JPA/Hibernate reflection

The same code, clean:

```java
module order.service {
    requires spring.web;
    requires spring.context;
    requires spring.data.jpa;

    requires java.sql;
    requires java.net.http;

    requires order.domain;
    requires order.persistence;

    exports order.service.api;

    opens order.service.model to org.hibernate.orm.core;
}
```

### Scenario 2: Library module providing SPI


**What this code does — step by step:**

1. module-info.java for a library
2. Export the public API
3. Open model for serialization
4. Provide the CacheService SPI
5. module-info.java for a consumer
6. Use the SPI

The same code, clean:

```java
module com.library.cache {
    requires java.logging;

    exports com.library.cache.api;

    opens com.library.cache.model to
        com.fasterxml.jackson.databind,
        com.google.gson;

    provides com.library.cache.spi.CacheService
        with com.library.cache.internal.RedisCacheService;
}

module my.app {
    requires com.library.cache;

    uses com.library.cache.spi.CacheService;
}
```

### Scenario 3: Migration strategy


**What this code does — step by step:**

1. Step 1: Add module-info.java (automatic module). Just create an empty module-info.java:
2. Empty — all packages are auto-exported
3. Step 2: Gradually add exports
4. `exports com.legacy.api;` — public API only
5. `opens com.legacy.model to orm;` — open for reflection
6. Step 3: Add requires for dependencies
7. ...

The same code, clean:

```java
module my.legacy.app {
}

module my.legacy.app {
    exports com.legacy.api;
    opens com.legacy.model to orm;
}

module my.legacy.app {
    requires java.sql;
    requires spring.web;
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

