---
title: Blue-Green, Canary and Feature Flags
module: cicd-devops
order: 4
minutes: 22
topics: ["blue-green", "canary", "feature flags", "rollback", "traffic shifting", "release automation"]
docs:
  - title: "Deployment strategies"
    url: "https://kubernetes.io/docs/concepts/workloads/controllers/deployment/"
---

# Blue-Green, Canary and Feature Flags

Rolling updates are the baseline. But for critical systems you want more control: **blue-green** (instant switch + instant rollback), **canary** (gradual traffic shifting), and **feature flags** (deploy code dark, enable by config). Each trades complexity for control.

## Blue-Green

Two identical environments — Blue (current) and Green (new). Deploy to Green, test it, then switch the router:

```
┌─────┐   ┌─────────┐
│Router│──▶│ Blue    │  v1 (current)
│      │   └─────────┘
│      │   ┌─────────┐
│      │──▶│ Green   │  v2 (deployed, being verified)
│      │   └─────────┘
```

```bash
# Deploy v2 to Green
kubectl scale deployment/backend-green --replicas=3
# verify: curl green service, run smoke tests
# switch: point the router at Green
kubectl patch service backend -p '{"spec":{"selector":{"color":"green"}}}'
```

**Rollback is instant**: flip the selector back to Blue.

```yaml
# Two Deployments, one Service switches on color label
apiVersion: apps/v1
kind: Deployment
metadata: { name: backend-green }
spec:
  replicas: 3
  template:
    metadata:
      labels: { app: backend, color: green }   # selector color matters
    spec:
      containers:
        - name: backend
          image: ghcr.io/org/backend:v2
```

**Cost**: double the infrastructure while both are live. **Database**: schema must be compatible in both directions (the DB is shared; a v2 schema change breaks v1 during the switch window). Use expand/contract migrations.

## Canary

Ship the new version to a small slice of traffic, watch metrics, then ramp:

```yaml
# Canary via Istio or nginx-ingress traffic split
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
spec:
  hosts: [api.example.com]
  http:
    - route:
        - destination: { host: backend-stable }
          weight: 95
        - destination: { host: backend-canary }
          weight: 5
```

```yaml
# Simpler: two Deployments + Istio DestinationRules, or:
#   nginx ingress with a canary annotation
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "5"
spec:
  # ...canary backend
```

**The canary gate**: compare error rates / latency of canary vs. stable for 10–30 minutes; if metrics are within tolerance, ramp 25% → 50% → 100%; else roll back.

```yaml
- name: Ramp canary to 100%
  run: |
    # 5% → 25% → 100% with metric gates between
    kubectl -n istio-system exec deploy/istiod -- \
      istioctl traffic-rule ...   # (concept: adjust weights)
```

**Pros**: real production traffic on the new version, automatic detection of regressions. **Cons**: needs metric comparison infrastructure; two versions run concurrently.

## Feature Flags

Deploy the code **dark** — the feature exists but is off — then flip it per environment or per user:

```java
@Component
public class FeatureFlags {

    private final ToggleClient toggleClient;   // LaunchDarkly, Unleash, or a ConfigMap

    public boolean isEnabled(String feature, User user) {
        return toggleClient.isEnabled(feature, user);
    }
}
```

```java
@Service
public class CheckoutService {

    public Order checkout(Cart cart, User user) {
        if (features.isEnabled("checkout-v2", user)) {
            return checkoutV2(cart, user);
        }
        return checkoutV1(cart, user);
    }
}
```

**The killer combination**: ship `checkout-v2` dark, run it for your own team (internal flag), ramp to 1% (canary by flag), then 100% — *without a redeploy*. Rollback is flipping a boolean.

### Kill Switches

The most important flag is the **kill switch** — a global "everything off" for a subsystem:

```java
if (flags.killSwitch("payments")) {
    throw new PaymentsUnavailableException();
}
```

When the payment gateway misbehaves, ops flips one flag instead of redeploying.

## Comparing the Strategies

| Strategy | Rollback speed | Infra cost | Risk | Complexity |
|----------|----------------|------------|------|------------|
| Rolling | Minutes (per-pod) | Minimal | Medium | Low |
| Blue-green | Seconds (selector flip) | 2× during switch | Low | Medium |
| Canary | Seconds (weight→0) | 2× during ramp | Lowest | High |
| Feature flags | Milliseconds (config) | None | Lowest | Medium |

## The Database Constraint

Every strategy shares one bottleneck: **the database**. If v2 changes the schema, v1 (still serving in blue-green or canary) breaks. The expand/contract pattern:

```
1. EXPAND: add the new column (v1 unaffected, v2 uses it optionally)
2. MIGRATE: backfill the column (both versions work)
3. CONTRACT: deploy code that requires it, then drop the old column
```

Schema migrations must be forward- AND backward-compatible for any overlap window. This is why Flyway/Liquibase migrations are planned, not thrown together.

## CI Integration

```yaml
jobs:
  deploy-canary:
    steps:
      - name: Deploy canary (5%)
        run: kubectl apply -f k8s/canary.yaml
      - name: Wait and gate on metrics
        run: sleep 600 && curl -f "https://metrics.example.com/api/compare?canary=v2&stable=v1"
      - name: Promote to 100%
        run: kubectl apply -f k8s/stable-v2.yaml
      - name: Rollback on gate failure
        if: failure()
        run: kubectl apply -f k8s/stable-v1.yaml
```

The pipeline itself enforces the gate: no metrics comparison, no promotion.

## Summary

| Situation | Strategy |
|-----------|----------|
| Default | Rolling update with accurate probes |
| Critical API, want instant rollback | Blue-green |
| High traffic, want progressive exposure | Canary with metric gates |
| Feature-level control without redeploys | Feature flags |
| Schema changes | Expand/contract migrations always |

Release strategy is risk management: how fast can you recover, and how much traffic do you expose to the unknown? Start with rolling + flags; add blue-green and canary where the blast radius justifies the complexity.
