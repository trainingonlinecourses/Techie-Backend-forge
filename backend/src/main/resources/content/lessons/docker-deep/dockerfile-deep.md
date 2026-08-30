---
title: The Dockerfile — Building Reproducible Images
module: docker-deep
order: 1
minutes: 26
topics: ["Dockerfile", "multi-stage builds", "base images", "layers", "build context"]
docs:
  - title: "Dockerfile reference"
    url: "https://docs.docker.com/reference/dockerfile/"
summary: A Docker image is a frozen snapshot of an application and everything it needs to run: the OS libraries, the runtime (JRE), the app's code, the conf...
---

# The Dockerfile — Building Reproducible Images

## The Concept: A Recipe for a Frozen Snapshot

A Docker image is a **frozen snapshot** of an application and everything it needs to run: the OS libraries, the runtime (JRE), the app's code, the config. A **Dockerfile** is the recipe for creating that snapshot — a sequence of instructions, each producing a **layer**.

Why "works on my machine" disappears with Docker: the image *is* the machine. The same image runs identically on your laptop, the CI server, and the production cluster — because it contains its own environment.

The mental model: the Dockerfile describes *construction steps* (install Java, copy the jar, set the command), Docker executes them, and the result is an immutable artifact. The image is the deliverable; the container is a *running instance* of it.

## The Anatomy of a Dockerfile

```dockerfile
# ---- 1. The base image — everything starts from something ----
FROM eclipse-temurin:21-jre

# ---- 2. Metadata ----
LABEL maintainer="academy@example.com"

# ---- 3. Environment ----
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75" \
    TZ=UTC

# ---- 4. Working directory ----
WORKDIR /app

# ---- 5. Copy the application ----
COPY target/academy-api-1.0.0.jar app.jar

# ---- 6. The user (security — don't run as root) ----
RUN useradd --system --uid 1001 appuser \
    && chown appuser /app
USER appuser

# ---- 7. Expose (documentation; the real mapping happens at run time) ----
EXPOSE 8080

# ---- 8. The startup command ----
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
```

### Walking Through Each Part

**`FROM`** — the foundation. `eclipse-temurin:21-jre` is a community-supported Java 21 runtime image (the JRE, not the JDK — you don't need compilers at runtime). **Choosing a base image is a supply-chain decision**: prefer official/verified images, pin versions (avoid `:latest`), and prefer slim/JRE variants to keep images small.

**`ENV`** — environment variables baked into the image (overridable at run time). The `\` continues the line; multi-var ENV keeps the layer count down.

**`WORKDIR`** — the working directory for subsequent instructions. Everything runs from `/app`; relative paths resolve against it.

**`COPY`** — copies files from the **build context** (the directory you build from) into the image. Only the *context* is visible to `COPY` — anything outside it is inaccessible unless the context includes it (and a `.dockerignore` excludes what it shouldn't — the equivalent of `.gitignore` for builds).

**`RUN useradd ... && chown ...`** — **never run the app as root.** A dedicated non-root user (`appuser`, uid 1001) limits the blast radius if the container is compromised. This is a baseline security practice (see the container-security lesson).

**`EXPOSE`** — documentation: "this image listens on 8080." It doesn't publish the port — the real mapping (`-p 8080:8080`) happens at run time.

**`ENTRYPOINT`** — the command that runs when the container starts. `sh -c` lets `$JAVA_OPTS` expand at runtime (so operators can override JVM settings without rebuilding).

## Layer Caching — The Performance Lever

Each instruction becomes a **layer**. Docker caches layers: if an instruction (and its inputs) hasn't changed, the cache is reused. **Order matters enormously**:

```dockerfile
# SLOW builds: every code change invalidates everything after the COPY
COPY target/academy-api-1.0.0.jar app.jar
RUN apt-get install -y some-rare-tool     # re-runs on every code change!

# FAST builds: expensive steps BEFORE the frequently-changing files
RUN apt-get install -y some-rare-tool     # cached — rarely changes
COPY target/academy-api-1.0.0.jar app.jar # only this layer (and after) rebuilds
```

The practice: **dependencies and tooling first (they change rarely), app code last (it changes every build).** For Java specifically, the multi-stage build below keeps the heavy Maven layer cached.

## Multi-Stage Builds — The Professional Pattern

```dockerfile
# ---- Stage 1: BUILD — the JDK + Maven build everything ----
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q dependency:go-offline          # fetch deps ONCE (cached layer)
COPY src ./src
RUN mvn -q -DskipTests package            # compile + package

# ---- Stage 2: RUN — only the runtime + the jar ----
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/academy-api-1.0.0.jar app.jar
USER 1001
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Why Multi-Stage Wins

- **Stage 1 has the JDK and Maven** — everything needed to *build*.
- **Stage 2 has only the JRE + the jar** — everything needed to *run*.
- **The final image excludes the build tools** — smaller (JRE, not JDK; no Maven, no source, no target classes), fewer vulnerabilities, faster pulls.

`COPY --from=build` grabs just the artifact from the first stage. The pattern generalizes to any stack: build in a fat stage, ship a slim stage.

## .dockerignore — What NOT to Send

```dockerignore
target/
.git/
*.log
.env*
node_modules/
```

The build context is sent to the Docker daemon — a `target/` directory full of jars, or `.git`, bloats every build and can leak secrets. `.dockerignore` excludes them (the equivalent of `.gitignore`). **Never build without one.**

## Common Beginner Pitfalls

1. **`FROM ... :latest`** — unreproducible: "latest" changes under you. Pin versions.
2. **Running as root** — the container is root by default; add a `USER`.
3. **Wrong order for caching** — dependencies after code = every build redoes everything.
4. **One giant layer** — a single `RUN apt-get install ... && curl ...` with no `.dockerignore` and no layer discipline; split and order for caching.
5. **Copying the fat build context** — no `.dockerignore`; `.git` and `target/` ship with every build.
6. **JDK in production** — JRE-only runtime images are smaller and safer; build with the JDK, run with the JRE.
7. **Secrets in the image** — `ENV API_KEY=...` bakes secrets into every layer; pass them at run time (the config module's rules apply in containers).

## Key Takeaways

- The Dockerfile is the recipe: each instruction is a layer; the image is the frozen result.
- Base images are supply-chain decisions: official, versioned, slim.
- Never run as root; never bake secrets; pin versions.
- Order instructions for layer caching: stable first, code last.
- Multi-stage builds: build fat, ship slim (JDK → JRE).
- `.dockerignore` keeps the build context lean and safe.
- The image is the machine — that's why "works on my machine" dies.
