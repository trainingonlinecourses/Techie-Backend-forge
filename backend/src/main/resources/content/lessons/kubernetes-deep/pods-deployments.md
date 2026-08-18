---
title: Pods, Deployments, and Workloads — Running and Updating Apps
module: kubernetes-deep
order: 2
minutes: 27
topics: ["Deployments", "pods", "ReplicaSet", "rolling updates", "StatefulSet", "probes", "resources"]
docs:
  - title: "Deployments (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"
  - title: "Configure Liveness, Readiness and Startup Probes (kubernetes.io)"
    url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/"
---

# Pods, Deployments, and Workloads — Running and Updating Apps

## The Concept: The Workload Controllers

Pods are ephemeral — you almost never create them directly. You create **workload controllers** — objects that *manage* pods on your behalf — and the most important is the **Deployment**: it owns a **ReplicaSet** (the "keep N pods alive" enforcer), which owns the pods. The hierarchy matters because each layer has one job: the Deployment defines *what* (image, replicas, update strategy); the ReplicaSet maintains *the count*; the pods are the running instances. This lesson is the full workload story: resources, probes, updates, and the other controllers you'll meet.

**The mental model:** the Deployment is a foreman. You tell the foreman "I want 3 workers doing this job, and if the job changes (new image), replace them gradually without stopping the site." The foreman (controller) keeps a checklist (ReplicaSet) and makes the workers (pods) match it — adding when one quits, replacing one by one when the work changes.

## A Complete Deployment, With Everything

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: prod
spec:
  replicas: 3
  selector:
    matchLabels: { app: payments }
  template:
    metadata:
      labels: { app: payments }
    spec:
      containers:
        - name: payments
          image: myrepo/payments:2.1
          ports: [{ containerPort: 8080 }]

          # ---- Resource requests & limits: the scheduling contract ----
          resources:
            requests:            # what the scheduler RESERVES
              cpu: 500m          # 0.5 CPU cores
              memory: 512Mi
            limits:              # the hard cap — the container may not exceed
              cpu: "1"           # 1 core (throttled)
              memory: 1Gi        # OOM-killed if exceeded

          # ---- Probes: how K8s knows the app is healthy ----
          readinessProbe:        # "safe to send traffic?"
            httpGet: { path: /actuator/health/readiness, port: 8080 }
            initialDelaySeconds: 10
            periodSeconds: 5
          livenessProbe:         # "is it alive? restart if not"
            httpGet: { path: /actuator/health/liveness, port: 8080 }
            initialDelaySeconds: 30
            periodSeconds: 10
```

**Walking through the three critical blocks:**

- **`resources.requests` vs `limits`** — the scheduler uses *requests* to place pods (it only places a pod on a node with enough free requested resources); the runtime enforces *limits* (CPU throttles above its limit; memory gets OOM-killed above its limit). The classic pitfall: setting no requests means the scheduler can overcommit the node; setting no limits means one pod can eat the node. For a Spring Boot app, size requests around your *baseline* usage and limits ~1.5–2× above.

- **`readinessProbe`** — Spring Boot's Actuator is the natural probe target: the readiness endpoint says "the app is up and *ready to serve*" (DB connected, context loaded). K8s only routes traffic to ready pods. The failure mode it prevents: sending traffic to a pod that's still starting or whose database connection died.

- **`livenessProbe`** — the "is it dead?" check. A failing liveness probe → the kubelet **restarts the container**. The classic trap: pointing liveness at an endpoint that depends on a downstream service — a DB outage then triggers *restart loops* instead of letting the app report unhealthy. Rule of thumb: **readiness reflects dependencies; liveness reflects the JVM's own health** (which is exactly why Spring Boot 3 splits `/actuator/health/readiness` and `/liveness`).

## The Lifecycle: Scaling, Updates, Rollbacks

```bash
# Scale — declaratively:
kubectl scale deployment payments --replicas=5
# or by editing the YAML:
kubectl edit deployment payments

# Update the image — a ROLLING UPDATE:
kubectl set image deployment/payments payments=myrepo/payments:2.2
# K8s creates a NEW ReplicaSet, starts new pods, waits for readiness,
# then terminates old pods — one by one (maxUnavailable/maxSurge control
# the pace). Zero downtime if readiness probes are correct.

# Rollback — if the update misbehaves:
kubectl rollout undo deployment/payments
# K8s reverts to the previous ReplicaSet — the built-in "undo" button.

# Watch the rollout:
kubectl rollout status deployment/payments
```

**The rolling update is where the probes earn their keep:** K8s only advances the rollout when new pods pass readiness. A broken image with a correct readiness probe → the rollout stalls (new pods never become ready) instead of taking the site down. That's the difference between a bad deploy that's *caught* and one that *blows up*.

## The Other Workload Controllers

| Controller | Job | When to use |
|---|---|---|
| **Deployment** | stateless replicas + rolling updates | **the default** — your Spring Boot API |
| **StatefulSet** | stable identity + stable storage per pod | databases, Kafka, anything with state |
| **DaemonSet** | one pod on *every* node | log collectors, monitoring agents |
| **Job** | run to completion once | batch jobs, migrations |
| **CronJob** | Job on a schedule | nightly reports, cleanup |

**StatefulSet vs Deployment** is the key distinction: StatefulSets give pods stable names (`db-0`, `db-1`) and stable volumes — exactly what Postgres, Kafka, and Redis need — while Deployments treat pods as interchangeable cattle. Running stateful services on K8s is real work (that's why managed databases remain popular); for stateless Spring Boot services, Deployments are trivial.

## The Common Production Failure Modes

1. **No resource requests** → scheduler overcommits → noisy neighbors, OOM kills.
2. **Liveness on dependency-dependent endpoints** → restart loops during DB outages.
3. **Readiness probe path wrong** → the rollout never completes; traffic 503s.
4. **Missing `startupProbe` for slow apps** — a Spring Boot app with a long JVM warmup can be killed by the liveness probe *before it finishes starting*. `startupProbe` (checked only during startup, then handed off to liveness) is the fix.
5. **Image tags `latest`** → rolling updates pick up whatever `latest` points at; you lose reproducibility. **Always pin images to immutable tags** (`:2.1` or, better, the commit SHA).
6. **Environment-specific config baked into the image** → config belongs in ConfigMaps/Secrets (the next lesson), not the container.

## Recap

Workload controllers manage pods: the **Deployment** (stateless replicas, rolling updates, rollbacks — the default for Spring Boot), **StatefulSet** (stable identity for databases), **DaemonSet**, **Job**, and **CronJob**. The production essentials are **resource requests/limits** (scheduling contract + hard caps), **readiness probes** (dependencies — route traffic only to ready pods), **liveness probes** (JVM health — restart when dead), and the **startup probe** for slow warmups. Rolling updates advance only when new pods pass readiness — so correct probes are what turn a bad deploy into a caught rollout instead of an outage. Pin images, size requests from baseline usage, and the Deployment becomes the boring, reliable home for your services.
