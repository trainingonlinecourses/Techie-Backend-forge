---
title: The Docker Build Pipeline
module: cicd-devops
order: 2
minutes: 22
topics: ["Dockerfile", "multi-stage builds", "layers", "image size", "CI docker build", "registry"]
summary: CI produces a jar; Docker turns it into a deployable unit. The Dockerfile you write decides build time, image size, attack surface, and how fast yo...
docs:
  - title: "Docker best practices"
    url: "https://docs.docker.com/build/building/best-practices/"
---

# The Docker Build Pipeline

CI produces a jar; Docker turns it into a **deployable unit**. The Dockerfile you write decides build time, image size, attack surface, and how fast your deploys roll. This lesson covers multi-stage builds, layer caching, and the pipeline that ships the image.

## Multi-Stage Builds

Never ship a build toolchain in the runtime image. Two stages — build, then run:

```dockerfile
# Stage 1: build
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline          # cache deps
COPY src ./src
RUN mvn -B -DskipTests package

# Stage 2: run
FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 spring
COPY --from=build /app/target/*.jar app.jar
USER spring
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

The runtime image contains only the JRE + jar — the Maven toolchain, sources, and test artifacts are gone. Typical result: **~700MB build image → ~180MB runtime image**.

## Layer Caching: The Order That Matters

Docker caches layers; a layer only rebuilds when its inputs change. Order the instructions so *frequent changes come last*:

```dockerfile
COPY pom.xml .
RUN mvn -B dependency:go-offline   # cached unless pom.xml changes (rare)
COPY src ./src                      # invalidates on every code change
RUN mvn -B package                  # rebuild only when src changed
```

Dependency resolution (`go-offline`) runs once and caches — code edits skip it entirely. This turns a 5-minute build into a 30-second one.

## The JVM Dockerfile: Use a Layerd Jar

Spring Boot's layered jar makes caching even finer — dependencies, then classes:

```dockerfile
FROM eclipse-temurin:21-jre AS extract
WORKDIR /app
COPY target/*.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=extract app/dependencies/ ./
COPY --from=extract app/spring-boot-loader/ ./
COPY --from=extract app/snapshot-dependencies/ ./
COPY --from=extract app/application/ ./
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

Now a one-line code change rebuilds only the `application` layer — dependencies and Spring Boot loader layers come straight from cache.

## Health Checks in the Image

```dockerfile
FROM eclipse-temurin:21-jre
...
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1
```

The platform can now restart the container when the app is alive-but-broken.

## Non-Root and Read-Only

```dockerfile
RUN useradd --system --uid 10001 spring
USER spring
RUN mkdir -p /tmp && chmod 1777 /tmp   # JVM needs writable tmp

# Kubernetes:
#   runAsNonRoot: true
#   readOnlyRootFilesystem: true
```

Running as root in a container is the single most common security flaw — a compromise inside the app becomes a compromise of the host. Always drop privileges.

## Building in CI

```yaml
- name: Build and push image
  uses: docker/build-push-action@v6
  with:
    context: backend
    file: backend/Dockerfile
    push: true
    tags: |
      ghcr.io/yourorg/backend:${{ github.sha }}
      ghcr.io/yourorg/backend:latest
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`type=gha` uses GitHub Actions cache for Docker layers — the multi-stage caching now works across CI runs.

## Tags: Immutable > latest

- `latest` moves — a node that pulled it yesterday runs different code than one that pulls today.
- **Immutable tags** (`$sha`, `v1.2.3`) are reproducible: this image is exactly this code.

```yaml
tags: |
  ghcr.io/org/backend:${{ github.sha }}
  ghcr.io/org/backend:${{ github.ref_name }}    # v1.2.3 for release tags
```

Production deploys should reference the immutable sha, not `latest`.

## Scanning for Vulnerabilities

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: ghcr.io/org/backend:${{ github.sha }}
    severity: CRITICAL,HIGH
    exit-code: '1'
```

Fail the build on CRITICAL/HIGH findings. Trivy checks the base image, the jar's dependencies, and the OS packages.

## A Complete Image Pipeline

```yaml
jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - name: Build jar
        run: cd backend && ./mvnw -B -DskipTests package
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - name: Build + push image
        uses: docker/build-push-action@v6
        with:
          context: backend
          push: true
          tags: ghcr.io/org/backend:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
      - name: Scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ghcr.io/org/backend:${{ github.sha }}
          exit-code: '1'
```

## Summary

| Practice | Payoff |
|----------|--------|
| Multi-stage | Small runtime image, no toolchain |
| Dependency-first COPY order | Layer cache hits |
| Layered jar | Code-only rebuilds |
| Non-root USER | Security baseline |
| Immutable tags | Reproducible deploys |
| Trivy scan | Vulnerabilities blocked pre-deploy |
| gha cache | Fast CI across runs |

The image is your unit of deployment — the same artifact from CI goes to staging and production, byte-identical. Get the Dockerfile right and the rest of the platform (Kubernetes, probes, rollouts) becomes straightforward.
