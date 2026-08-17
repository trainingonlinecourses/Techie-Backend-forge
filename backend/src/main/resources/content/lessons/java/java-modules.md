---
title: JPMS: The Java Platform Module System
summary: Modularity in Java — module-info.java, strong encapsulation, requires/exports/opens, and what changes for Spring Boot applications.
order: 17
minutes: 16
topics: [jigsaw, modules, module-info, strong-encapsulation, classpath-vs-modulepath]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/module/package-summary.html
  - https://docs.oracle.com/javase/tutorial/java/modules/
---

# JPMS: The Java Platform Module System

## Why modules (Jigsaw, Java 9)

The classpath has a core problem: **everything is visible to everything**. Two jars with the same class silently override each other, and nothing can say "I expose this package, hide that one." JPMS adds:

- **Strong encapsulation** — a module declares what it exposes; everything else is hidden at the language level.
- **Explicit dependencies** — `requires` replaces "hope the jar is on the classpath".
- **Reliable configuration** — missing or duplicate modules fail at startup, not at runtime with `ClassNotFoundException`.
- **The JDK itself is modularized** — smaller runtimes via `jlink`.

## Anatomy of module-info.java

```java
module com.acme.orders {
    requires java.sql;                 // JDK modules you use
    requires transitive org.slf4j;     // 'transitive' = consumers see it too
    requires static com.acme.tools;    // optional at runtime (test/compile only)

    exports com.acme.orders.api;       // public API packages
    exports com.acme.orders.spi;

    opens com.acme.orders.domain;      // reflective access (JPA/Hibernate!)
}
```

| Directive | Meaning |
|---|---|
| `requires` | I depend on that module |
| `requires transitive` | Anyone who requires me can see it too |
| `requires static` | Compile-time only (optional at runtime) |
| `exports` | Those packages are public to other modules |
| `opens` | Allow reflection into those packages (framework needs) |
| `uses` / `provides with` | ServiceLoader-based service consumption/provision |

## The reflection gotcha (why `opens` matters)

Reflection into a non-exported, non-opened package throws `InaccessibleObjectException`:

```java
// Without "opens com.acme.orders.domain" this fails:
Object obj = clazz.getDeclaredConstructor().newInstance();
```

**Hibernate/JPA, Jackson, Mockito and Spring all reflect into your classes.** With modules you must explicitly `opens` every package they need. This is the main friction point for modularizing Spring Boot apps — see the "pragmatic" path below.

## Module path vs classpath

- **Classpath** (`java -cp ...`): legacy behavior — everything readable, no encapsulation.
- **Module path** (`java -p ... --module ...`): strong encapsulation, `module-info.java` honored.
- **Automatic modules**: a plain jar on the module path gets a synthesized module (its filename), requires everything, exports everything — a migration bridge.

## Pragmatic adoption for backend teams

Full modularity (all layers in named modules) is achievable but costs ongoing `opens` maintenance. The pragmatic ladder:

1. **Keep the classpath** (Spring Boot's default) — modules are opt-in.
2. **Structure code into packages as if modular** (an `api` package per component) — most of the discipline, none of the ceremony.
3. **Use `jlink` to build a trimmed runtime** for container images — shrink the JRE to the modules you need, drop tens of MB.
4. Adopt named modules for **small, leaf libraries** first (no reflection); add `opens` where frameworks need it.

## Building a runnable image

```java
// module-info.java
module com.acme.app {
    requires java.base;             // always implicit
    requires java.sql;
}

// Then:
//   jlink --module-path $JAVA_HOME/jmods:out --add-modules com.acme.app \
//         --launcher app=com.acme.app/com.acme.Main --output runtime-image
//   runtime-image/bin/app
```

## Key takeaways

- JPMS = strong encapsulation + explicit dependencies + reliable startup.
- `exports` for compile-time APIs, `opens` for reflective frameworks (JPA/Jackson/Spring).
- Spring Boot apps can stay on the classpath; use `jlink` for smaller images and `opens`-aware design when you modularize.

Official docs: [java.lang.module](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/module/package-summary.html) · [Modules tutorial](https://docs.oracle.com/javase/tutorial/java/modules/)
