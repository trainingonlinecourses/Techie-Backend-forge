---
title: Dockerfile Best Practices & Multi-Stage Builds
summary: Builders and runners, layer caching, .dockerignore, image size and the exact Dockerfile pattern for a Spring Boot app.
order: 2
minutes: 14
topics: [dockerfile, multi-stage build, layer caching, dockerignore, image size]
docs:
  - https://docs.docker.com/build/building/best-practices/
  - https://docs.spring.io/spring-boot/reference/packaging/container-images.html
---

# Dockerfile Best Practices & Multi-Stage Builds

## The multi-stage pattern

The classic mistake: one stage that installs the JDK + Maven, compiles, and runs — shipping a multi-GB image full of build tools and source. **Multi-stage builds** split it: the *builder* stage compiles; the *runner* stage contains only the JRE + the jar.

```dockerfile
# ── Stage 1: builder (JDK + Maven, cached aggressively) ──
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -q -B dependency:go-offline          # cache dependencies as its own layer
COPY src ./src
RUN mvn -q -B -DskipTests package

# ── Stage 2: runner (JRE only — the deployable image) ──
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /build/target/app.jar app.jar
RUN useradd -r app && USER app              # least privilege
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
```

The result: a ~250 MB runner vs. a ~1 GB single-stage image — and the builder's layers cache so only `mvn package` reruns on code changes.

## Layer caching: the discipline

```
COPY pom.xml .          → layer A (changes only when dependencies change)
RUN mvn go-offline      → layer B (expensive, cached by A)
COPY src .              → layer C (changes on every code change)
RUN mvn package         → layer D (reruns when C changes)
```

Rules that make CI fast:

1. **Copy manifests before sources** — dependency resolution caches; the 2-minute `go-offline` doesn't rerun on every commit.
2. **Order by change frequency** — the rarest changes first.
3. **One logical step per `RUN`** — each `RUN` is a cacheable layer; chaining unrelated commands destroys the cache granularity.
4. **Never `COPY . .` at the top** — a `target/` directory or `.git` invalidates every layer below it.

## .dockerignore

```dockerignore
target/
.git/
.idea/
*.log
backend/data/
.env*
```

`.dockerignore` is to the build context what `.gitignore` is to git: the build context (sent to the Docker daemon) is all of `.` unless excluded — a repo with `projects/` demos and a local H2 `data/` dir balloons the context and poisons the cache. **Minimal context = fast builds + no secrets in the image.**

## Size and supply chain

- **Base image**: `eclipse-temurin:21-jre` (Debian) vs `-alpine`/`-slim` variants; JRE over JDK for runtime; pin the version, never `latest` (reproducibility + the OWASP vulnerable-components lesson).
- **Scan in CI**: `docker scan` / Trivy / Grype on every build — a CVE in the base image is a deployment you already shipped.
- **Distroless** (`gcr.io/distroless/java21-debian12`) drops the shell entirely — smaller, and the attack surface loses package managers and shells. Trade-off: harder to exec into for debugging; many teams use it for the runtime stage.

## Spring Boot's built-in image support

Spring Boot's Maven plugin can build OCI images directly (`mvn spring-boot:build-image` → Cloud Native Buildpacks) — layers the app jar into dependencies/classes/resources for optimal caching, without a Dockerfile. It's the zero-Dockerfile path; the explicit multi-stage Dockerfile is the "I control every layer" path. Both are legitimate — this repo uses the Dockerfile approach in `backend/Dockerfile`.

## The checklist before shipping a Dockerfile

```text
□ multi-stage (builder JDK → runner JRE)
□ pinned base image versions
□ COPY pom before src (dependency layer caching)
□ .dockerignore keeps the context minimal
□ non-root USER
□ ENTRYPOINT as the exec form ["java", ...] — not shell form (signal handling!)
□ config via env vars, nothing baked in
□ image scanned for CVEs in CI
```

The `ENTRYPOINT` exec-form note matters for Kubernetes: exec form runs java as PID 1 (signals work, graceful shutdown happens); shell form (`ENTRYPOINT java -jar ...`) spawns a shell wrapper that swallows SIGTERM — the app gets killed, not stopped.

## Key takeaways

- Multi-stage: build with the JDK, ship with the JRE — 4× smaller and cleaner.
- Order layers by change frequency; copy manifests before sources for dependency caching.
- `.dockerignore` keeps the context small and secrets out; scan images in CI.
- Exec-form ENTRYPOINT, non-root user, pinned base, config via env — the production baseline.

Official docs: [Dockerfile best practices](https://docs.docker.com/build/building/best-practices/) · [Spring Boot container images](https://docs.spring.io/spring-boot/reference/packaging/container-images.html)
