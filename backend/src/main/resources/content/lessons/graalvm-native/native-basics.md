---
title: GraalVM Native Image — Compiling Java to a Binary
module: graalvm-native
order: 1
minutes: 26
topics: ["GraalVM", "native image", "AOT compilation", "ahead-of-time", "startup time", "substrate"]
docs:
  - title: "GraalVM Native Image (graalvm.org)"
    url: "https://www.graalvm.org/latest/docs/reference-manual/native-image/"
  - title: "Spring Boot Native Image Support"
    url: "https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html"
summary: Java's classic model: your .class files run on the JVM, which JITcompiles (JustInTime) the hot methods to machine code while the program runs. This...
---

# GraalVM Native Image — Compiling Java to a Binary

## The Concept: Java Without the JVM Startup Tax

Java's classic model: your `.class` files run on the JVM, which **JIT-compiles** (Just-In-Time) the hot methods to machine code *while the program runs*. This gives great peak performance — but it costs startup: the JVM must load, interpret, profile, and compile before the application reaches full speed. A Spring Boot app typically takes 2–10 seconds to start and *seconds more* to warm up. **GraalVM Native Image** takes the opposite path: **AOT compilation (Ahead-Of-Time)** — it compiles your *entire application* (Java code, libraries, framework) into a **standalone native executable** *before* it ever runs. No JVM at startup: the binary starts in milliseconds.

**The mental model:** JIT is a chef who cooks each dish to order, watching how you eat and optimizing as they go — great food, slow to start. AOT is a chef who *pre-cooks everything* by your menu — instant service, but the menu must be fully known in advance. The trade is exactly that: native image trades **runtime flexibility for compile-time knowledge** — it must know, at build time, everything the program will ever do.

**The numbers that sell it:** a Spring Boot app starts in ~3 seconds on the JVM; the same app as a native image starts in ~50–100ms. Memory footprint drops significantly (no JIT, no class metadata, compact heap). For serverless (cold starts matter), containers (small images), and CLI tools, that difference is the difference between "usable" and "not."

## How It Works: Closed-World Analysis

Native Image doesn't just compile — it performs **closed-world analysis**. At build time it walks your code from the entry points and determines *everything the program can possibly use*:

```text
Your code + libraries + framework
        │  (closed-world analysis at BUILD time)
        ▼
Every reachable class, method, field — compiled to machine code
        │
        ▼
A standalone executable: your code + a minimal runtime
(no JVM, no classloader, no JIT, no reflection metadata unless declared)
```

**The consequences are the whole story of native image:** anything *reachable* at build time is compiled in; anything the analyzer *can't see* — classes loaded dynamically by name, reflectively invoked methods, resources discovered at runtime, JDBC drivers looked up by string — **doesn't exist in the binary**. That's why the two keywords of native development are **"reachability"** and **"configuration"**: you must tell the build about everything the closed-world analysis can't discover on its own.

## The Cost of Instant Startup: What You Give Up

**Reflection is the big one.** The `Class.forName("com.example.Driver")` from the networking/reflection lessons — invisible to static analysis. Native Image needs **reflect-config** metadata: the classes, methods, and fields that reflection will access, declared at build time:

```json
// reflect-config.json — "this class will be reflectively accessed":
[
  {
    "name": "com.academy.Payment",
    "methods": [
      { "name": "<init>", "parameterTypes": [] },
      { "name": "getTotal" }
    ],
    "fields": [ { "name": "total" } ]
  }
]
```

**The same for everything dynamic:**
- **Resources** (`getResourceAsStream`) — need `resource-config.json` (files must be known at build time).
- **Dynamic proxies** — `proxy-config.json`.
- **JNI** — `jni-config.json`.
- **Serialization** — `serialization-config.json`.

**The frameworks' saving grace:** Spring, Jackson, and Hibernate ship **GraalVM hints** (Spring Boot's `@RegisterReflectionForBinding`, `RuntimeHintsRegistrar`) that generate much of this metadata automatically from your annotations. The modern Spring Boot + native workflow is *mostly* automatic — but understanding the closed-world model is what lets you debug the cases it isn't.

## Building a Native Image

