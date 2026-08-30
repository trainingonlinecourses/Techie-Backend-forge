---
title: Spring Boot Native — The Automated Path
module: graalvm-native
order: 2
minutes: 26
topics: ["Spring Boot native", "buildpacks", "native plugin", "AOT engine", "hints", "configuration"]
docs:
  - title: "Spring Boot Native Image (Spring docs)"
    url: "https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html"
  - title: "GraalVM Hints and AOT (Spring docs)"
    url: "https://docs.spring.io/spring-boot/reference/packaging/native-image/advanced-topics.html"
summary: Raw GraalVM native image on a Spring Boot app used to be a heroic configuration exercise — handwritten metadata for every framework feature. Spring...
---

# Spring Boot Native — The Automated Path

## The Concept: The Framework Does the Native Heavy Lifting

Raw GraalVM native image on a Spring Boot app used to be a heroic configuration exercise — hand-written metadata for every framework feature. Spring Boot 3 changed the game: the framework ships an **AOT (Ahead-Of-Time) engine** and **GraalVM hints** for its entire stack, so the modern workflow is mostly *running a command*. This lesson is that automated path — how it works, what it automates, and where you still step in.

**The mental model:** Spring Boot's native support is a *build-time intelligence layer*. When you build native, Boot: (1) **runs your application once** in a special AOT mode to discover what it actually uses, (2) **applies its hint catalog** — the knowledge "Jackson reflects into these types, Spring Data needs these resources, Actuator uses this reflection" — to generate the GraalVM metadata, and (3) hands everything to native-image for compilation. Your job shrinks to the *edges* Boot can't know: your custom dynamic behavior.

## The Two Build Paths

**Path 1 — Maven/Gradle plugin (the direct way):**

```xml
<!-- pom.xml -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
</parent>

<build>
    <plugins>
        <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
        </plugin>
    </plugins>
</build>
```

```bash
# Requires a GraalVM JDK on the build machine:
./mvnw -Pnative native:compile
# -> target/academy  — the standalone executable

# Run and enjoy the instant startup:
./target/academy
# Started AcademyApplication in 0.068 seconds (JVM was ~3s)
```

**Path 2 — Buildpacks (the container way):**

```bash
# No GraalVM needed locally — the buildpack provides it:
./mvnw -Pnative spring-boot:build-image
# -> docker.io/library/academy:1.0.0 — a minimal container with the binary

docker run -p 8080:8080 academy:1.0.0
```

The **buildpacks** path is the deployment-friendly route: the Paketo buildpack provisions GraalVM, runs the native build *inside* the container build, and produces a small runtime image (no JVM, just the binary + minimal OS). This is what Render/Vercel-style deployments and CI pipelines actually run.

## The AOT Engine: What Boot Does for You

The heart is the **AOT processing phase** that runs during the native build:

```text
1. AOT engine analyzes your @SpringBootApplication:
   - Spring beans and their dependencies (configuration class scanning)
   - @ConfigurationProperties classes
   - JPA entities, Spring Data repositories
   - Jackson types reachable from @RequestBody/@ResponseBody
   - Actuator endpoints, scheduled tasks, message listeners
2. It GENERATES:
   - The bean definitions (compiled, not runtime-scanned)
   - GraalVM metadata: reflect-config, resource-config, proxy-config,
     serialization-config, jni-config
3. native-image compiles everything into the executable.
```

**The result:** your Spring Boot app's *whole initialization* (component scanning, bean wiring, property binding) is decided at build time and baked in — which is *why* startup is milliseconds: the app isn't scanning and wiring at runtime; it's already wired. This is the deep reason native + Spring Boot is a *different execution model*, not just a faster JVM: **configuration-time work moved to build time.**

## Hints: The Extension Point You Own

The automation covers the standard stack; your custom dynamic edges need **hints**. The two forms:

