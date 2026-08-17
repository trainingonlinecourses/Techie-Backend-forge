---
title: The Strangler Fig Pattern
summary: Replacing a legacy system incrementally — routing, facade, and the migration strategy that avoids the big-bang rewrite.
order: 4
minutes: 13
topics: [strangler fig, legacy migration, incremental rewrite, facade, routing]
docs:
  - https://martinfowler.com/bliki/StranglerFigApplication.html
  - https://docs.microsoft.com/en-us/azure/architecture/patterns/strangler-fig
---

# The Strangler Fig Pattern

## The big-bang rewrite is how software projects die

Rewriting a working (if ugly) legacy system "all at once" fails for structural reasons, not lack of effort: the legacy system's hidden behaviors (edge cases, undocumented rules, implicit contracts) are unknown until the new system meets real users, and a multi-year rewrite produces a system nobody can deploy until it's "complete" — by which time requirements moved. The **strangler fig** inverts this: **replace the legacy system incrementally, feature by feature, routing traffic away as each slice lands.**

## The mechanism: a facade in front of both

```
                ┌────────────────────────┐
  client ──────▶│  facade / router       │
                │  (URL or header-based) │
                └───────────┬────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
        NEW service (per feature)   LEGACY system
```

- A **facade** (reverse proxy, gateway — the Spring Cloud Gateway pattern) fronts both systems.
- **Routing rule**: traffic for migrated features → new service; everything else → legacy.
- As each feature migrates, the routing rule flips — and the legacy code for that feature is deleted.

```yaml
# gateway routes: the migration state machine lives in config
spring:
  cloud:
    gateway:
      routes:
        - id: orders-new
          uri: http://orders-new.internal
          predicates: [ "Path=/api/orders/**" ]     # migrated → new service
        - id: legacy
          uri: http://legacy.internal
          predicates: [ "Path=/**" ]                # everything else → legacy
```

## The migration steps, in order

1. **Freeze the frontier** — stop adding features to the legacy system; new work happens on the new platform (or behind a feature flag).
2. **Build the facade** — all traffic now flows through the router; you can observe and redirect without touching clients.
3. **Migrate in slices** — one feature/context at a time (the bounded contexts from the modular-monolith lesson are the slicing units). New feature → flip the route → delete legacy code.
4. **Parallel-run when it's risky** — send a copy of traffic to both, compare outcomes (data migration validation), before flipping the primary route.
5. **Delete** — each migrated slice's legacy code is removed. The deletion is the point: it prevents the "two systems both growing" drift.
6. **Retire** — when the last route flips, the legacy system shuts down.

## Data migration: the hard half

Code routes flip fast; **data does not**. Per slice:

- **Migration window**: copy/transform data for the migrated slice (the Flyway/migration patterns + chunked backfill).
- **Dual-write or cutover**: for the migrated slice, new writes go to the new system; legacy reads fall back to the migrated data (or vice versa) — the expand-contract discipline from the schema-evolution lesson, applied across systems.
- **Validation**: row counts, checksums, and business-level spot checks ("the same invoice total exists in both") before the route flips — the verification step that turns migration from hope into engineering.
- **Feature flags** give the kill switch: flip back to legacy instantly if the new slice misbehaves in production, without a redeploy.

## Why the strangler wins

- **Deployable progress**: every slice is releasable; the system is never in a multi-year "almost ready" state.
- **Risk containment**: a bad slice flips back; the blast radius is one feature, not the project.
- **Institutional knowledge preserved**: legacy behavior is discovered and re-implemented slice by slice, with the old system as the always-available oracle ("what does the legacy do here?" is a test, not a guess).
- **The facade is permanent value**: the gateway/router stays as the API surface.

## The failure modes to plan for

| Failure | Prevention |
|---|---|
| Migrating a slice nobody uses (wasted effort) | route metrics — migrate by observed traffic, not intuition |
| Two systems drifting (both grow new features) | the freeze is non-negotiable; new features go to the new platform |
| Data divergence mid-migration | dual-write + validation per slice; never "migrate the data at the end" |
| Endless parallel-run (never cutting over) | set the cutover criteria up front (validation threshold + date) |

## Key takeaways

- Replace legacy systems slice by slice through a facade/router — never big-bang.
- Each migrated feature flips its route and its legacy code is deleted — the deletion is what prevents drift.
- Migrate data per slice with expand-contract discipline: window, dual-write, validate, flip.
- Feature flags are the kill switch; route metrics pick the next slice; the facade stays as the API surface.

Official docs: [Strangler Fig (Fowler)](https://martinfowler.com/bliki/StranglerFigApplication.html) · [Azure Strangler Fig](https://docs.microsoft.com/en-us/azure/architecture/patterns/strangler-fig)
