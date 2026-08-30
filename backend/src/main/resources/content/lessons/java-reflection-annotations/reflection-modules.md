---
title: Reflection and the Module System — Opens and Exports
module: java-reflection-annotations
order: 5
minutes: 25
topics: ["modules", "JPMS", "opens", "exports", "--add-opens", "deep reflection"]
summary: Before Java 9, "encapsulation" was a convention: private fields stopped your code, but any library could call setAccessible(true) and reach into an...
docs:
  - title: "Module System (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/java/modules/index.html"
  - title: "Understanding Module Declarations (Oracle)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/module/package-summary.html"
---

# Reflection and the Module System — Opens and Exports

## The Concept: The Strongest Encapsulation Java Has Ever Had

Before Java 9, "encapsulation" was a *convention*: `private` fields stopped your code, but any library could call `setAccessible(true)` and reach into anything — including the JDK's own internals. That was a security and stability hole: libraries poked at `sun.misc.Unsafe` and internal collections, breaking when JDK internals changed.

Java 9's **module system** (JPMS) made encapsulation *enforced by the runtime*. A module is a named, self-describing unit (usually a JAR with a `module-info.java`) that declares two things about each of its packages:

- **`exports`** — which packages are *publicly visible*: other modules can use their public types.
- **`opens`** — which packages allow *deep reflection*: other modules may use `setAccessible(true)` on their private members.

If a package is neither exported nor opened, other modules can't compile against it *and* can't reflect into it — full stop. This is the mechanism behind the `InaccessibleObjectException` and the infamous `--add-opens` flags you see in every Spring Boot startup script.

**The mental model:** a module is a gated building. `exports` unlocks the *front doors* (public API — you can walk in and use the lobby). `opens` unlocks the *back doors* (private rooms — you can look at anything). Without either key, you can't get past the perimeter at all, no matter how hard you rattle the doors (reflection).

## Why Reflection Cares So Much About Modules

Reflection is the exact thing modules restrict: ORMs need to set private fields on entities; serializers need to read private state; proxies need to access private members. When a framework's reflection hits a package that isn't `opens`, Java throws:

```
java.lang.reflect.InaccessibleObjectException:
Unable to make field private final java.util.Map ... accessible:
module java.base does not "opens java.util" to unnamed module ...
```

That error message is the module system speaking plainly: "java.base does not *open* java.util to your module." Every `--add-opens` flag you've ever seen in a Spring Boot Dockerfile or a Gradle config is someone granting exactly this permission — because Hibernate, Jackson, or Mockito needed deep reflection into a JDK or library package.

## module-info.java in Action

Here's a module declaration showing the vocabulary:

```java
// backend/src/main/java/module-info.java (conceptual)
module academy.payments {
    // Public API — other modules can USE these packages.
    exports com.academy.payments.api;
    exports com.academy.payments.dto;

    // Deep reflection — frameworks may reflect into these packages.
    opens com.academy.payments.domain;
    opens com.academy.payments.config;

    // Dependencies on other modules.
    requires spring.context;
    requires com.fasterxml.jackson.databind;
    requires org.hibernate.orm.core;
}
```

**Walking through it:** the `api` and `dto` packages are *exported* — controllers and clients compile against them. The `domain` and `config` packages are *opened* — Hibernate can set private fields on entities, Jackson can serialize them, and Spring can reflect into config classes. Notice the asymmetry: `exports` is about *compile-time visibility* (can other modules reference these types?), while `opens` is about *runtime reflection* (can frameworks reach the private parts?). A package can be both (`exports` AND `opens`) — export for API consumers, open for frameworks.

## The Real World: Most Projects Stay on the Classpath

Here's the practical truth: **the vast majority of Spring Boot applications never write a `module-info.java` at all.** They run on the **classpath** (not the module path), which means their own code lives in the *unnamed module* — a special module that has no declarations. The unnamed module can reflect into itself freely, and it can *read* all named modules on the classpath.

But the JDK itself is modular — `java.base` and friends are named modules. So your classpath-based app can still hit the wall when *its frameworks* reflect into *JDK internals*: Hibernate wants `java.util` internals, Mockito wants to mock JDK classes, native-image tooling wants everything. The standard escape hatch is the command line:

```bash
java --add-opens java.base/java.lang=ALL-UNNAMED \
     --add-opens java.base/java.util=ALL-UNNAMED \
     -jar app.jar
```

`--add-opens java.base/java.util=ALL-UNNAMED` means: "open the package `java.util` in module `java.base` to the unnamed module" — i.e., to your whole classpath app. Spring Boot's docs list exactly which opens flags you need, and tools like Gradle's `application` plugin and Docker images bake them in. You don't usually *write* these by choice; you add them one at a time when a framework error tells you which package it needs.

## Why `setAccessible(true)` Now Throws

Pre-modules, `setAccessible(true)` was effectively unchecked power. Post-modules, it's gated on the module relationship:

- Your *own* module's packages: always accessible to you — your code can reflect into itself freely.
- Packages **opened** to you (via `opens` in the target's `module-info`, or `--add-opens` at launch): `setAccessible(true)` works.
- Packages neither exported nor opened: the call throws `InaccessibleObjectException` — the module system refuses, permanently.

This is why the old "just call setAccessible(true)" advice is dead for third-party internals: it's not about your code's willpower anymore, it's about whether the owning module granted access.

## The Framework Answer: Avoid Needing Opens

Modern frameworks reduce the pain in two ways. First, they **use `MethodHandles.Lookup`** derived from the *target class itself*: `MethodHandles.privateLookupIn(targetClass, lookup)` lets a framework borrow the target's own access rights, so it can reflect into the target's members without the target opening its package to the framework's module. Hibernate and Jackson use this pattern. Second, they **document the minimum `--add-opens` set** precisely, so you never guess.

The cleanest answer for *your* code: if you control the module, `opens` exactly the packages frameworks need, and keep everything else closed. The module system is doing you a favor — it makes the reflective surface of your application explicit and auditable instead of "any library can reach anything."

## Records, Sealed Classes, and Reflection

Modern Java features are designed with reflection in mind:

- **Records**: their canonical constructor, accessors, and `equals`/`hashCode`/`toString` are all discoverable via reflection (`RecordComponent` gives you the component names and types). Jackson serializes records without configuration, and `MethodHandles` gives you *direct* accessor handles (a record's accessor is already an `invokedynamic`-linked handle).
- **Sealed classes**: `getPermittedSubclasses()` lists the classes allowed to extend a sealed type — reflection can walk the closed hierarchy at runtime, which is exactly how Jackson picks serializers for sealed hierarchies.
- **Type-use annotations** (`@Target(TYPE_USE)`): retrievable via `getAnnotatedType()`, letting tools see annotations on generic arguments — `List<@Email String>`.

Learning reflection on modern Java means learning these too: the language keeps adding features that make the runtime story *more* introspectable, not less.

## Recap

Java 9's module system upgraded encapsulation from convention to enforcement: modules declare `exports` (compile-time visibility) and `opens` (deep-reflection permission), and reflection into anything else throws `InaccessibleObjectException`. Most applications live in the unnamed module on the classpath and only meet the wall when frameworks reflect into JDK internals — solved with `--add-opens` flags, one package at a time. Modern frameworks minimize the need via `privateLookupIn`, and records/sealed classes integrate cleanly with reflection. The practical takeaways: if you write a module, `opens` only what frameworks need; if you run on the classpath, keep the documented `--add-opens` set handy; and remember that `setAccessible(true)` is now a permission question, not a technique.
