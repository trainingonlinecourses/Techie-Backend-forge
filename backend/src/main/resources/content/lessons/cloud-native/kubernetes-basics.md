---
title: Kubernetes Basics
summary: Pods, Deployments, Services, namespaces and the reconciliation loop — the vocabulary and mental model of running containers at scale.
order: 3
minutes: 16
topics: [kubernetes, pods, deployments, services, control plane, declarative]
docs:
  - https://kubernetes.io/docs/concepts/
  - https://kubernetes.io/docs/tutorials/kubernetes-basics/
---

# Kubernetes Basics

## What Kubernetes actually is

Kubernetes is a **container orchestrator**: it takes declarative descriptions of *what should run* and continuously reconciles the cluster to match. You don't "start a container" — you declare a Deployment, and the control plane makes it true (and keeps it true when a pod dies, a node fails, or traffic spikes).

```
                 ┌─ control plane (the brain) ─────────────┐
  kubectl ──────▶│  API server  etcd  scheduler  controllers │
                 └───────────────┬─────────────────────────┘
                                 │ watches & schedules
                 ┌───────────────▼─────────────────────────┐
                 │  worker nodes: kubelet → containers      │
                 └──────────────────────────────────────────┘
```

- **Control plane**: API server (everything talks to it), etcd (the cluster's source of truth — a key-value store), scheduler (which node runs what), controllers (the reconciliation loops).
- **Worker nodes**: run the pods; the **kubelet** is the node agent that reports and enforces.
- The core idea: **declarative desired state + reconciliation** — the system is constantly converging, which is why a YAML file, not a shell script, is the unit of deployment.

## The objects you'll actually write

**Pod** — the atomic unit: one or more containers sharing a network namespace and volume. Never create pods directly; the Deployment owns them.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: academy-api }
spec:
  replicas: 2                       # desired count — the controller keeps it true
  selector: { matchLabels: { app: academy-api } }
  template:
    metadata: { labels: { app: academy-api } }
    spec:
      containers:
        - name: api
          image: ghcr.io/me/academy-api:1.0
          ports: [ { containerPort: 8080 } ]
```

**Service** — the stable network identity: pods come and go (new IPs each time); a Service fronts them with a virtual IP + DNS name (`academy-api.default.svc.cluster.local`), load-balancing across the pod set.

```yaml
apiVersion: v1
kind: Service
metadata: { name: academy-api }
spec:
  selector: { app: academy-api }    # which pods to route to
  ports: [ { port: 80, targetPort: 8080 } ]
```

**The trio you'll type daily**: Deployment (pods + rollout), Service (stable access), ConfigMap/Secret (config — next lesson). Plus: Namespace (logical partition — `dev`, `prod`), Ingress (external HTTP routing), HorizontalPodAutoscaler (scale on CPU/latency).

## Declarative, not imperative

```bash
# Imperative (what the Docker mindset does — wrong reflex):
kubectl run api --image=academy-api:1.0 --replicas=2

# Declarative (what k8s wants):
kubectl apply -f deploy/api.yaml     # the file is the desired state; re-apply to update
kubectl diff -f deploy/api.yaml      # preview the change before applying
```

**GitOps** follows from this: the cluster's desired state lives in a git repo (Argo CD/Flux apply it). The YAML *is* the deployment — reviewable, versioned, rollbackable — the same philosophy as migrations-as-code.

## The reconciliation loop in action

1. `kubectl apply -f deployment.yaml` → the API server persists the desired state.
2. The Deployment controller creates a ReplicaSet with `replicas: 2` → the scheduler places the pods → kubelets start the containers.
3. A pod dies (OOM, node reboot) → the controller sees 1 running vs. 2 desired → starts a replacement. **The system self-heals; nobody "restarts the service".**
4. Update the image → a **RollingUpdate**: new ReplicaSet scales up while the old scales down, respecting readiness (the probes lesson) — zero-downtime by default.

## The ops vocabulary

```bash
kubectl get pods -n prod               # what's running
kubectl logs -f deploy/academy-api     # follow logs (add --all-containers)
kubectl describe pod <name>            # events: why did it crash/OOM/not schedule
kubectl get events --sort-by=.lastTimestamp   # cluster-wide story
kubectl rollout status deploy/academy-api     # is the rollout done?
kubectl rollout undo deploy/academy-api       # instant rollback to the previous revision
```

`describe` + `events` answer the "why" questions (image pull failed, probe failed, resource limits, scheduling constraints); logs answer "what happened inside".

## Key takeaways

- k8s = declarative desired state + continuous reconciliation; YAML is the deployment.
- Pod (unit) → Deployment (owner + rollout) → Service (stable access) → Namespace (partition).
- Apply, don't run — GitOps makes the cluster state versioned and reviewable.
- The controller self-heals (pods replaced, rollouts rolled back); learn `describe`/`events` for diagnosis.

Official docs: [Kubernetes Concepts](https://kubernetes.io/docs/concepts/) · [Kubernetes Basics tutorial](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
