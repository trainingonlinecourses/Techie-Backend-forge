---
title: Deploying Native Images — Containers, CI, and Production Patterns
module: graalvm-native
order: 4
minutes: 25
topics: ["deployment", "containers", "CI/CD", "buildpacks", "distroless", "production native", "observability"]
docs:
  - title: "Native Image and Containers (GraalVM docs)"
    url: "https://www.graalvm.org/latest/docs/reference-manual/native-image/guides/containerise-native-executable-and-run-in-docker-container/"
  - title: "Spring Boot Native Deployment"
    url: "https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html#packaging.native-image"
summary: A native binary is a different artifact than a jar: no JVM to install, no classpath to manage, a tiny container image, millisecond cold starts. But...
---

# Deploying Native Images — Containers, CI, and Production Patterns

## The Concept: The Binary Changes the Deployment

A native binary is a *different artifact* than a jar: no JVM to install, no classpath to manage, a tiny container image, millisecond cold starts. But deployment isn't just "smaller container" — it's a *different operational model*: the image is immutable (config is baked in), the build is slow (CI must be designed for it), and the runtime needs a different observability story (no JVM diagnostics). This lesson is the production playbook: containers, CI, and the operational patterns that make native deployment routine.

**The mental model:** deploying a jar is shipping a recipe to a kitchen that has all the equipment (the JVM); deploying a native binary is shipping a *pre-cooked meal* — no kitchen needed, but you must decide the ingredients (config, resources) at cooking time. The container is the meal tray; the CI pipeline is the kitchen; and the operational question shifts from "which JVM?" to "what did the build bake in, and what does the environment still control?"

## The Container Story

```bash
# The buildpacks path — the standard, zero-Dockerfile route:
./mvnw -Pnative spring-boot:build-image
# Produces a small image: the native binary + a minimal base (Bellsoft
# Liberica or Paketo's static base) — no JVM, no shell, no package manager.

docker run -p 8080:8080 academy:1.0.0

# Inspect the win:
docker images | grep academy
# academy:1.0.0  ~120-200MB  (a JVM Spring Boot image is typically 300-500MB+)
```

**Or the explicit Dockerfile** (for full control — distroless base):

```dockerfile
FROM gcr.io/distroless/base-debian12     # minimal, no shell, no package manager
COPY target/academy /app/academy
EXPOSE 8080
ENTRYPOINT ["/app/academy"]
```

**The container considerations:**
- **Distroless/static bases** — smallest, most secure (no shell to attack), but debugging inside is limited (no `bash`); the *logging and metrics must go out* via stdout and HTTP, not into the container.
- **Configuration is environment-only** — the image has no JVM flags to tune at runtime; `-Xmx`-style knobs are *build-time* choices. Runtime config = env vars + system properties.
- **Health checks** — the Actuator endpoints still work natively; the orchestrator (Render/K8s) probes them exactly as with a JVM app.

## The CI Pipeline: Designing Around the Slow Build

Native builds take **minutes** — CI must be architected for it, not surprised by it:

```yaml
# The CI shape — cache hard, build once, gate on tests:
jobs:
  build-and-test:            # the FAST loop (every commit)
    steps:
      - run: ./mvnw test                     # JVM suite — seconds
      - run: ./mvnw -Dspring.aot=true test   # AOT verification — fast-ish

  native:                    # the SLOW gate (release / deploy candidates)
    needs: build-and-test
    runs-on: [large-runner]                  # native builds need CPU + RAM
    steps:
      - uses: graalvm/setup-graalvm@v1
        with:
          java-version: '21'
          distribution: 'graalvm'
      - name: Cache GraalVM + build outputs
        uses: actions/cache@v4
        with:
          path: ~/.m2/repository   # the toolchain caches
          key: graalvm-${{ hashFiles('pom.xml') }}
      - run: ./mvnw -Pnative test            # the native suite — minutes
      - run: ./mvnw -Pnative spring-boot:build-image
      - run: docker push academy:${{ github.sha }}

  deploy:                     # the triggered path
    needs: native
    steps:
      - run: ./deploy.sh   # render/kubectl/etc.
```

