---
title: Docker Basics — Complete Beginner's Guide
summary: What Docker solves, containers vs VMs, images, layers, and the Dockerfile that packages a Spring Boot app.
order: 1
minutes: 20
topics: [docker, containers, images, layers, dockerfile, docker-compose]
docs:
  - https://docs.docker.com/get-started/
  - https://docs.docker.com/engine/reference/builder/
---

# Docker Basics — Complete Beginner's Guide

## What Docker solves

**The problem:** "It works on my machine!" — your code runs fine locally but breaks in production because the environment is different (different Java version, different OS, missing libraries).

**Docker's solution:** Package your code AND its environment into a **container** — a lightweight, portable unit that runs the same everywhere.

```
WITHOUT Docker:
  Developer's Mac: Java 21, PostgreSQL 15, /Users/alice/data
  Production Linux: Java 17, PostgreSQL 13, /var/lib/data
  → "It works on my machine!" breaks in production

WITH Docker:
  Developer's Mac: Container with Java 21, PostgreSQL 15, /app/data
  Production Linux: Container with Java 21, PostgreSQL 15, /app/data
  → Same container, same behavior everywhere
```

## Containers vs Virtual Machines

| | Container | Virtual Machine |
|---|---|---|
| **What it packages** | App + libraries + runtime | Full OS + app + libraries + runtime |
| **Size** | Megabytes | Gigabytes |
| **Startup** | Seconds | Minutes |
| **Isolation** | Process-level (shared kernel) | Hardware-level (full OS) |
| **Performance** | Near-native | Overhead from virtualization |

**Analogy:** A container is like an apartment (shared building, separate units). A VM is like a house (separate building, separate utilities).

## Images and layers

A Docker **image** is a read-only template. It's built in **layers** — each Dockerfile instruction creates a layer:

```dockerfile
# Layer 1: Start from a base image (Java 21 runtime)
FROM eclipse-temurin:21-jre-jammy              # Line 1: Base image (shared with other images)

# Layer 2: Set working directory
WORKDIR /app                                    # Line 2: Create /app directory

# Layer 3: Copy dependencies (changes rarely)
COPY target/academy-api-1.0.0.jar app.jar      # Line 3: Copy the JAR

# Layer 4: Set the command to run
ENTRYPOINT ["java", "-jar", "app.jar"]          # Line 4: What to run when container starts
```

**Why layers matter:** Docker caches layers. If you change only the JAR (layer 3), layers 1-2 are reused from cache — builds are fast!

## Docker commands you'll actually use

```bash
# Build an image from a Dockerfile
docker build -t academy-api .                    # Line 1: Build image, tag it "academy-api"
                                                 # Line 2: "." means current directory (Dockerfile location)

# Run a container from the image
docker run -p 8080:8080 academy-api              # Line 1: Map port 8080 (host) → 8080 (container)
                                                 # Line 2: Your app is now at http://localhost:8080

# Run in background (detached)
docker run -d -p 8080:8080 --name academy academy-api  # Line 1: -d = detached (background)
                                                        # Line 2: --name = give it a name

# See running containers
docker ps                                        # Shows running containers

# Stop a container
docker stop academy                              # Stops the container named "academy"

# See logs
docker logs academy                              # View container output
docker logs -f academy                           # Follow logs (like tail -f)
```

## Dockerfile — line by line

```dockerfile
# Stage 1: Build the app (multi-stage build)
FROM maven:3.9-eclipse-temurin-21 AS builder    # Line 1: Use Maven image for building
WORKDIR /build                                   # Line 2: Working directory for build
COPY pom.xml .                                   # Line 3: Copy build config first (caching!)
RUN mvn dependency:go-offline -B                 # Line 4: Download dependencies (cached if pom.xml unchanged)
COPY src ./src                                   # Line 5: Copy source code
RUN mvn package -DskipTests -B                   # Line 6: Build the JAR

# Stage 2: Run the app (smaller image)
FROM eclipse-temurin:21-jre-jammy                # Line 7: Runtime-only image (small!)
WORKDIR /app                                     # Line 8: Set working directory
COPY --from=builder /build/target/*.jar app.jar  # Line 9: Copy JAR from build stage
EXPOSE 8080                                      # Line 10: Document that the app uses port 8080
ENTRYPOINT ["java", "-jar", "app.jar"]           # Line 11: Command to run
```

**Multi-stage build benefits:**
- Build stage has Maven + JDK (~500MB) — needed for compilation
- Runtime stage has only JRE (~200MB) — smaller image, faster deployment
- Final image is ~250MB instead of ~700MB

## docker-compose — multi-container apps

```yaml
# docker-compose.yml — run the app + database together
version: '3.8'
services:
  app:                                            # Line 1: Your Spring Boot app
    build: .                                      # Line 2: Build from Dockerfile
    ports:
      - "8080:8080"                               # Line 3: Map ports
    environment:
      DATABASE_URL: jdbc:postgresql://db:5432/academy  # Line 4: Connect to the db service
    depends_on:
      - db                                        # Line 5: Start db first
    
  db:                                             # Line 6: PostgreSQL database
    image: postgres:16                            # Line 7: Use official Postgres image
    environment:
      POSTGRES_DB: academy                        # Line 8: Create this database
      POSTGRES_USER: academy                      # Line 9: Username
      POSTGRES_PASSWORD: secret                   # Line 10: Password
    volumes:
      - pgdata:/var/lib/postgresql/data           # Line 11: Persist data in a volume

volumes:
  pgdata:                                         # Named volume for database persistence
```

```bash
# Start everything
docker-compose up -d                              # Line 1: Start all services in background

# Stop everything
docker-compose down                               # Line 1: Stop and remove containers

# View logs
docker-compose logs -f app                        # Line 1: Follow app logs
```

## Real-world scenario — deploying a Spring Boot app

```bash
# Step 1: Build the JAR
mvn clean package -DskipTests

# Step 2: Build the Docker image
docker build -t academy-api:latest .

# Step 3: Run locally for testing
docker run -p 8080:8080 academy-api:latest

# Step 4: Push to a registry (Docker Hub, AWS ECR, etc.)
docker tag academy-api:latest myregistry/academy-api:latest
docker push myregistry/academy-api:latest

# Step 5: Pull and run on production
docker pull myregistry/academy-api:latest
docker run -d -p 8080:8080 myregistry/academy-api:latest
```

## Common mistakes

| Mistake | Why it's bad | Fix |
|---|---|---|
| Using `latest` tag in production | Unpredictable which version runs | Use specific tags (`academy-api:1.0.0`) |
| Running as root | Security risk | Add `USER appuser` in Dockerfile |
| Not using `.dockerignore` | Sends entire git history to Docker daemon | Create `.dockerignore` with `target/`, `.git/` |
| Single-stage builds | Huge images | Use multi-stage builds |
| Not copying `pom.xml` first | Can't cache dependencies | Copy `pom.xml` before `src/` |

## Key takeaways

- Docker packages app + environment into portable containers
- Containers are lightweight (MB, seconds) vs VMs (GB, minutes)
- Dockerfiles define images in layers — cache layers for fast builds
- Multi-stage builds: build with Maven, run with JRE — smaller images
- `docker-compose` runs multi-container apps (app + database) together

**Official docs:** [Docker Get Started](https://docs.docker.com/get-started/) · [Dockerfile Reference](https://docs.docker.com/engine/reference/builder/)
