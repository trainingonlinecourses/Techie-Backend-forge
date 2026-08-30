---
title: Container Security — Hardening Your Images
module: docker-deep
order: 5
minutes: 25
topics: ["non-root", "image scanning", "secrets", "supply chain", "distroless", "least privilege"]
summary: Containers provide isolation — but the isolation has limits: the kernel is shared with the host, and a compromised container is a beachhead for the...
docs:
  - title: "Docker security best practices"
    url: "https://docs.docker.com/engine/security/"
---

# Container Security — Hardening Your Images

## The Concept: The Container Is a Castle Wall, Not a Vault

Containers provide **isolation** — but the isolation has limits: the kernel is shared with the host, and a compromised container is a beachhead for the attacker. Container security is about making that beachhead as small and as unprofitable as possible.

Think of a medieval castle: the moat (container isolation) keeps casual raiders out, but the defenders still: keep the gates small (few ports), arm the guards (non-root), store valuables elsewhere (secrets), and inspect everyone entering (image scanning). The castle isn't a vault — it's a *layered defense*.

The four pillars:

1. **Run as non-root** — the most impactful single fix.
2. **Scan images** — never ship known-vulnerable software.
3. **No secrets in images** — credentials must never be baked in.
4. **Minimal surface** — slim/distroless images, few ports, least privilege.

## Pillar 1 — Run as Non-Root

By default, containers run as **root** (uid 0). A compromised root container gives the attacker root inside the container — and if the container escapes (a kernel exploit), root on the host. The fix is one instruction:

```dockerfile
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY target/app.jar app.jar

# Create an unprivileged user and run as it:
RUN addgroup --system appgroup \
    && adduser --system --ingroup appgroup appuser
USER appuser:appgroup

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

**The principle of least privilege**: the app needs *write access* to almost nothing (its own temp dir maybe) — so run it with an account that has almost nothing. If the app is compromised, the attacker inherits the app's limited rights, not root's.

Also consider `read_only` filesystems and dropped capabilities:

```yaml
# docker-compose.yml
services:
  backend:
    image: academy-api:1.0
    read_only: true                    # the filesystem is read-only
    tmpfs:
      - /tmp                            # except a scratch dir
    cap_drop:                           # remove Linux capabilities
      - ALL
    cap_add:
      - NET_BIND_SERVICE               # just enough to bind the port
```

## Pillar 2 — Scan Images

```bash
# Scan for known vulnerabilities (the standard tools):
docker scan academy-api:1.0             # Docker Scan (Snyk-powered)
trivy image academy-api:1.0             # Trivy — the CI favorite
grype academy-api:1.0                   # Anchore Grype

# In CI, fail the build on critical/high findings:
trivy image --severity CRITICAL,HIGH --exit-code 1 --ignore-unfixed academy-api:1.0
```

**The practice:** every base image update and every release gets scanned; CI *fails* on critical/high vulnerabilities. Base images are updated **frequently** (a JRE image from 6 months ago contains 6 months of accumulated CVEs). Scanning without a cadence is theater.

## Pillar 3 — No Secrets in Images

```dockerfile
# BAD — the secret is baked into a layer, readable by anyone with the image:
ENV API_KEY=sk-live-xxxxx
COPY config-with-password.properties /app/

# GOOD — the image contains no secrets; they're injected at run time:
#   docker run -e API_KEY=... academy-api
#   (or the platform's secret manager / Docker secrets / .env in dev)
```

**Why it's forbidden:** every `ENV`/`COPY` with a secret lands in an *image layer* — anyone who can pull the image (registry access, a leaked copy, a colleague) can `docker history` the layers and read the secret. The image is an artifact that gets copied around; secrets must never travel in it.

The safe pattern: **image = code + runtime only. Secrets = run-time injection** (environment variables from a secret manager, mounted secret files, or platform secrets like Render/Railway).

## Pillar 4 — Minimal Surface

| Lever | Effect |
|---|---|
| Multi-stage build | No JDK, Maven, or source in the runtime image |
| Slim/distroless base | No shell, package manager, or compilers to attack |
| `.dockerignore` | No `.git`, `target/`, logs in the image |
| Few ports | Only the app port exposed |
| `read_only` + `cap_drop` | The container can do almost nothing beyond serve |
| Non-root | Attacker inherits a limited account |

**Distroless** images (Google's `gcr.io/distroless/java21-debian12`) are the extreme: no shell, no package manager, no `curl` — just the runtime and your app. If the app is compromised, there's no shell for the attacker, no tools to pivot with. Debugging is harder (no `bash` to exec into), so teams trade debuggability for hardening — a deliberate, often correct trade for production runtimes.

## The Supply-Chain Question

Every image you pull is software you're trusting: base images, apt packages, dependency jars. The practice:

- **Pin versions** — `eclipse-temurin:21-jre` (tag), and lock dependencies in the build (Maven lockfiles, checksum-verified downloads).
- **Use verified/official images** — the Docker Hub "official" label, or your own registry mirror.
- **Scan every layer** — a vulnerability in the base image is a vulnerability in your image.
- **Sign/verify where you can** — content trust and signature verification for critical images.

## The Security Checklist

- [ ] Runs as a non-root user (`USER appuser`)
- [ ] Image scanned; CI fails on critical/high findings
- [ ] No secrets in any layer (env, files, labels)
- [ ] Multi-stage/slim/distroless build (no build tools at runtime)
- [ ] `.dockerignore` keeps the context lean
- [ ] Only necessary ports exposed; db/cache on internal networks
- [ ] `read_only` filesystem + dropped capabilities where feasible
- [ ] Base images updated and re-scanned on a cadence
- [ ] Container runtime updates tracked (the kernel matters too)

## Common Beginner Pitfalls

1. **Running as root "because it works"** — it works until the container is compromised; the `USER` instruction is one line.
2. **Secrets in `ENV` or copied files** — readable from image layers forever; inject at run time.
3. **Scanning once at the start** — vulnerabilities accrue; scan on a cadence and in CI.
4. **Fat images with build tools** — the JDK, Maven, `curl`, and a shell are all attack surface; strip them with multi-stage.
5. **Exposing the database to the host** — the DB should live on an internal network with no host ports.
6. **`:latest` base images** — unreproducible and un-scanable; pin versions.
7. **Thinking isolation is a vault** — containers share the kernel; defense-in-depth (non-root + read_only + no secrets) is the real protection.

## Key Takeaways

- Containers isolate but share the kernel — harden the container, not just the boundary.
- Non-root (`USER`) is the highest-impact hardening step.
- Scan images in CI and on a cadence; fail on critical/high.
- Secrets never belong in images — inject at run time from secret managers.
- Minimal surface: multi-stage, slim/distroless, few ports, read-only, dropped caps.
- Pin versions and trust your supply chain; the base image is your software too.
- Defense in depth: isolation alone is not security.