**The three CI rules:** **cache everything** (the GraalVM toolchain, Maven repos, and native build outputs — a cached native build is seconds of delta instead of minutes of cold build); **run the native gate only when it earns its minutes** (deploys, release candidates — not every commit); and **use a build machine with headroom** (native compilation wants multiple cores and GBs of RAM).

## The Immutable-Image Operational Model

Native deployment is the ConfigMap/Secrets lesson taken to its logical end — **the image is immutable, and the environment is the configuration surface:**

1. **Build-time decisions are permanent** — the active Spring profile, the `application.properties` values, the GC choice (Serial vs G1), the heap strategy — all compiled in. Change them → rebuild.
2. **Runtime configuration = environment variables + system properties** — DB URLs, secrets, feature flags, external config files (`spring.config.additional-location`). This is exactly the 12-factor model: the image is one artifact, the environments are views over it.
3. **Secrets never baked** — the native build runs the app during AOT processing; *never* let real secrets reach the build environment (a build-time value can become a compile-time constant — scan and isolate). Secrets flow at runtime from the deployment platform's store.
4. **Rollbacks are image swaps** — since the image is immutable, "roll back" is "deploy the previous image" — the same as a jar, but faster (small image, instant start → near-zero-downtime rollbacks).

## Observability Without the JVM

The JVM's diagnostics (JFR, `jstack`, heap dumps) are gone. The native observability stack:

```java
// What replaces it:
// 1. Spring Boot Actuator — the same endpoints, working natively:
//    /actuator/health, /actuator/metrics, /actuator/prometheus
// 2. Micrometer + Prometheus — the standard metrics pipeline, unchanged:
//    micrometer-registry-prometheus -> /actuator/prometheus -> Grafana
// 3. Structured JSON logs to stdout — the container's log sink:
logging.pattern.console={"timestamp":"%d","level":"%p","logger":"%c","message":"%m"}%n
// 4. Distributed tracing — Micrometer Tracing + the collector, unchanged.
```

**The message:** the app-level observability surface (Actuator, Micrometer, structured logs) is *identical* in native — the framework's hints cover it. What changes is only the *JVM-internals* diagnostics (gone) and the *build-time* knobs (compile-time). If your monitoring was app-level (as it should be), native deployment barely changes it.

## The Deployment Checklist

1. **Test natively** (`-Pnative test`) — the reachability contract, gated in CI before deploys.
2. **Small image, distroless/static base**, health checks via Actuator.
3. **CI with cached GraalVM toolchain** and a native gate on deploy candidates only.
4. **Config via the environment** — profiles/values chosen at build; runtime variables via env vars; secrets from the platform's store, never the build.
5. **Observability via Actuator + Micrometer + JSON logs** — the app-level surface, unchanged from JVM.
6. **Rollback = image swap** — keep the previous image tag deployable; instant starts make rollbacks near-instant.
7. **Watch the runtime resources** — memory is smaller, but the GC choices were compiled in; verify under production load before committing to defaults.

## Recap

Deploying native images is a new operational model: **small immutable containers** (buildpacks or distroless — no JVM, environment-only config), **CI architected for minute-scale builds** (cache the toolchain, gate natively only on deploy candidates, use beefy runners), **environment-as-configuration** (profiles and values at build time; DB URLs, secrets, and flags at runtime — never secrets in the build), and **app-level observability that carries over unchanged** (Actuator, Micrometer, JSON logs — only the JVM-internal diagnostics are gone). The shifts are deliberate, not surprising: the image is the immutable application, the environment is the configuration surface, and instant startup makes scaling and rollback feel different from the JVM world. Follow the checklist and native deployment becomes the *routine* — fast, small, and boring — rather than the special project.
