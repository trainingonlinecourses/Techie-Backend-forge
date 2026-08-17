---
title: ConfigMaps & Secrets in Kubernetes
summary: Configuration as first-class objects — ConfigMaps for non-secret config, Secrets for credentials, and the env/volume wiring patterns.
order: 5
minutes: 13
topics: [configmap, secrets, kubernetes config, env injection, sealed secrets]
docs:
  - https://kubernetes.io/docs/concepts/configuration/configmap/
  - https://kubernetes.io/docs/concepts/configuration/secret/
---

# ConfigMaps & Secrets in Kubernetes

## Config is a cluster object

"Config in env vars" (the 12-factor way) works — but k8s makes config a **first-class, versioned object** instead of a pile of `-e` flags. Two objects, one rule:

| Object | Contents | Notes |
|---|---|---|
| **ConfigMap** | non-secret config (URLs, feature flags, log levels) | readable, diffable, safe in git |
| **Secret** | credentials (DB passwords, JWT secrets, API keys) | base64 in etcd (at rest: encrypted), never in git |

```yaml
# ConfigMap — the app's non-secret settings:
apiVersion: v1
kind: ConfigMap
metadata: { name: academy-api-config }
data:
  LOG_LEVEL: INFO
  APP_CORS_ORIGINS: "https://techie-backend-forge.vercel.app"
  SPRING_PROFILES_ACTIVE: prod

# Secret — the credentials:
apiVersion: v1
kind: Secret
metadata: { name: academy-api-secrets }
type: Opaque
stringData:                    # stringData is plain in the YAML; the API base64s it
  APP_JWT_SECRET: "change-me-32-characters-minimum"
  DATABASE_URL: "postgresql://user:pass@db.internal:5432/academy"
```

## Wiring into the pod

```yaml
spec:
  containers:
    - name: api
      envFrom:                                   # every key becomes an env var
        - configMapRef: { name: academy-api-config }
        - secretRef:    { name: academy-api-secrets }
      env:                                       # explicit overrides / remapping
        - name: APP_JWT_SECRET
          valueFrom:
            secretKeyRef: { name: academy-api-secrets, key: APP_JWT_SECRET }
```

Rules: **explicit `env` beats `envFrom`** (later wins), and a missing key in `envFrom` — with default `optional: false` — **fails the pod schedule**, which is the failure mode you want (fail fast, not silently run without a DB password).

## The rotation problem

Updating a Secret **does not restart pods** — env vars are read once at container start. The standard flow:

```bash
kubectl create secret generic academy-api-secrets --from-literal=APP_JWT_SECRET=... 
kubectl rollout restart deploy/academy-api      # pick up the new values
```

(With `envFrom` the restart is the rotation mechanism. Alternative: mount secrets as files and use Spring Cloud Kubernetes ConfigWatcher for live reload — heavier machinery, worth it only when secrets rotate continuously.)

## Keeping Secrets out of git

A Secret YAML with plaintext values in the repo is a credential leak in a costume. The tools:

- **Sealed Secrets** (Bitnami) — encrypt the Secret into a `SealedSecret` that only the cluster can decrypt; the sealed YAML is safe to commit.
- **External Secrets Operator** — pull secrets from a real vault (AWS Secrets Manager, Vault, GCP) into k8s Secrets; the cluster stores references, not values.
- **Helm + `--set` / values from CI** — the secret values live in the CI secret store, injected at deploy time.

The discipline is the same one this academy uses on Render: **secrets live in the platform's secret store (`$SECRET`/env), never in the repo** — k8s just has more places to lose them (ConfigMap vs Secret vs values file), so the git boundary is even more important.

## ConfigMap as volume: files, not just env

```yaml
spec:
  containers:
    - name: api
      volumeMounts: [ { name: config, mountPath: /etc/app/config } ]
  volumes:
    - name: config
      configMap:
        name: academy-api-config
```

For file-based config (Spring's `spring.config.import: optional:file:/etc/app/config/extra.yml`), mount the ConfigMap as a volume — updates to the ConfigMap are reflected in the mounted files (within the sync interval), giving live-reload-ish behavior without env-var restarts.

## The immutable rule

```yaml
kind: ConfigMap
immutable: true        # or same on Secret
```

Mark long-lived config **immutable** — k8s skips watch/update overhead and, more importantly, prevents accidental mid-rollout changes. Rotate by creating `-v2` and updating the reference.

## Key takeaways

- ConfigMap = non-secret config, Secret = credentials; both become env vars or mounted files.
- Explicit env beats envFrom; missing required config fails scheduling (fail fast).
- Secret rotation = update + `rollout restart`; never put plaintext Secrets in git (Sealed Secrets / External Secrets / CI injection).
- Mount ConfigMaps as volumes for file-based config; mark config immutable when it shouldn't change.

Official docs: [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/) · [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/)
