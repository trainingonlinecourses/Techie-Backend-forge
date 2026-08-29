---
title: Deploying Spring Boot to Kubernetes
summary: Probes, resource limits, rolling updates and graceful shutdown — the deployment manifest details that separate a demo from a production Spring app.
order: 5
minutes: 15
topics: [spring boot kubernetes, probes, resource limits, rolling update, graceful shutdown]
docs:
  - https://docs.spring.io/spring-boot/reference/deployment/kubernetes.html
  - https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
---

# Deploying Spring Boot to Kubernetes

## The production deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: academy-api }
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxUnavailable: 0, maxSurge: 1 }   # one new at a time, none down
  selector: { matchLabels: { app: academy-api } }
  template:
    metadata: { labels: { app: academy-api } }
    spec:
      terminationGracePeriodSeconds: 60
      containers:
        - name: api
          image: ghcr.io/me/academy-api:1.0
          ports: [ { containerPort: 8080 } ]
          resources:
            requests: { cpu: 250m, memory: 512Mi }    # guaranteed scheduling floor
            limits:   { cpu: "1", memory: 1Gi }       # hard ceiling — OOM kills the pod
          startupProbe:                               # slow to start? this unlocks liveness
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 5
            failureThreshold: 30                       # up to 150s of startup grace
          livenessProbe:                               # dead → restart the pod
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            periodSeconds: 10
          readinessProbe:                              # ready → receive traffic
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            periodSeconds: 5
          envFrom:
            - secretRef: { name: academy-api-secrets } # from the ConfigMap/Secrets lesson
```

## The three probes — get them right or the rollout is theater

- **startupProbe** — "is the app alive enough to start trying?" Boot with JPA/schema init can take 30–60s; until the startup probe passes, liveness doesn't run (no false crash-kill of a still-booting JVM).
- **livenessProbe** — "is the process healthy?" On failure the pod is **restarted**. The classic bug: pointing liveness at a DB-dependent endpoint — a DB blip restarts the whole pod instead of letting the app recover. **Liveness must check the process, not the dependencies.**
- **readinessProbe** — "can this pod receive traffic?" On failure the pod is removed from the Service but **not restarted** — the right place for dependency checks (DB, downstreams), because a pod that can't reach the DB shouldn't take traffic, but shouldn't be killed either.

Spring Boot's Actuator splits these exactly: `/actuator/health/liveness` and `/actuator/health/readiness` — liveness excludes dependencies, readiness includes them. (This academy's Render deployment uses the same health endpoint; on k8s you wire the probes to it.)

## Resource requests vs limits

```yaml
resources:
  requests: { cpu: 250m, memory: 512Mi }   # what the scheduler reserves — the floor
  limits:   { cpu: "1", memory: 1Gi }      # the ceiling — exceeding memory = OOM-kill
```

- **requests** guarantee the pod a place to run and CPU share; **limits** bound it. Missing requests → the scheduler over-commits a node and everyone thrashes.
- **CPU is compressible** (throttled at the limit), **memory is not** (exceeding the limit = OOM kill) — which is why the JVM must stay inside the container's memory: `-XX:MaxRAMPercentage=75` (the Dockerfile lesson) sizes the heap to the cgroup, not the node.
- Never set limits equal to requests by default — you pay for idle reservation; the guidance: requests for guarantees, limits as a safety net, measured from the app's real footprint.

## Graceful shutdown — the detail users feel

A pod being terminated gets **SIGTERM**, a grace period, then SIGKILL. If the app doesn't handle SIGTERM, in-flight requests are cut mid-response:

```yaml
# application.yml
server.shutdown: graceful          # Spring Boot stops accepting new requests,
spring.lifecycle.timeout-per-shutdown-phase: 20s   # drains in-flight ones
terminationGracePeriodSeconds: 60  # k8s waits before SIGKILL
```

The sequence: readiness flips to false (no new traffic) → SIGTERM → in-flight requests drain → JVM exits → the old pod is removed. Without it: dropped requests during every deploy — "random" user-facing errors that correlate with releases.

## The rollout loop

```bash
docker build -t academy-api:1.1 . && docker push ghcr.io/me/academy-api:1.1
kubectl set image deploy/academy-api api=ghcr.io/me/academy-api:1.1
# or edit the manifest (GitOps) and kubectl apply -f
kubectl rollout status deploy/academy-api     # watches the new pods become ready
kubectl rollout undo deploy/academy-api       # if a probe failed — back to 1.0
```

The rollout **pauses if readiness never passes** (maxUnavailable: 0 means the old version keeps serving) — the probes are what make "deploy" a safe operation instead of a prayer. If a bad image fails readiness, the rollout stalls, the old version is untouched, and `rollout undo` is instant.

## Key takeaways

- startup unlocks liveness; liveness = process health (restart on failure); readiness = dependency health (no traffic, no restart).
- Wire probes to `/actuator/health/liveness` and `/actuator/health/readiness`.
- requests = scheduling floor, limits = hard ceiling; size the JVM with `-XX:MaxRAMPercentage` to the container's memory.
- Graceful shutdown (`server.shutdown: graceful` + termination grace period) = no dropped requests on deploy.
- maxUnavailable: 0 + readiness = safe rollouts; `rollout undo` is the instant rollback.

Official docs: [Spring Boot on Kubernetes](https://docs.spring.io/spring-boot/reference/deployment/kubernetes.html) · [Resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
