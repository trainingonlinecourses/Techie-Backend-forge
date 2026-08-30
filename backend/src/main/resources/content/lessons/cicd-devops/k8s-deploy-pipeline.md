---
title: Deploying Spring Boot to Kubernetes
module: cicd-devops
order: 3
minutes: 25
topics: ["Deployment", "Service", "Ingress", "probes", "resource limits", "rolling update", "kubectl"]
summary: The Docker image is your unit; Kubernetes is the orchestrator that runs it, scales it, restarts it, and routes traffic to it. This lesson walks a c...
docs:
  - title: "Kubernetes concepts"
    url: "https://kubernetes.io/docs/concepts/"
---

# Deploying Spring Boot to Kubernetes

The Docker image is your unit; Kubernetes is the orchestrator that runs it, scales it, restarts it, and routes traffic to it. This lesson walks a complete Spring Boot deployment: Deployment, Service, Ingress, probes, limits, and a zero-downtime rollout.

## The Objects

| Object | Purpose |
|--------|---------|
| **Deployment** | Desired state: image, replicas, strategy |
| **Pod** | One running instance (created by the Deployment) |
| **Service** | Stable network identity + load balancing |
| **Ingress** | External HTTP routing (hostnames, TLS) |
| **ConfigMap** | Non-secret config (yml, properties) |
| **Secret** | Sensitive config (base64, encrypted at rest) |

## The Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  labels: { app: backend }
spec:
  replicas: 3
  selector:
    matchLabels: { app: backend }
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  template:
    metadata:
      labels: { app: backend }
    spec:
      containers:
        - name: backend
          image: ghcr.io/org/backend:abc123def      # immutable tag
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: prod
            - name: DB_URL
              valueFrom:
                secretKeyRef: { name: db-secret, key: url }
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits:   { cpu: "1", memory: 1Gi }
          startupProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 5
            failureThreshold: 30          # give the JVM up to 150s to start
          livenessProbe:
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            periodSeconds: 5
            failureThreshold: 3
```

## The Three Probes (the part that actually matters)

| Probe | Question | Action on failure |
|-------|----------|-------------------|
| startupProbe | Has the app finished booting? | Restart, but only during startup |
| livenessProbe | Is the process alive? | Kill + restart the container |
| readinessProbe | Can it serve traffic? | Remove from Service endpoints |

The startup probe is critical for Spring Boot: a cold JVM can take 60–120s to boot, and a liveness probe with a short timeout would kill it mid-startup forever. Give startup a generous `failureThreshold`, then let liveness take over.

```yaml
# The classic cold-start fix
startupProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  initialDelaySeconds: 10
  periodSeconds: 5
  failureThreshold: 30
```

## Resources: Requests vs. Limits

```yaml
resources:
  requests: { cpu: 250m, memory: 512Mi }   # scheduler guarantee
  limits:   { cpu: "1", memory: 1Gi }      # hard cap
```

- **requests** — what the scheduler reserves; pods over this share CPU.
- **limits** — hard ceiling; exceeding memory limit = OOM kill, exceeding CPU = throttling.
- No limits → a runaway pod can starve the node. No requests → the scheduler overcommits and evicts you.

## The Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector: { app: backend }
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP
```

Pods are ephemeral (their IPs change on every restart); the Service is stable. Traffic to `backend:80` load-balances across the ready pods.

## The Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: backend-ingress
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: backend
                port: { number: 80 }
  tls:
    - hosts: [api.example.com]
      secretName: tls-secret
```

## Config and Secrets

```yaml
# ConfigMap — non-secret config
apiVersion: v1
kind: ConfigMap
metadata: { name: backend-config }
data:
  application.yml: |
    app:
      features:
        ai-tutor: true
        byok: true
---
# Secret — sensitive values (base64)
apiVersion: v1
kind: Secret
metadata: { name: db-secret }
type: Opaque
stringData:            # k8s 1.25+: plaintext at authoring time
  url: jdbc:postgresql://db:5432/app
  username: app
  password: s3cret
```

Spring Boot picks these up as `SPRING_CONFIG_IMPORT=configmap:/etc/config/application.yml` or via env vars with `valueFrom`. **Never** put secrets in ConfigMaps or commit them.

## The Rolling Update

With `maxUnavailable: 0, maxSurge: 1`, a deploy:

1. Creates a new pod (surge) — waits for readiness.
2. Routes traffic to the new pod.
3. Terminates one old pod.
4. Repeats until all 3 are new.

Result: zero downtime, zero dropped requests — as long as readiness is accurate.

```bash
kubectl set image deployment/backend backend=ghcr.io/org/backend:newsha
kubectl rollout status deployment/backend
kubectl rollout undo deployment/backend        # instant rollback
```

## Deploying From CI

```yaml
- name: Deploy to Kubernetes
  env:
    KUBECONFIG: ${{ secrets.KUBECONFIG }}
  run: |
    kubectl set image deployment/backend \
      backend=ghcr.io/org/backend:${{ github.sha }}
    kubectl rollout status deployment/backend --timeout=300s
```

Or with a GitOps tool (ArgoCD/Flux): CI pushes the image tag into a git repo; the operator applies it. Git becomes the single source of truth for *what's running*.

## Zero-Downtime Checklist

- ✅ RollingUpdate strategy (`maxUnavailable: 0`)
- ✅ Accurate readiness probe (checks real dependencies)
- ✅ Generous startup probe (JVM cold start)
- ✅ Resource limits on every container
- ✅ Immutable image tags
- ✅ Rollback plan (`kubectl rollout undo`)

## Summary

| Object | You set | Platform does |
|--------|---------|---------------|
| Deployment | Image, replicas, probes, limits | Create pods, self-heal, roll |
| Service | Selector + port | Stable IP, LB across ready pods |
| Ingress | Host + path + TLS | External routing |
| Probes | HTTP paths + thresholds | Restart / drain / route |
| Config/Secret | Values | Mount into pods |

Kubernetes rewards precision: accurate probes and limits are what make rolling updates actually zero-downtime. The next lesson covers blue-green and canary strategies that go beyond the built-in rolling update.
