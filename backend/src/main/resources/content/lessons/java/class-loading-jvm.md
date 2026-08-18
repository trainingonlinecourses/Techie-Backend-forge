---
title: Class Loading & the JVM Runtime — From Bytecode to Running App
summary: How classes are loaded, linked and initialized, the parent-delegation model, and how it explains Spring, drivers and NoClassDefFoundError.
order: 26
minutes: 20
topics: [classloader, class-loading, jvm, bytecode, parent-delegation, initialization, classpath]
docs:
  - https://docs.oracle.com/javase/specs/jvms/se21/html/jvms-5.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ClassLoader.html
---

# Class Loading & the JVM Runtime — From Bytecode to Running App

## The concept: what happens when you use a class

Java compiles source to **bytecode** (`.class` files). At runtime the JVM doesn't run them all up front — it **loads a class lazily, the first time it is actually referenced**. The lifecycle has three phases:

1. **Loading** — a `ClassLoader` reads the bytecode and creates a `Class` object. Lazy: nothing loads until touched.
2. **Linking** — the JVM **verifies** the bytecode is valid, **prepares** static storage, and optionally **resolves** referenced classes.
3. **Initialization** — runs static initializers and `static final` field assignments, exactly once per class (guarded by the JVM so concurrent first-touches initialize once).

This laziness is why a Spring Boot app can start with hundreds of MB of dependencies: only the classes actually touched during startup get loaded. It's also why "it works in unit tests but blows up in production" usually traces to a class that was never exercised.

## The parent-delegation model

Class loaders are hierarchical. When asked for a class, a loader **delegates to its parent first**; only if the parent can't find it does the loader search its own scope:

```text
Bootstrap ClassLoader   → java.lang, java.util (JVM core, no classpath)
    ↑
Platform ClassLoader    → JDK modules
    ↑
Application ClassLoader → your classpath (Maven/Gradle dependencies + your code)
```

**Why this matters:** it guarantees core classes (`java.lang.String`) are always the JVM's, never shadowed by a dependency that ships its own `String.class` — the foundation of Java's type safety. It also explains classic failures:

- **`NoClassDefFoundError`** — the class compiled against existed, but at runtime the *loader that should provide it* can't find it (missing jar, or wrong scope like `provided`/`test`). The class was *linked* but not *found*.
- **`ClassNotFoundException`** — a *loader* was explicitly asked for a class (reflection, `Class.forName`, driver registration) and its delegation chain failed.

## How we use it in an organization: the scenarios

**Scenario 1 — JDBC driver loading (the classic):**

```java
// Old JDBC style — Class.forName forced the driver class to load so its
// static block could register itself with DriverManager
Class.forName("org.postgresql.Driver");

// Modern style — the driver registers via ServiceLoader (META-INF/services),
// and DataSource is created directly; no explicit loading needed
DataSource ds = new HikariDataSource(hikariConfig);
```

`Class.forName(name)` triggers **initialization** (static blocks run) — which is precisely how legacy driver registration worked. Reflection APIs give you the same three knobs: `forName` (load + initialize), `loadClass` (load only), and `Class.forName(name, false, loader)` (load + link, skip init).

**Scenario 2 — why Spring works (the deep reason):**

Spring's whole engine is class loading + reflection. `@ComponentScan` tells Spring which packages to inspect; Spring loads the candidate classes, reads annotations, and registers beans:

```java
@ComponentScan(basePackages = "com.acme.orders")  // Spring loads and inspects these classes lazily
```

When you see "consider defining a bean of type X in your configuration", the class *was* found but Spring's **type-filtering** decided it wasn't a bean — loading succeeded, registration didn't. The class loader is the plumbing under every framework you use.

**Scenario 3 — plugins and isolation:**

```java
// An application that loads customer plugins from jars:
URLClassLoader pluginLoader = new URLClassLoader(
    new URL[]{ pluginJar.toURI().toURL() },
    getClass().getClassLoader());          // parent = app loader
Class<?> pluginClass = pluginLoader.loadClass("com.acme.plugins.TaxPlugin");
TaxPlugin plugin = (TaxPlugin) pluginClass.getConstructor().newInstance();
```

App servers (Tomcat, Jetty) do exactly this per webapp — each webapp gets its own class loader so two apps can use different versions of the same library without conflict. **Your own code rarely needs a custom loader** — that's the app server's job — but understanding it explains dependency conflicts and classloader leaks (a webapp redeploy that leaks its loader never releases its classes → `OutOfMemoryError: Metaspace`).

## Diagnosing class-loading failures

- `NoClassDefFoundError: Could not initialize class X` — the static initializer of X **threw** during init (an `ExceptionInInitializerError` was swallowed). Check X's static block for the real cause.
- Duplicate classes on the classpath (`commons-logging` in two versions) → check `mvn dependency:tree`; the loader picks the first on the path, which may be the wrong one.
- `Metaspace` OOM after repeated redeploys → a class loader leak; a proper shutdown hook or a container that reuses loaders is the fix.

## Key takeaways

- Classes load lazily, then link, then initialize once; static blocks run at init.
- Parent delegation keeps core classes authoritative and prevents shadowing.
- `Class.forName` initializes; `loadClass` only loads — the distinction powers legacy drivers and lazy frameworks.
- Spring, JDBC drivers, and app servers are all class-loading machines; understanding the loader explains their behaviors and failures.
- `NoClassDefFoundError` vs `ClassNotFoundException` have different root causes — check classpath and static initializers respectively.