```bash
# The tools:
# 1. A GraalVM JDK (with native-image) — or the community build.
# 2. For Spring Boot, the Maven/Gradle plugin does the heavy lifting.

# Maven — with the native buildtools plugin:
./mvnw -Pnative native:compile
# -> target/academy-app  (a standalone executable)

# Docker build (the standard container path):
./mvnw -Pnative spring-boot:build-image
# -> a minimal container image with the binary

# Run it:
./target/academy-app
# Started AcademyApplication in 0.072 seconds  <- vs 3+ seconds on the JVM
```

**The build-time costs to know:** native compilation is *slow* — minutes, not seconds (it analyzes and compiles everything). The Maven/Gradle plugin wraps the whole flow (analysis + compilation + metadata generation). CI builds need the GraalVM toolchain and patience — but the *runtime* payoff is instant startup and a small footprint.

## The Spring Boot Native Workflow

```java
// Spring Boot 3 + GraalVM — the modern path is largely declarative:
@SpringBootApplication
public class AcademyApplication {
    public static void main(String[] args) {
        SpringApplication.run(AcademyApplication.class, args);
    }
}

// Spring Boot detects native mode at build time (via the plugin) and:
// 1. Runs the app ONCE during the build (to discover reachability)
// 2. Applies its GraalVM hints (Jackson, Spring Data, Actuator, ...)
// 3. Generates the metadata and compiles the native image

// What YOU add for custom dynamic behavior:
@Configuration
public class NativeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader cl) {
        // "reflect into this DTO for JSON binding":
        hints.reflection().registerType(Payment.class,
                MemberCategory.PUBLIC_FIELDS, MemberCategory.DECLARED_METHODS);
        // "this resource must be in the image":
        hints.resources().registerPattern("templates/*.html");
    }
}
```

**The hint model:** `RuntimeHintsRegistrar` is Spring's native-image metadata API — your code declares its dynamic needs, and the build bakes them in. For most Spring Boot apps, the framework's own hints cover the standard stack; custom hints are for *your* dynamic edges (custom Jackson types, reflectively loaded classes, resource files).

## The Comparison

| | JVM (JIT) | Native Image (AOT) |
|---|---|---|
| Startup | seconds (2–10+) | **milliseconds (50–100)** |
| Peak throughput | excellent (JIT optimizes hot paths) | very good (static compilation) |
| Memory | higher (JIT, metadata) | **lower (no JVM)** |
| Image size | jar + JVM (large) | standalone binary (small-ish; + metadata) |
| Reflection/dynamic | free | **needs declared configuration** |
| Build time | seconds | **minutes** |
| Best for | long-running services, hot workloads | serverless, CLIs, containers, cold-start-sensitive |

**The verdict:** long-running services with hot code paths keep the JVM (peak performance, dynamic freedom). Serverless functions, CLI tools, and startup-sensitive containers go native. The hybrid reality: many teams run *both* — JVM for the main service, native for the cold-start-sensitive edges.

## The Common First-Project Failures

1. **`ClassNotFoundException` for a reflectively-loaded class** — the closed-world analysis missed it. Add a reflection hint (or `@RegisterReflectionForBinding`).
2. **"Could not find resource"** at runtime — a resource the analyzer didn't include. Add a resource hint.
3. **A JSON serialization that works on the JVM and fails native** — Jackson's dynamic binding needs hints for custom types (usually automatic via Spring, but custom DTOs may need `@RegisterReflectionForBinding`).
4. **Slow builds** — expected; cache the native-image build in CI.
5. **Features that quietly don't work** — JVM agents, dynamic proxies without hints, `Unsafe`-dependent libraries. Check each dependency's native support before committing.

## Recap

GraalVM Native Image compiles the whole application ahead of time into a standalone executable: instant startup (milliseconds), low memory, no JVM — bought with the **closed-world trade**: everything dynamic (reflection, resources, proxies, serialization) must be declared at build time via metadata, which Spring Boot and the ecosystem increasingly generate automatically through hints. The modern Spring Boot path is largely declarative (`-Pnative native:compile`, `RuntimeHintsRegistrar` for your custom edges), with the real costs being build time (minutes) and the loss of runtime dynamism. Choose native for serverless and cold-start-sensitive workloads; keep the JVM where peak throughput and dynamic freedom rule. Understand the closed-world model, and native image stops being magic — it becomes a compile-time contract you participate in.
