---
title: Kubernetes in Practice — Helm, Autoscaling, and Day-2 Operations
module: kubernetes-deep
order: 5
minutes: 27
topics: ["Helm", "HorizontalPodAutoscaler", "kubectl", "observability", "day-2 ops", "GitOps"]
docs:
  - title: "Helm (helm.sh)"
    url: "https://helm.sh/docs/"
  - title: "Horizontal Pod Autoscaling (kubernetes.io)"
    url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/"
summary: Deploying a helloworld pod teaches the concepts; running a production system teaches the tooling. This lesson is the professional layer: Helm (pack...
---

# Kubernetes in Practice — Helm, Autoscaling, and Day-2 Operations

## The Concept: The Tooling Around the Cluster

Deploying a hello-world pod teaches the concepts; running a production system teaches the *tooling*. This lesson is the professional layer: **Helm** (package and version your manifests), **autoscaling** (let the cluster match demand), the **kubectl workflow** (the daily diagnostics), and the **day-2 reality** (observability, upgrades, GitOps). These are the things every "Kubernetes in production" story is actually about.

## Helm: The Package Manager for Kubernetes

Raw YAML manifests are fine for one service; a real system has dozens (Deployment, Service, Ingress, ConfigMap, Secret, autoscaler, ...) repeated across environments. **Helm** packages all of it into a **chart** — a versioned, templated bundle:

```text
payments-chart/
├── Chart.yaml              # name, version, description
├── values.yaml             # the DEFAULTS — overridable per environment
└── templates/
    ├── deployment.yaml     # {{ .Values.replicas }} — templated YAML
    ├── service.yaml
    └── _helpers.tpl        # shared template snippets
```

```yaml
# templates/deployment.yaml (excerpt):
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "payments.fullname" . }}
spec:
  replicas: {{ .Values.replicas }}
  template:
    spec:
      containers:
        - name: payments
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          envFrom:
            - configMapRef: { name: {{ .Values.configMap }} }
```

```yaml
# values.yaml — the defaults:
replicas: 3
image:
  repository: myrepo/payments
  tag: "2.1"
configMap: payments-config
```

**The workflow:** one chart, many value files — `values-dev.yaml`, `values-prod.yaml` — and the same chart deploys everywhere:

```bash
helm install payments ./payments-chart -f values-prod.yaml
helm upgrade payments ./payments-chart -f values-prod.yaml --set image.tag=2.2
helm rollback payments 3            # instant rollback to revision 3
helm list                           # what's deployed
```

**What Helm gives you:** versioning (every install/upgrade is a revision you can roll back), templating (one chart, many environments), dependency management (charts can depend on charts — e.g., a Postgres chart), and reproducibility (a chart at version X is the same everywhere). Helm charts are how the whole ecosystem distributes software — installing Prometheus, Nginx Ingress, or a Kafka operator is `helm install`.

## Autoscaling: The Cluster Matches Demand

The **HorizontalPodAutoscaler (HPA)** watches a metric (default: CPU) and adjusts `replicas` automatically:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: payments-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: payments
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # scale so average CPU stays ~60%
```

**Walking through it:** the HPA polls the pods' CPU (via the metrics pipeline — **metrics-server** must be installed). Average utilization above 60% → scale up (up to 10); sustained below → scale down (to 2, never below min). The control loop is deliberately slow (default ~15s checks, with cool-down periods) to avoid thrashing.

**The production caveats:** CPU-based autoscaling lags behind *request* spikes (requests arrive → CPU rises → scale-up → new pods take ~30–60s to become ready). The modern upgrade is **KEDA** — autoscaling on custom metrics: queue depth (Kafka lag, RabbitMQ messages), HTTP request rate, or any Prometheus metric. For event-driven Spring Boot services, queue-depth autoscaling is the *right* signal: scale with the backlog, not the CPU afterthought.

## The kubectl Workflow: Daily Diagnostics

```bash
# The five most-used commands:
kubectl get pods -n prod                    # what's running
kubectl describe pod payments-abc12 -n prod # events, probes, why it restarted
kubectl logs -f deployment/payments -n prod # stream logs
kubectl exec -it payments-abc12 -- bash     # get inside
kubectl get events -n prod --sort-by=.lastTimestamp  # cluster happenings

# Common investigations:
kubectl get endpoints payments -n prod      # are pods actually selected?
kubectl rollout status deployment/payments  # is the rollout stuck?
kubectl top pods -n prod                    # live CPU/memory
```

**The debugging ladder:** symptoms → `get` (what exists?) → `describe` (the events: image pull failures, probe failures, OOM kills — *the* richest diagnostic) → `logs` (the app's voice) → `exec` (inspect live state). Most "why is my pod CrashLooping" answers live in `describe`'s Events section.

## Observability: The Day-2 Essentials

A cluster without observability is a black box. The standard stack (all installed via Helm):

- **Prometheus** — scrapes metrics (Spring Boot Actuator `/actuator/prometheus` is the native source) and stores them.
- **Grafana** — dashboards: request rates, latency, error rates, JVM heap, pod CPU.
- **Loki** (or ELK) — log aggregation: `kubectl logs` is per-pod; Loki gives *search across all pods*.
- **Alertmanager** — the alerting rules: "payments pod restarting 5× in 10 minutes" pages someone.

The three signals every service dashboard must have: **RED** (Rate of requests, Errors, Duration) — the service health triad. Spring Boot Actuator exposes it all; Prometheus scrapes it; Grafana shows it. That loop — metrics → alert → diagnose → fix — is day-2 operations in one sentence.

## GitOps and Upgrades: The Modern Operating Model

**GitOps** is the operational philosophy that made Kubernetes manageable at scale: **Git is the single source of truth for the cluster's desired state.** You never `kubectl apply` by hand in production — you commit manifests/charts to Git, and a controller (**Argo CD** or **Flux**) syncs the cluster to match. The benefits: every change is a reviewable, revertible commit; drift (someone hand-editing the cluster) is detected and corrected; rollbacks are `git revert`. Combined with the "config is data" lesson, GitOps gives you *auditable, reproducible infrastructure* — the same discipline as your application code.

**Upgrades** deserve their own caution: never `helm upgrade` or `kubectl apply` everything blindly on a Friday. The practice: upgrade in waves (dev → staging → prod), use the rollback (Helm revisions, `rollout undo`), and let GitOps/CI gate what reaches production. Kubernetes makes rollback *easy* — the discipline is using it deliberately.

## The Production Checklist

1. **Helm** for everything you deploy — versioned, templated, rollback-able.
2. **HPA** (or KEDA on queue depth) so the cluster matches demand.
3. **Resource requests everywhere** — autoscaling is meaningless without them (the HPA scales on utilization, which needs requests).
4. **Prometheus + Grafana + Loki + Alertmanager** installed and wired to Actuator.
5. **GitOps** (Argo CD/Flux) — Git as source of truth; no hand-editing prod.
6. **Backups** for stateful data (managed DB or StatefulSet + scheduled snapshots).
7. **Upgrades in waves** with tested rollback paths.

## Recap

The professional layer around Kubernetes is tooling and discipline: **Helm** packages and versions your manifests (one chart, per-environment values, instant rollbacks); the **HPA** autoscales on CPU (with **KEDA** for queue-depth signals on event-driven services); the **kubectl** ladder (get → describe → logs → exec) is the daily diagnostic path; and **Prometheus/Grafana/Loki** provide the observability without which a cluster is a black box. The operating model that ties it together is **GitOps** — Git as the single source of truth, synced by Argo CD or Flux — turning every cluster change into a reviewable, revertible commit. Master the concepts and the tooling, and "running Kubernetes" stops being heroics and becomes a boring, repeatable process.
