---
title: Microservices & Spring Cloud — The Big Picture
summary: Why teams split monoliths, the platform pieces Spring Cloud provides, and when microservices are the wrong call.
order: 1
minutes: 18
topics: [microservices, spring-cloud, architecture, distributed-systems]
docs:
  - https://docs.spring.io/spring-cloud/reference/
  - https://12factor.net
---

# Microservices & Spring Cloud — The Big Picture

## What microservices actually buy you

A monolith is one deployable with everything inside. Microservices split it into small services, each owning one business capability, each independently deployable:

| Claim | Reality check |
|---|---|
| Independent deploys | True — but now you need contracts and coordinated releases anyway |
| Team autonomy | True — this is the real reason most orgs split |
| Independent scaling | True for the hot services only |
| Resilience | Only if you build it in — the network is now your worst enemy |
| Cheap | **False** — distributed systems are expensive in ops and debugging |

> **Why it matters (organizational view)** — Split for *team autonomy and deploy independence*, not for tech beauty. A 5-person team building a CRUD app gets zero benefit from 8 services and pays for it in observability and release complexity. The standard advice: **start modular-monolith, extract services when a team boundary or scaling need appears.**

## The distributed systems problem list

When you split one process into many, every feature becomes a distributed problem:

1. **Where is the service?** → service discovery (Eureka, Consul, Kubernetes DNS)
2. **Where is the config?** → config server / env / vault
3. **How do clients find routes?** → API gateway, client-side load balancing
4. **What happens when a call fails?** → circuit breakers, retries, timeouts
5. **How do you debug a request across 5 services?** → distributed tracing
6. **How do you keep data consistent?** → outbox, sagas, idempotency
7. **How do you secure inter-service calls?** → propagated tokens, mTLS, scopes

Spring Cloud exists to answer 1–5 with well-tested building blocks.

## The Spring Cloud platform

```
                     ┌─────────────────────────────┐
                     │         API GATEWAY          │  routing, authn, rate-limit
                     └──────────────┬──────────────┘
                     ┌──────────────▼──────────────┐
                     │  DISCOVERY (Eureka/Consul)   │  who is where?
                     └──────┬───────────┬───────────┘
              ┌─────────────▼──┐   ┌────▼──────────────┐
              │  order-service │   │ inventory-service  │
              │  Feign client  │──▶│  + Resilience4j    │
              │  + config from │   │  + tracing         │
              │  config server │   └────────────────────┘
              └────────────────┘
   Config server (central yml) ──────────▶ feeds every service
   Tracing (Micrometer + Zipkin) ────────▶ one trace id across all hops
```

## The Spring Cloud projects (2024/2025)

| Project | Job |
|---|---|
| **Spring Cloud Commons / LoadBalancer** | Client-side load balancing (`lb://`), abstraction over discovery |
| **Spring Cloud Netflix (Eureka)** | Service registry + clients |
| **Spring Cloud Config** | Centralized external configuration |
| **Spring Cloud Gateway** | Reactive API gateway: routing, filters, circuit breaking |
| **Spring Cloud OpenFeign** | Declarative HTTP clients (`@FeignClient`) |
| **Spring Cloud Circuit Breaker** | Uniform breaker API over Resilience4j/Sentinel |
| **Spring Cloud Consul / Kubernetes** | Alternative discovery + config on Consul or k8s |
| **Spring Cloud Sleuth → Micrometer Tracing** | Sleuth is retired; tracing moved to Micrometer Tracing + OTel |

## Versions matter

Spring Cloud releases on a train tied to Spring Boot: **Boot 3.4 ↔ Spring Cloud 2024.0**. Use the BOM:

```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-dependencies</artifactId>
      <version>2024.0.1</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

Mismatched Boot/Cloud versions are the #1 cause of "Spring Cloud doesn't start" — always check the release train table.

## The demo in this academy

`projects/spring-cloud-demo/` runs the full stack: **Eureka** (:8761), **Config Server** (:8888), **Gateway** (:9090), **order-service** (:9001) and **inventory-service** (:9002). Open the next lessons and follow along with real, running code.

> **Why it matters (organizational view)** — The org decision isn't "monolith vs microservices" — it's *which boundaries earn their distributed cost*. Spring Cloud standardizes the operational answer (discovery, config, gateway, resilience, tracing) so that when you do split, every service behaves the same way and one runbook covers them all.

## Key takeaways

- Split for team autonomy + independent deploys; start modular.
- Spring Cloud answers discovery, config, routing, resilience, tracing.
- Version train: Boot 3.4 ↔ Spring Cloud 2024.0 — pin the BOM.
- The demo project runs the whole stack locally.

**Official docs:** [Spring Cloud reference](https://docs.spring.io/spring-cloud/reference/) · [12-factor](https://12factor.net)
