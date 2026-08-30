---
title: Kubernetes Architecture — Nodes, Pods, and the Control Plane
module: kubernetes-deep
order: 1
minutes: 27
topics: ["Kubernetes", "pods", "nodes", "control plane", "kubelet", "containers"]
docs:
  - title: "Kubernetes Concepts (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/"
  - title: "Kubernetes Components (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/overview/components/"
summary: Docker gives you containers — isolated processes with their own filesystem. But running containers at scale (dozens of machines, hundreds of contai...
---

# Kubernetes Architecture — Nodes, Pods, and the Control Plane

## The Concept: An Operating System for Containers

Docker gives you containers — isolated processes with their own filesystem. But running containers at scale (dozens of machines, hundreds of containers, crashes, scaling, updates) is a *cluster-management* problem. **Kubernetes** (K8s) is the operating system for that cluster: it schedules containers onto machines, restarts them when they die, scales them up and down, load-balances traffic, rolls out updates, and stores configuration — declaratively.

**The mental model:** Kubernetes is an orchestrator, like a conductor for a fleet of microservices. You *declare* the desired state ("I want 3 replicas of the payments service, image v2.1, port 8080") — the **control plane** (the brain) reads your declaration and drives the **worker nodes** (the muscles) to match it. When a container dies, Kubernetes sees the desired state (3 replicas) vs actual (2), and schedules a replacement. You never tell Kubernetes *how* — you tell it *what*, and it converges.

**Why containers weren't enough:** a lone Docker container on a server has no self-healing, no load balancing, no multi-machine scheduling, no rolling updates. Kubernetes provides all of it — and it's the standard way Spring Boot apps run in production (that's what this module is really about: your Spring Boot jar inside a container, scheduled and healed by K8s).

## The Two Planes

```text
┌────────────────────────── CONTROL PLANE (the brain) ──────────────────────────┐
│  API Server ── the front door; every command goes through it                  │
│  etcd        ── the source of truth (a distributed key-value store)           │
│  Scheduler   ── decides which node runs each new pod                          │
│  Controller Manager ── watches state and converges it to the desired state    │
└────────────────────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ WORKER NODE      │  │ WORKER NODE      │  │ WORKER NODE      │
│ kubelet (agent)  │  │ kubelet          │  │ kubelet          │
│ container runtime│  │ container runtime│  │ container runtime│
│ kube-proxy       │  │ kube-proxy       │  │ kube-proxy       │
│ Pods             │  │ Pods             │  │ Pods             │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**The control plane components (the brain):**

- **API server** — the single entry point. Every `kubectl` command, every internal component, talks to it. It validates requests and stores state in etcd.
- **etcd** — a distributed, consistent key-value store holding the *entire desired state*: "these pods should exist, this service maps to these pods." The cluster's source of truth.
- **Scheduler** — watches for unscheduled pods and picks a node for each (based on resources, constraints, affinity).
- **Controller manager** — a suite of control loops (deployment controller, replica-set controller, node controller): each watches actual state vs desired state and acts to close the gap.

**The worker node components (the muscles):**

- **kubelet** — the node's agent: talks to the API server, starts/stops containers via the container runtime, reports node and pod health.
- **Container runtime** — the thing that actually runs containers (containerd, CRI-O; Docker is supported via the CRI shim).
- **kube-proxy** — maintains network rules so traffic reaches pods (the service abstraction's data plane).

## Pods: The Atomic Unit

The **pod** is Kubernetes' smallest schedulable unit — one or more containers that share a network namespace and storage. For most Spring Boot apps, a pod holds exactly one container (the "one pod = one instance" pattern):

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: payments-7f8d9
  labels:                      # labels: the way everything finds everything
    app: payments
spec:
  containers:
    - name: payments
      image: myrepo/payments:2.1
      ports:
        - containerPort: 8080
```

**Why pods and not bare containers?** The pod is the scheduling unit — Kubernetes schedules pods, not containers. It gives containers in the same pod a shared identity (IP, localhost, shared volumes) — the pattern for sidecars (a logging sidecar next to the app container). The key facts: **each pod gets its own IP**; **pods are ephemeral** — treat them as cattle (they die and are replaced, with new IPs); and the stable way to reach pods is the *Service*, not the pod IP.

## Declarative State: The Core Loop

The whole system is a loop: **desired state → observe → act → repeat**. You declare:

```yaml
apiVersion: apps/v1
kind: Deployment          # the object that manages replica pods
metadata:
  name: payments
spec:
  replicas: 3             # desired: 3 copies running
  selector:
    matchLabels:
      app: payments       # which pods it manages
  template:               # the pod template to create
    metadata:
      labels: { app: payments }
    spec:
      containers:
        - name: payments
          image: myrepo/payments:2.1
          ports: [{ containerPort: 8080 }]
```

The **Deployment controller** in the control plane watches: "3 replicas desired" vs pods actually running. A pod dies → controller creates a replacement. You scale by editing `replicas: 5` → the controller creates 2 more. You upgrade by changing the image → the controller does a **rolling update** (new pods start, old pods drain, zero downtime). This convergence loop — declare, watch, converge — is the entire philosophy of Kubernetes.

## The Service: The Stable Front Door

Because pods are ephemeral with changing IPs, a **Service** provides a stable name + IP + load balancing over a set of pods (selected by labels):

```yaml
apiVersion: v1
kind: Service
metadata:
  name: payments
spec:
  selector:
    app: payments          # routes to pods with this label
  ports:
    - port: 80             # service port
      targetPort: 8080     # pod port
  type: ClusterIP          # internal-only (default); NodePort/LoadBalancer expose outward
```

Other pods call `http://payments:80` — the service name resolves via cluster DNS, and kube-proxy load-balances to the live pod IPs. Pods come and go; the service name never changes. That's the stability contract that makes microservices work on K8s.

## Namespaces and the Practical Shape

**Namespaces** partition a cluster (dev/staging/prod, or per-team). Default resources for a Spring Boot deployment: `Deployment` (replicas + rolling updates) + `Service` (stable access) + `ConfigMap`/`Secret` (configuration — the next lesson) + `Ingress` (external HTTP routing) + `HorizontalPodAutoscaler` (autoscaling).

## Recap

Kubernetes is an operating system for container clusters: the **control plane** (API server, etcd, scheduler, controllers) holds and drives the desired state, while **worker nodes** (kubelet + runtime + kube-proxy) execute it. The **pod** is the atomic scheduling unit — ephemeral, labeled, reachable via **Services** that never change. You interact by *declaring* state (`kubectl apply` a Deployment: "3 replicas of payments:2.1"), and controllers converge the cluster to match — replacing dead pods, scaling, rolling updates. The mental shift is the deepest one: from "operate processes" to "declare desired state and let the system converge." Master pods, deployments, services, and the convergence loop, and everything else in Kubernetes is detail.
