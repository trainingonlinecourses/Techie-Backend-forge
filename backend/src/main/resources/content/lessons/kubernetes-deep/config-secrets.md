---
title: ConfigMaps and Secrets — Configuration Without Rebuilding Images
module: kubernetes-deep
order: 4
minutes: 25
topics: ["ConfigMap", "Secrets", "configuration", "environment variables", "mounted volumes"]
docs:
  - title: "ConfigMaps (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/configuration/configmap/"
  - title: "Secrets (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/configuration/secret/"
summary: The worst deployment antipattern is baking configuration into the image: change a database URL, a feature flag, a log level → rebuild and redeploy ...
---

# ConfigMaps and Secrets — Configuration Without Rebuilding Images

## The Concept: Config Is Data, Not Code

The worst deployment anti-pattern is *baking configuration into the image*: change a database URL, a feature flag, a log level → rebuild and redeploy the container. **ConfigMaps** (non-secret config) and **Secrets** (sensitive config) decouple configuration from the image: the same image runs in dev, staging, and prod, differing only in the config injected at deploy time. One image, many environments.

**The mental model:** the container image is the binary of your app; ConfigMaps and Secrets are the *settings files* handed to it when it starts. Same program, different settings per environment — no rebuilds, no "prod image" vs "dev image". Spring Boot's entire externalized-config philosophy (properties, profiles, env vars) is the natural partner: K8s provides the config; Spring reads it.

## ConfigMap: Non-Secret Configuration

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: payments-config
data:
  # Plain key-value pairs:
  APP_LOG_LEVEL: INFO
  FEATURE_NEW_CHECKOUT: "true"

  # Or whole config files (here, an application.yaml fragment):
  application.yaml: |
    spring:
      datasource:
        url: jdbc:postgresql://postgres:5432/academy
      jpa:
        show-sql: false
```

**Injecting it — two ways:**

```yaml
# Way 1 — as environment variables (the most common for 12-factor apps):
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: payments
          image: myrepo/payments:2.1
          envFrom:                    # pull ALL keys as env vars
            - configMapRef:
                name: payments-config
          env:                        # or pick specific keys:
            - name: APP_LOG_LEVEL
              valueFrom:
                configMapKeyRef:
                  name: payments-config
                  key: APP_LOG_LEVEL

# Way 2 — as a mounted file (for config files Spring Boot reads directly):
#         volumes:
#           - name: config
#             configMap:
#               name: payments-config
#         volumeMounts:
#           - name: config
#             mountPath: /app/config
```

**Which to use?** Env vars are the simplest and the Spring Boot natural (Spring's relaxed binding maps `APP_LOG_LEVEL` to `app.log.level`). Mounted files shine when you have *structured* config — mount the ConfigMap's `application.yaml` key at `/app/config/application.yaml` and add `spring.config.additional-location=/app/config/` so Spring Boot loads it on top of the packaged defaults. A change to the ConfigMap doesn't restart pods automatically (env vars are set at container start) — a rolling restart (`kubectl rollout restart`) picks up changes.

## Secret: The Sensitive Cousin

**Secrets** are the same mechanism for sensitive values — API keys, database passwords, JWT signing keys:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: payments-secrets
type: Opaque
stringData:                 # plain-text here; K8s base64-encodes for storage
  DB_PASSWORD: hunter2
  JWT_SECRET: change-me-in-prod
  OPENAI_API_KEY: sk-...
```

**The critical honesty about Secrets:** a Secret is *not* encrypted by default — the `data` values are only **base64-encoded** (obfuscation, not encryption). Anyone who can read etcd (or has cluster admin) can read your secrets. Real secret protection requires **encryption at rest** (K8s 1.13+ supports encrypting Secrets in etcd with a KMS provider) and, far more importantly, **a secret manager** — the industry standard:

- **External Secrets Operator** — syncs secrets from AWS Secrets Manager / GCP Secret Manager / Vault into K8s Secrets automatically.
- **Sealed Secrets** — encrypts secrets in Git (the SealedSecret controller decrypts them in-cluster).
- **Vault** — the heavyweight: dynamic credentials, rotation, audit.

The modern rule: **never store real secrets in Git; store them in a secret manager and sync (or reference) them into the cluster.** A Secret in Git is a breach waiting to happen.

**Injecting Secrets** is identical to ConfigMaps (env vars via `secretKeyRef`, or mounted files):

```yaml
env:
  - name: DB_PASSWORD
    valueFrom:
      secretKeyRef:
        name: payments-secrets
        key: DB_PASSWORD
```

## The Spring Boot Connection

Spring Boot's externalized config *is* the K8s-native design: env vars have the highest precedence after command-line args. So the pipeline is seamless:

- ConfigMap keys → env vars → Spring's relaxed binding (`APP_LOG_LEVEL` → `logging.level.root`) or `SPRING_DATASOURCE_URL` → `spring.datasource.url`.
- Secret values → env vars → `@Value` or `@ConfigurationProperties` — never logged, never committed.

The one thing to *avoid*: putting secrets in `application.properties` inside the image. The image should be environment-agnostic; the environment supplies the config.

## The Best-Practice Checklist

1. **Config in ConfigMaps, secrets in Secrets — never in the image or Git.**
2. **Same image across environments** — only the injected config differs.
3. **Mount structured config as files** (Spring's `application.yaml`) when you have real structure; env vars for simple flags.
4. **Treat Secrets as base64-obfuscated, not encrypted** — encrypt etcd at rest; prefer a secret manager.
5. **Roll out config changes deliberately** (`kubectl rollout restart`) and verify the app picked them up (Actuator's `/actuator/configprops` or `/actuator/env` shows the effective values).
6. **Never log secrets** — and set Spring's `logging.level` accordingly; consider masked logging.

## Recap

ConfigMaps and Secrets decouple configuration from images: the same container runs everywhere, differing only in injected config. ConfigMaps hold non-sensitive settings (injected as env vars via `envFrom`/`configMapKeyRef` or as mounted files — Spring Boot's `application.yaml` idiom); Secrets hold sensitive values with identical mechanics — but are only base64-obfuscated by default, so real protection means encryption at rest and a secret manager (External Secrets, Vault, Sealed Secrets), never secrets in Git. Spring Boot's externalized-config design makes this native: env vars map to properties automatically. The payoff is the 12-factor ideal — one immutable image, configuration as data, environments as views.
