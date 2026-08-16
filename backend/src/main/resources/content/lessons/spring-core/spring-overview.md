---
title: The Spring Ecosystem (Organizational View)
summary: Why Spring exists, the projects that make up the platform, and how organizations standardize on it.
order: 1
minutes: 15
topics: [spring, ecosystem, roadmap]
docs:
  - https://spring.io/projects
  - https://docs.spring.io/spring-framework/reference/overview.html
---

# The Spring Ecosystem (Organizational View)

## Why Spring exists

Spring began as a response to J2EE's complexity in the early 2000s. Its core idea is **dependency injection**: instead of objects constructing their own dependencies (`new Database()`), a **container** wires them together. That one inversion made code testable, and from it grew the most widely used framework for Java enterprise applications.

```
                    ┌──────────────────────────────────────────┐
                    │            SPRING PLATFORM               │
                    │  ┌────────────────────────────────────┐  │
                    │  │  Spring Framework (the foundation)  │  │
                    │  │  IoC · DI · AOP · Events · Tx · MVC │  │
                    │  └────────────────────────────────────┘  │
                    │  ┌──────────┬──────────┬─────────────┐   │
                    │  │  Boot    │  Data    │  Security   │   │
                    │  │  (auto-  │  (JPA,   │  (authn/z,  │   │
                    │  │   config)│  JDBC)   │   OAuth2)   │   │
                    │  ├──────────┼──────────┼─────────────┤   │
                    │  │  Cloud   │   AI     │   Batch,    │   │
                    │  │ (micro-  │ (LLM,    │   Integration│  │
                    │  │  svcs)   │  RAG)    │   Kafka ...  │   │
                    │  └──────────┴──────────┴─────────────┘   │
                    └──────────────────────────────────────────┘
```

| Project | Job |
|---|---|
| **Spring Framework** | Core: IoC container, AOP, events, transactions, MVC |
| **Spring Boot** | Makes Spring *start*: auto-configuration, starters, Actuator |
| **Spring Data** | Uniform data access: JPA, JDBC, MongoDB, Redis, ... |
| **Spring Security** | Authentication + authorization for apps and APIs |
| **Spring Cloud** | Distributed systems: discovery, config, gateway, resilience |
| **Spring AI** | LLM integration: ChatClient, embeddings, RAG, tools |
| **Spring Batch / Integration / Kafka** | Batch jobs, messaging, event-driven systems |

## The release train

Spring projects release together on a cadence. Spring Boot 3.x requires **Java 17+** (21 recommended) and the **Jakarta EE 9+** namespace (`javax.*` → `jakarta.*`). Teams track: Boot version → supported Java versions → end-of-support dates on the Spring site.

> **Why it matters (organizational view)** — Spring is how most Java companies standardize: one runtime (Spring Boot), one set of conventions, huge hiring pool, and a vendor-neutral path (Java SE → any cloud). The org view: the framework does the plumbing (transactions, security, HTTP), so teams write *business code*. Standardization decisions that matter: pick LTS Boot + Java, pin the parent POM, and let dependency management (BOMs) resolve versions.

## Where to look things up

- Official reference docs: docs.spring.io (Spring Framework, Boot, Security, AI, Data).
- `start.spring.io` — bootstrap projects with the right starters.
- Each project has a reference + API docs; the reference is the authority.

## Key takeaways

- Spring = DI container + a platform of projects on top.
- Boot is the entry point; Framework is the engine underneath.
- 3.x = Java 17+, `jakarta.*`, modular starters, native/graalvm support.
- Standardize on versions via BOMs/parent POMs.

**Official docs:** [Spring projects](https://spring.io/projects) · [Framework overview](https://docs.spring.io/spring-framework/reference/overview.html)
