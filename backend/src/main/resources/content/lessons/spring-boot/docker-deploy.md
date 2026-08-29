---
title: Dockerizing Spring Boot — From JAR to Container
summary: Multi-stage Dockerfiles, layer caching, Jib vs Dockerfile, .dockerignore, health checks, and how organizations build production-ready containers with minimal image size and fast builds.
order: 39
minutes: 20
topics: [docker, dockerfile, multi-stage-build, layer-caching, jib, container, health-check, image-size, dockerignore]
docs:
  - https://docs.docker.com/develop/develop-images/multistage-build/
  - https://docs.spring.io/spring-boot/docs/current/packaging-image.html
---

# Dockerizing Spring Boot — From JAR to Container

## The concept

Docker packages your Spring Boot app with its runtime into a **container image**. The image is a read-only template; each running instance is a container. Docker ensures your app runs identically in dev, staging, and production.

**Why Docker matters for Spring Boot:**
- Eliminates "works on my machine" — the container includes the JRE.
- Enables Kubernetes deployment — pods run containers.
- Simplifies scaling — spin up 10 identical containers.
- Layer caching — rebuilds are fast when only code changes.

## Basic Dockerfile

```dockerfile
# Stage 1: build
FROM eclipse-temurin:21-jdk AS builder
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN ./mvnw package -DskipTests -q

# Stage 2: run
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Multi-stage build:** the first stage uses the full JDK to compile; the second stage uses only the JRE. This reduces the final image from ~600MB to ~250MB.

## Optimized Dockerfile with layer caching

Spring Boot's layered JARs enable Docker layer caching. Libraries change rarely; your code changes often. By caching the library layer, only the thin code layer rebuilds on each push:

```dockerfile
FROM eclipse-temurin:21-jre AS runner
WORKDIR /app

# Layer 1: dependencies (cached — rarely changes)
COPY target/dependencies/ ./
# Layer 2: spring-boot-loader (cached)
COPY target/spring-boot-loader/ ./
# Layer 3: snapshot dependencies (cached)
COPY target/snapshot-dependencies/ ./
# Layer 4: application code (changes every build)
COPY target/application/ ./

EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

To create these layers, use the Spring Boot Maven plugin:

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <layers>
            <enabled>true</enabled>
        </layers>
    </configuration>
</plugin>
```

```bash
mvn package -DskipTests
java -Djarmode=layertools -jar target/app.jar extract --destination target/layers
```

## .dockerignore

```
target/
.idea/
*.iml
.git/
.gitignore
Dockerfile
docker-compose.yml
```

Without `.dockerignore`, the Docker build context includes `target/` (compiled classes) and `.git/` (history), making builds slow and images large.

## Health checks

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1
```

Or using Spring Boot's built-in endpoint:

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD java -cp /app/app.jar org.springframework.boot.loader.launch.JarLauncher --health || exit 1
```

Docker marks the container as `unhealthy` if the check fails 3 times. Orchestrators (Kubernetes, Docker Swarm) restart unhealthy containers.

## Docker Compose for local development

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/appdb
      - SPRING_DATASOURCE_USERNAME=app
      - SPRING_DATASOURCE_PASSWORD=secret
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16
    environment:
      - POSTGRES_DB=appdb
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=secret
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      timeout: 3s
      retries: 5
```

## Jib — build Docker images without Docker

Jib (from Google) builds optimized Docker images directly from Maven/Gradle — no Dockerfile, no Docker daemon:

```xml
<plugin>
    <groupId>com.google.cloud.tools</groupId>
    <artifactId>jib-maven-plugin</artifactId>
    <version>3.4.4</version>
    <configuration>
        <from>
            <image>eclipse-temurin:21-jre</image>
        </from>
        <to>
            <image>registry.example.com/backendforge-api</image>
            <tags>
                <tag>${project.version}</tag>
            </tags>
        </to>
        <container>
            <jvmFlags>
                <jvmFlag>-Xms256m</jvmFlag>
                <jvmFlag>-Xmx512m</jvmFlag>
            </jvmFlags>
            <ports>8080</ports>
            <creationTime>USE_CURRENT_TIMESTAMP</creationTime>
        </container>
    </configuration>
</plugin>
```

```bash
# Build and push to registry (no Docker daemon needed)
mvn compile jib:build

# Build locally for testing
mvn compile jib:dockerBuild
```

## How we use it in organizations

### Scenario 1: production Dockerfile with security

```dockerfile
FROM eclipse-temurin:21-jre AS runner

# Run as non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser
WORKDIR /app
COPY --chown=appuser:appuser target/app.jar app.jar

USER appuser

EXPOSE 8080
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", "app.jar"]
```

Key flags:
- `UseContainerSupport` — JVM respects Docker memory limits.
- `MaxRAMPercentage=75%` — heap uses 75% of container memory, leaving room for metaspace and native memory.
- `User appuser` — never run as root in production.

### Scenario 2: CI/CD Docker build

```yaml
# .github/workflows/docker.yml
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build JAR
        run: mvn package -DskipTests
      - name: Build Docker image
        run: docker build -t backendforge-api:${{ github.sha }} .
      - name: Push to ECR
        run: docker push $ECR_REGISTRY/backendforge-api:${{ github.sha }}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| No `.dockerignore` | Slow builds, large images |
| Using JDK image in production | 2x larger image than JRE |
| Running as root | Security vulnerability |
| Not setting JVM memory flags | OOMKilled by Docker |
| No health check | Orchestrator cannot detect unhealthy containers |
| `COPY . .` before `pom.xml` | Breaks layer caching — rebuilds everything |
