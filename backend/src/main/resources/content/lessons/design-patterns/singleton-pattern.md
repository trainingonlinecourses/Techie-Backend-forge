---
title: Singleton — One Instance, Shared Everywhere
module: design-patterns
order: 2
minutes: 23
topics: ["singleton", "static initialization", "thread safety", "Spring singletons", "anti-pattern"]
docs:
  - title: "Singleton (Refactoring Guru)"
    url: "https://refactoring.guru/design-patterns/singleton"
---

# Singleton — One Instance, Shared Everywhere

## The Concept: Exactly One

Some things in a program should exist exactly once: a database connection pool, a logger, a configuration object, a random-number generator's seed. Creating a second instance would be wasteful at best, *wrong* at worst (two pools holding the same connection budget, two configs disagreeing).

**The Singleton pattern** guarantees a class has **at most one instance** and provides a global access point to it. The classic implementation has three moves:

1. **Private constructor** — nobody can `new` it from outside.
2. **A static field** holding the single instance.
3. **A static accessor** (`getInstance()`) that creates it lazily on first call and returns it forever after.

```java
public class Config {
    private static final Config INSTANCE = new Config();   // created once at class load
    private Config() {}                                    // no external construction
    public static Config getInstance() { return INSTANCE; }
}
```

The `static final` field means the JVM creates it **exactly once** (when the class is first used) — thread-safe by construction, no locks needed.

## The Thread-Safety Question

The naive *lazy* version is where beginners get burned:

```java
// NOT thread-safe — two threads can both see INSTANCE == null and create two objects
public static Config getInstance() {
    if (INSTANCE == null) INSTANCE = new Config();   // race!
    return INSTANCE;
}
```

Two threads calling this simultaneously can both pass the `null` check before either assigns, producing **two instances** — the pattern broken. The safe forms:

- **Eager `static final`** (above) — simplest, thread-safe, created even if never used.
- **`synchronized` method** — safe but locks every call (slow for hot paths).
- **Double-checked locking** — fast and safe, but fiddly; needs `volatile`.
- **Enum singleton** — the modern recommended one (below).

## The Enum Singleton (Best Practice)

```java
public enum Config {
    INSTANCE;                       // one value, one instance, guaranteed by the JVM

    private String dbUrl = "jdbc:postgresql://localhost:5432/app";

    public String dbUrl() { return dbUrl; }
}
```

An `enum` with a single constant is a **bulletproof singleton**: the JVM guarantees exactly one instance, it's thread-safe, and it survives serialization correctly (enums serialize by name). Access: `Config.INSTANCE.dbUrl()`. This is the recommended modern approach — though even this is unnecessary if you have dependency injection (see below).

## The Code Walkthrough

```java
// ---- Eager thread-safe singleton ----
class AppConfig {
    private static final AppConfig INSTANCE = new AppConfig();

    private final String appName;
    private final int maxConnections;

    private AppConfig() {                       // private: no external new
        this.appName = "BackendForge Academy";
        this.maxConnections = 10;
    }

    public static AppConfig getInstance() { return INSTANCE; }

    public String appName() { return appName; }
    public int maxConnections() { return maxConnections; }
}

public class SingletonDemo {

    public static void main(String[] args) {
        // Both calls return the SAME object:
        AppConfig a = AppConfig.getInstance();
        AppConfig b = AppConfig.getInstance();
        System.out.println(a == b);                 // true — one instance

        System.out.println(a.appName());            // BackendForge Academy
        System.out.println(a.maxConnections());     // 10
    }
}
```

### Walking Through Each Part

**The private constructor** — `private AppConfig() {}`. The only way to get an instance is `getInstance()`. This is the pattern's *enforcement* mechanism: the language itself prevents duplicates.

**The `static final` field** — created when the class initializes. "Static" = one per class (not per object); "final" = never reassigned. Class initialization is guaranteed thread-safe by the JVM's class-loading machinery — no race possible.

**`getInstance()`** — the global access point. Every caller gets the same instance.

**The demo** — `a == b` is `true` because reference equality proves both variables point at the same object.

## The Dark Side — Why Singletons Are Controversial

The pattern is easy to abuse, and its flaws are exactly the things that hurt testability:

1. **Hidden global state** — any code can reach in and touch `AppConfig.INSTANCE`; dependencies are invisible from method signatures.
2. **Hard to test** — you can't swap in a mock "config for tests" because the instance is baked in. No way to reset between tests.
3. **Coupling** — every consumer depends on the singleton *class* directly, not on an interface.
4. **Lifecycle** — a singleton lives for the whole JVM; you can't scope it (per-request, per-user, per-tenant).

This is why **dependency injection** (Spring) largely replaces the pattern: instead of `AppConfig.getInstance()` everywhere, the container creates **one** `AppConfig` bean (by default Spring beans *are* singletons) and *injects* it into consumers' constructors. Same "one instance" guarantee, but dependencies are visible, mockable, and replaceable. Rule of thumb: **let the container be the singleton factory; don't hand-roll the pattern** unless you're outside a DI framework.

## When the Pattern Is Still Legit

- **No DI framework in play** (small library, script, plain Java tool).
- **Global infrastructure with no test seams needed** — e.g., a low-level logger handle.
- **The enum singleton** for genuinely one-of-a-kind values.

## Common Beginner Pitfalls

1. **Non-thread-safe lazy init** — the `if (instance == null)` race. Use eager `static final` or enum.
2. **Making the constructor non-private** — defeats the pattern entirely.
3. **Singletons that hold request/user state** — a "singleton" that stores per-user data leaks state across users. Singletons are for *shared, stateless* infrastructure only.
4. **Testing pain** — if tests can't reset your singleton, the pattern is hurting you; prefer DI.
5. **`instanceof`-style identity checks** — remember `==` on references is the correct singleton comparison.

## Key Takeaways

- Singleton = private constructor + one static instance + static accessor.
- Eager `static final` init is thread-safe for free; the lazy double-check needs care.
- The **enum singleton** is the cleanest hand-rolled form.
- Singletons hide dependencies and hurt testability — prefer DI/Spring beans, which are singletons by default.
- Use singletons for shared stateless infrastructure, never for per-user state.