```java
// Form 1 — annotation-based (the common case):
@SpringBootApplication
// "Jackson must be able to reflect into these types":
@RegisterReflectionForBinding({ LessonDto.class, OrderReceipt.class })
public class AcademyApplication { ... }

// Form 2 — the full registrar (programmatic, conditional):
public class AcademyRuntimeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Reflection for a custom serializer's target:
        hints.reflection().registerType(SpecialDto.class,
                MemberCategory.PUBLIC_FIELDS,
                MemberCategory.DECLARED_CONSTRUCTORS,
                MemberCategory.DECLARED_METHODS);

        // A resource the app loads at runtime:
        hints.resources().registerResourceBundle("messages");

        // A dynamic proxy:
        hints.proxies().registerJdkProxy(RemoteApi.class);

        // A serializable class:
        hints.serialization().registerType(CacheEntry.class);
    }
}

// Registered in the config:
@Configuration
@ImportRuntimeHints(AcademyRuntimeHints.class)
class NativeConfig { }
```

**The mental model for hints:** ask "what does my code do *dynamically* that the compiler can't see?" — reflectively accessed classes, loaded resources, serialized types, dynamic proxies — and declare each with a hint. The `RuntimeHintsRegistrar` API is the sanctioned surface: type-safe, conditional, and processed at AOT time.

## The Framework-Specific Considerations

- **Jackson** — mostly automatic: Boot hints the types reachable from controllers; custom serializers/deserializers and polymorphic types may need `@RegisterReflectionForBinding`.
- **Spring Data JPA** — entities are hinted automatically; *dynamic* query features (SpEL in `@Query`, custom `Specification`s) need care — the query parser is dynamic.
- **Security** — the filter chain is AOT-processed; custom `UserDetailsService` or method-security expressions are fine; exotic dynamic security configs may need hints.
- **Actuator** — works natively; health indicators and metrics are hinted.
- **The third-party story** — every library is either native-compatible or not; check the library's docs for "GraalVM native support" before choosing it for a native deployment.

## Profiles and Configuration in Native

Native images are **immutable** in a key sense: `application.properties` inside the jar are *baked into the image* at build time. The runtime configuration surface is:

- **Environment variables and system properties** — read at runtime, work normally (the standard way to vary config in native deployments).
- **External config files** — `spring.config.additional-location` works.
- **Profile-specific files inside the app** — *only the profiles active at build time are included*. A `application-prod.properties` the build never saw isn't in the binary. The rule: **pass `-Dspring.profiles.active=prod` to the native build** (and to the runtime for env-driven values).

This is the ConfigMap/Secrets lesson's spirit taken to its logical end: the image is the immutable application; *everything* variable lives in the environment.

## The Native Build Troubleshooting Ladder

1. **"Class not found" / "method not found" at runtime** — a missing hint. Add `@RegisterReflectionForBinding` or a registrar entry; rebuild (minutes).
2. **Test before building** — run the app on the JVM first (fast iteration), then a native build, then the native binary. The JVM run catches logic bugs; the native run catches reachability gaps.
3. **`-H:+ReportExceptionStackTraces`** — get the native build's failure details.
4. **GraalVM Reachability Metadata Repository** — the community-maintained metadata for libraries (many third-party deps get their metadata here automatically via the build tools).
5. **Keep the build cached** in CI — native builds are minutes; caching the GraalVM toolchain and build outputs is essential for iteration speed.

## Recap

Spring Boot 3's native support automates the GraalVM path: the **AOT engine** analyzes your application during the build, generates bean definitions and GraalVM metadata for the whole framework stack, and hands everything to native-image — so `-Pnative native:compile` (or the buildpacks `spring-boot:build-image`) produces a milliseconds-starting executable. Your responsibility shrinks to the dynamic edges: **hints** (`@RegisterReflectionForBinding`, `RuntimeHintsRegistrar`) for custom reflection/resources/serialization, profile-config inclusion at build time, and third-party native compatibility. The mental shift is the whole game: Spring Boot native isn't a faster JVM — it's a *build-time-wired application* whose runtime configuration is the environment. Master the AOT model and the hint surface, and native deployment becomes a routine — albeit slow-building — workflow.
