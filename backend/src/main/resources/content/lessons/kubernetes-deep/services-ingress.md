---
title: Services and Ingress — Routing Traffic in the Cluster
module: kubernetes-deep
order: 3
minutes: 26
topics: ["Services", "ClusterIP", "NodePort", "LoadBalancer", "Ingress", "DNS", "network policies"]
docs:
  - title: "Service (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/services-networking/service/"
  - title: "Ingress (kubernetes.io)"
    url: "https://kubernetes.io/docs/concepts/services-networking/ingress/"
---

# Services and Ingress — Routing Traffic in the Cluster

## The Concept: Stable Names for Ephemeral Pods

Pods die and get replaced with new IPs — so direct pod addressing is useless for anything stable. **Services** are the abstraction that fixes this: a stable name and IP that load-balances across a set of pods. **Ingress** is the layer above — how external HTTP traffic gets from the internet to your services with path/host routing, TLS, and clean URLs. Between them they answer: "how does anything find anything, inside and outside the cluster?"

**The mental model:** pods are employees with constantly-changing desk numbers. A Service is the company switchboard: "call extension 8080 (the service name) and the operator routes to whichever employee is free." The switchboard's number never changes even as employees come and go. Ingress is the front desk: it reads the visitor's request ("POST /api/payments") and directs them to the right department (service) — with a badge check (TLS) at the door.

## The Service Types: The Exposure Ladder

```yaml
# Type 1 — ClusterIP (the default): internal-only. A stable virtual IP
# inside the cluster. Other pods reach it by name via cluster DNS.
apiVersion: v1
kind: Service
metadata:
  name: payments
spec:
  selector: { app: payments }      # route to pods with this label
  ports:
    - port: 80                     # what callers connect to
      targetPort: 8080             # the pod's actual port
```

```yaml
# Type 2 — NodePort: exposes the service on a high port (30000-32767)
# on EVERY node. External traffic hits nodeIP:30000 -> service -> pod.
# Mostly a dev/testing convenience.
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080
```

```yaml
# Type 3 — LoadBalancer: the cloud provider provisions a real load
# balancer (ELB/ALB) that forwards to the NodePorts. One external IP
# per service. Fine for a few services; Ingress is better for many.
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
```

**How the routing works under the hood:** the Service's `selector` picks the backing pods by label. The control plane maintains an **Endpoints** list (the current pod IPs), and **kube-proxy** on each node programs the network rules (iptables/ipvs) so traffic to the service IP reaches a live pod — with round-robin load balancing across replicas. The pod IPs in the list change as pods come and go; the service never changes. That's the whole magic: *label selection + a stable front + kube-proxy rules*.

## Service Discovery: How Pods Find Each Other

Inside the cluster, **cluster DNS** (CoreDNS) resolves service names: a service named `payments` in namespace `prod` is reachable as `payments.prod.svc.cluster.local` — and within the same namespace, just `payments`. So your Spring Boot app calls other services with plain HTTP URLs:

```yaml
# Instead of hardcoding http://10.0.0.5:8080 (a pod IP — it dies),
# configure the service DNS name:
# SPRING config -> base url: http://payments:80
```

```yaml
SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/academy
```

That's why Kubernetes-native apps configure *service names*, not IPs: the DNS name is stable, and the Service load-balances underneath.

## Ingress: The Smart Front Door

A `LoadBalancer` per service means one external IP per service — expensive and unscalable. **Ingress** is the single entry point that routes external HTTP/HTTPS by host and path to different services:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: academy-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /$2
spec:
  rules:
    - host: api.academy.com            # route by host
      http:
        paths:
          - path: /payments(/|$)(.*)   # ...and by path
            pathType: Prefix
            backend:
              service:
                name: payments
                port: { number: 80 }
          - path: /users(/|$)(.*)
            pathType: Prefix
            backend:
              service:
                name: users
                port: { number: 80 }
  tls:                                 # TLS termination at the Ingress
    - hosts: [api.academy.com]
      secretName: academy-tls
```

**Walking through it:** one Ingress object, one external entry point (an **Ingress controller** — nginx, Traefik, AWS ALB — must be running to implement it). Requests to `api.academy.com/payments/...` route to the payments Service; `/users/...` to the users Service. TLS terminates *at the Ingress* (the controller holds the certificate from the `Secret`), so your Spring Boot apps can run plain HTTP inside — the Ingress is the edge. Path rewriting (`rewrite-target: /$2`) strips the `/payments` prefix before forwarding, so the backend sees `/...` — a frequent source of "why is my path 404" confusion.

**Host-based routing** is the same object's other power: `api.academy.com` → API services, `admin.academy.com` → admin services, `www.academy.com` → the frontend — one Ingress, many hosts.

## Network Policies: The Firewall Between Services

By default, **all pods can talk to all pods** — convenient, and a security hole. **NetworkPolicy** is the cluster firewall:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: payments-allow-users-only
spec:
  podSelector:
    matchLabels: { app: payments }
  ingress:                          # who may SEND to payments pods
    - from:
        - podSelector:
            matchLabels: { app: users }    # only the users service
      ports:
        - port: 8080
```

This says: only pods labeled `app: users` may reach payments pods on port 8080. The database is reachable only by the services that need it; a compromised frontend can't wander to the DB. The production discipline: **default-deny plus explicit allows** — the microservices equivalent of least privilege. (NetworkPolicy needs a CNI that enforces it — Calico, Cilium — not all clusters enable it by default.)

## The Common Failure Modes

1. **Wrong selector** → the Service's Endpoints list is empty → connections refused. `kubectl get endpoints <service>` is the first diagnostic.
2. **Port mismatch** (`port` vs `targetPort`) → traffic reaches the node but the pod's port is wrong.
3. **Path rewrite confusion** → backend sees `/payments/...` when it expects `/...`; 404s everywhere.
4. **Relying on pod IPs** → breaks the moment pods restart. Use service DNS names.
5. **NetworkPolicy blocking kube-proxy or DNS** → services that worked suddenly hang; always allow DNS (port 53) in policy design.

## Recap

Services give stable names and load balancing over ephemeral pods — `ClusterIP` for internal calls (the default, resolved by cluster DNS), `NodePort` and `LoadBalancer` for outward exposure. Ingress is the single smart front door: one controller routes external HTTP(S) by host and path to different services, terminates TLS at the edge, and rewrites paths. Services are discovered by DNS name (`payments` or `payments.prod.svc`), and NetworkPolicy provides the cluster firewall. The three habits: select by label carefully (check `kubectl get endpoints`), configure *service names* not pod IPs, and treat Ingress as the edge (TLS there, plain HTTP inside). Master services + ingress and your services become reachable, stable, and secure — the plumbing of every real deployment.
