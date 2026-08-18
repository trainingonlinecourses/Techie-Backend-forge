---
title: Startup Performance — Lazy Init, Spring AOT and Faster Boots
summary: Why startup time matters in serverless and scale-to-zero, @Lazy beans, Spring AOT, and the profiling workflow to find slow startup beans.
order: 16
minutes: 18
topics: [startup, lazy-init, spring-aot, aot, cold-start, serverless, startup-profiling, graalvm]
docs:
  - https://docs.spring.io/spring-boot/reference/features/spring-application.html#features.spring-application.lazy-initialization
  - https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html
---

# Startup Performance — Lazy Init, Spring AOT and Faster Boots

## The concept: why startup seconds are real money

A classic JVM Spring Boot app starts in 5-20 seconds. On an always-on server that cost is paid once. But the industry moved to **scale-to-zero**: serverless functions, Kubernetes with cluster-autoscaler, Render/Railway free tiers that sleep after idle. Now startup time is paid **per cold start**, directly on the critical path of the first user request. Cutting 15s of startup to 3s turns a 20s first-request latency into 5s — a user-visible improvement, not an engineering vanity metric.

Startup time comes from: class loading (lazy by default), bean instantiation (eager by default), JPA/Hibernate bootstrap, connection pool creation, and any `ApplicationRunner` work. Attack each one deliberately.

## The levers, in order of impact

**1. Measure first.** Find what actually takes time:

```properties
logging.level.org.springframework.boot.autoconfigure.logging=debug
# or, more usefully:
logging.level.org.springframework=INFO
# and watch the boot log — Spring prints "Started X in 9.2s" and per-phase timing
# For per-bean timing: spring.jmx.enabled + jconsole, or a startup profiler (async-profiler -p <pid>)
```

Spring Boot also exposes `ApplicationStartup` (flight-recorder-style bean init steps): set `spring.main.application-startup=buffering` and read `startup.steps` via Actuator. The steps list tells you exactly which bean took 4 seconds — that's your target, not "the framework is slow".

**2. `@Lazy` the heavy, rarely-used beans.** A `KafkaAdmin`, a second `DataSource`, a reporting `WebClient` — defer them until first use:

```java
@Configuration
public class HeavyBeans {
    @Bean
    @Lazy
    public KafkaAdmin kafkaAdmin() { ... }   // not built until something injects it

    @Bean
    @Lazy
    public DataSource reportingDataSource() { ... }  // analytics pool — rarely touched
}
```

Or globally: `spring.main.lazy-initialization=true` creates **everything** on first use. Fast, but it hides wiring errors until first touch and reorders startup side effects — acceptable for dev/CI, risky as a blanket prod setting. Use it as a diagnostic ("is my app fast when lazy?") more than a permanent switch.

**3. Trim auto-configuration.** Actuator can tell you what's being wired: `GET /actuator/conditions` shows `@ConditionalOn*` matches. If you never use MongoDB, exclude its auto-config rather than letting the classpath scan it:

```java
@SpringBootApplication(exclude = {
    MongoAutoConfiguration.class,
    ElasticsearchClientAutoConfiguration.class,
    // ... anything present on the classpath but unused
})
```

Each excluded auto-config saves the class-loading and bean-registration work of that subsystem.

**4. Spring AOT — ahead-of-time processing.** Spring Boot 3's **AOT engine** runs the container's configuration decisions *at build time* instead of runtime: it analyzes `@Configuration` classes, generates bean definitions and hints, and produces a `RuntimeHints` metadata. Benefits:

- Faster startup even on the JVM (less reflection at boot).
- It's the required step for **GraalVM native images** — compiling the whole app (Spring + your code) into a single native binary that starts in **milliseconds** instead of seconds.

```bash
# Native build (spring-boot-maven-plugin with native profile):
./mvnw -Pnative native:compile
# Produces ./target/app — starts in ~50-200ms, no JVM, no classpath
```

Native is the biggest win for serverless cold starts, at the cost of longer builds and reflection limits (Spring emits the reachability metadata for you, but exotic reflection in *your* code may need `@RegisterReflectionForBinding` hints).

**5. Async the runners.** `ApplicationRunner`s that warm caches or ping dependencies delay the port opening. If the work isn't critical to correctness, run it on a thread or `@Async` so first traffic isn't blocked.

## How we use it in an organization: the scenarios

**Scenario 1 — scale-to-zero API (Render free tier).** The instance sleeps after 15 min idle; the first request after sleep pays cold start. `@Lazy` on the heavy beans + trimming unused auto-config cuts the sleep-wake cost from ~15s to ~4s — the difference between "slow first request" and "acceptable".

**Scenario 2 — serverless function (AWS Lambda / functions-as-a-service).** Container image functions run Spring Boot per invocation. Native image (`-Pnative native:compile`) brings cold start from seconds to ~100ms — the difference between "serverless-friendly" and "serverless-hostile". This is the canonical Spring AOT + GraalVM use case.

**Scenario 3 — CI test suites.** Test contexts boot many times. `@SpringBootTest` with `spring.main.lazy-initialization=true` (via a `application-test.properties`) plus `@DirtiesContext` avoidance can cut a suite's wall time substantially.

## Pitfalls

- **`@Lazy` hides failures** — a broken bean surfaces at first use, mid-request. Acceptable for optional features; bad for core paths.
- **Native image is not free** — builds take minutes, dynamic classloading/reflection in your code needs hints, and some libraries (certain profilers, dynamic proxies over non-annotated classes) need metadata. Start native with a small service; don't rewrite everything at once.
- **Auto-config exclusions break when you later add the feature** — the exclude silently stays; review exclusions when upgrading dependencies.
- **Don't optimize the wrong phase** — profile first; "faster startup" without a measurement is guesswork.

## Key takeaways

- Startup cost is real when scale-to-zero: measure cold start, then target the slow beans.
- `@Lazy` for heavy rarely-used beans; global lazy-init as a diagnostic, not a default.
- Trim unused auto-configurations; verify with `/actuator/conditions`.
- Spring AOT + GraalVM native = millisecond starts for serverless.
- Async non-critical runners so the port opens before the warmup finishes.
