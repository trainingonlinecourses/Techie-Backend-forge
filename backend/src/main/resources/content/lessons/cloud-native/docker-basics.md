---
title: Docker for Java Backends
summary: Images, layers, containers and the minimal workflow a Spring Boot developer needs — build, run, publish, and the mental model that makes it stick.
order: 1
minutes: 15
topics: [docker, containers, images, layers, dockerfile]
docs:
  - https://docs.docker.com/get-started/
  - https://docs.docker.com/guides/java/
---

# Docker for Java Backends

## The mental model

- **Image** — a frozen, layered filesystem + metadata (a "template"). Read-only, shareable, versioned.
- **Container** — a running *instance* of an image: its own process, its own filesystem view (image + a thin writable layer), its own network namespace. Start, stop, restart — the image never changes.
- **Registry** — where images live (Docker Hub, GHCR, the platform's registry); `pull`/`push` move them.

The critical mindset shift: the container is **stateless by default** — any file written inside it vanishes on restart. State lives in volumes, databases, or object storage (which is exactly why this academy's Postgres lives outside the app container).

## The image layer model

```
FROM eclipse-temurin:21-jre        layer A — base OS + JRE
WORKDIR /app                       metadata
COPY target/app.jar app.jar        layer B — the app binary
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

Every `COPY`/`RUN` becomes a **layer**; layers are cached and reused. Change one layer → only that layer and everything after it rebuilds. This is why the order matters: put the *slow-to-change* parts first (base image, dependencies) and the *fast-to-change* parts last (your jar) — so a code change re-uses the cached dependency layers.

## The workflow

```bash
docker build -t myapp:1.0 .          # build from Dockerfile
docker run -p 8080:8080 myapp:1.0    # run, mapping host:container port
docker ps / docker logs <id> / docker stop <id>
docker tag myapp:1.0 ghcr.io/me/myapp:1.0
docker push ghcr.io/me/myapp:1.0     # to the registry the platform pulls from
```

Run a Spring Boot app (this repo's backend):

```bash
docker build -f backend/Dockerfile -t academy-api backend
docker run --rm -p 8080:8080 -e APP_JWT_SECRET=dev-secret academy-api
curl http://localhost:8080/actuator/health
```

## Containers vs. VMs vs. bare metal

| | Bare metal | VM | Container |
|---|---|---|---|
| Isolation | process | full OS (hypervisor) | kernel namespaces + cgroups |
| Boot | minutes | tens of seconds | milliseconds |
| Density | 1 app | ~10s | hundreds |
| The trade | max performance | max isolation | max density + speed |

Containers are **not** lightweight VMs — they share the host kernel. The security model follows from that: a container escape is a host compromise, which is why production registries pin base images and scan for CVEs (the OWASP vulnerable-components discipline, applied to images).

## The mental checklist before writing a Dockerfile

1. **Base image**: use a *JRE* image (`eclipse-temurin:21-jre`), not a JDK image, for the runtime stage — smaller, fewer CVEs. (The multi-stage build lesson shows the JDK-in-build → JRE-in-run split.)
2. **Nobody knows what the JAR was built from** — the image must be reproducible: a Dockerfile that pins the base image version (`21-jre`, not `latest`).
3. **Don't run as root** — `USER` a non-root user (containers run as root by default; the security lessons' principle of least privilege applies to processes too).
4. **One process per container** — the JVM is the process. No sshd, no shell babysitters, no "run the app and the cron inside one container".
5. **Environment over files** — config via env vars (`APP_JWT_SECRET`, `DATABASE_URL`), never baked into the image (the 12-factor lesson).
6. **Stateless** — if the app writes files, they go to a volume or object storage — never assume the container's filesystem survives.

## Debugging the basics

```bash
docker build --progress=plain .      # see every layer step
docker run -it --entrypoint sh myapp # poke inside a container (read-only intent)
docker inspect myapp                 # config, mounts, networks, env
docker system df                     # "where did my disk go" — dangling images/layers
```

`docker inspect` answers most "why won't it start" questions: env vars, exposed ports, entrypoint — all visible without running.

## Key takeaways

- Images are layered templates; containers are disposable, stateless instances.
- Order Dockerfile layers slow-changing → fast-changing to exploit caching.
- Use a JRE base, run as non-root, one process per container, config via env.
- State lives outside the container (DB, volumes) — the container is cattle, not a pet.

Official docs: [Docker Get Started](https://docs.docker.com/get-started/) · [Docker for Java](https://docs.docker.com/guides/java/)
