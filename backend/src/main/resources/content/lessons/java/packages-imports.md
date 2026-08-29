---
title: Packages & Imports — Organizing a Codebase That Scales
summary: What packages really are (namespaces + folders), how imports work under the hood, wildcard vs explicit imports, fully-qualified names, and the package structures real organizations use.
order: 71
minutes: 18
topics: [packages, imports, namespace, classpath, package-by-feature, fully-qualified-name]
docs:
  - https://docs.oracle.com/javase/tutorial/java/package/index.html
---

## The Concept, From Zero

A **package** does two jobs at once:

1. **Namespace** — it prevents name collisions. Your company's `User` class and a library's `User` can coexist because their full names differ.
2. **Access boundary** — package-private members (see the Access Modifiers lesson) are shared only within a package.

Physically, packages map to **folders**. If you declare:

```java
package com.acme.billing;   // must be the FIRST line of the file (comments allowed above)
```

…then the compiler expects `BillingService.class` to live in folder `com/acme/billing/`. The fully qualified name of your class becomes `com.acme.billing.BillingService` — that's its unique address in the entire JVM.

By convention, package names start with a **reversed domain** you control (`com.google...`, `org.springframework...`) so two organizations never collide.

## Imports — Just Nicknames

Here's the biggest beginner misconception, cleared up immediately:

> **Imports do NOT load classes or affect performance.** They are pure compile-time shorthand so you can write `Map` instead of `java.util.Map`.

```java
import java.util.List;          // now 'List' means java.util.List everywhere in this file
import java.util.ArrayList;

public class Cart {
    private List<String> items = new ArrayList<>();
    //    ↑ resolves to java.util.List thanks to the import
}
```

Without imports you'd have to use the **fully qualified name** every single time:

```java
private java.util.List<String> items = new java.util.ArrayList<>();  // legal but painful
```

### Same-name collision — where imports earn their keep

```java
import java.sql.Date;                 // this file's default meaning of 'Date'

public class Report {
    private Date createdOn;           // = java.sql.Date

    private void audit(java.util.Date eventTime) {   // fully qualify the OTHER one
        // both Date types coexist in one file
    }
}
```

When two types share a simple name, you import one and fully-qualify the other.

### Wildcard imports

```java
import java.util.*;      // every public type directly inside java.util (NOT subpackages)
```

- Convenient, but if `java.util` and your own code both define `List`, compilation fails with "ambiguous name" until you qualify explicitly.
- Most style guides (Google's included) prefer **explicit imports** because code review shows exactly which type is used without an IDE.

### Static imports — for constants and helpers

```java
import static java.lang.Math.max;
import static org.junit.jupiter.api.Assertions.assertEquals;

int bigger = max(3, 7);              // instead of Math.max(3, 7)
assertEquals(4, cart.itemCount());   // common in tests
```

Use sparingly — overusing static imports hides where a method comes from.

## How Organizations Structure Packages

Two competing strategies:

**Package-by-layer** (older style):

```
com.acme.controllers/   ← all controllers regardless of feature
com.acme.services/
com.acme.repositories/
```

**Package-by-feature** (modern preference):

```
com.acme.order/       OrderController, OrderService, OrderRepository together
com.acme.billing/     everything billing-related together
com.acme.shipping/
```

Why teams migrate to package-by-feature: each feature is self-contained, you can make helpers package-private within the feature, deleting a feature = deleting one folder, and navigation follows business concepts rather than technical stereotypes.

## Real Organizational Scenarios

**Scenario 1 — The collision bug.** Two teams both created `com.acme.util.StringUtils`. Merging broke the build. Post-mortem rule: every module owns a distinct root package (`com.acme.orders.util`), no shared catch-all `util` package.

**Scenario 2 — API surface hygiene.** A SDK team puts internal classes under `...internal.*` with package-private access. Public Javadoc only documents the top-level packages, so users physically cannot depend on internals.

**Scenario 3 — Java 9 modules.** With JPMS, packages become export units: `module-info.java` decides which packages other modules may even see. Clean package structure became a hard requirement, not just tidiness.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Believing imports cost runtime performance | Pointless "optimizations" | Imports vanish at compile time — zero runtime effect |
| Default package (no declaration) for real classes | Can't be imported by anything else | Always declare a package |
| Wildcard + duplicate names | Ambiguous-class compile errors | Use explicit imports |
| Deep packages like `com.x.y.z.a.b.Helper` | Navigation nightmare | Keep hierarchy shallow and feature-oriented |
