---
title: Capstone — Payments API: Architecture & Layering
summary: The full project we build together — a layered payments API with JWT security, JPA, tests and Docker.
order: 1
minutes: 15
topics: [capstone, architecture, layering, project-structure]
capstone: true
docs:
  - https://docs.spring.io/spring-boot/reference/
---

# Capstone — Payments API: Architecture & Layering

This module is a **complete, runnable backend project** — `projects/payments-api/` in this repository. Every lesson maps to real code you can open, run, and extend. Build order: architecture → domain → API → security → tests.

## The requirements

A payments service with:

- Accounts (create, list, balance)
- Transfers between accounts (atomic, validated, idempotent)
- A transaction history per account
- JWT-secured API (login/register)
- H2 for dev, Postgres-ready config
- Tests: unit + integration
- Docker image

## The layered architecture

```
┌─────────────────────────────────────────────────┐
│  Controller layer        (HTTP, DTOs, validation)│
│  PaymentController · AccountController · Auth... │
├─────────────────────────────────────────────────┤
│  Service layer           (business rules, tx)    │
│  TransferService · AccountService · AuthService  │
├─────────────────────────────────────────────────┤
│  Repository layer        (persistence)           │
│  AccountRepository · TransferRepository · ...    │
├─────────────────────────────────────────────────┤
│  Domain                  (entities, invariants)  │
│  Account · Transfer · Money (value object)       │
└─────────────────────────────────────────────────┘
      Security · Config · Error handling (cross-cutting)
```

## The directory layout

```
projects/payments-api/
├── pom.xml
├── src/main/java/com/example/payments/
│   ├── PaymentsApplication.java
│   ├── config/          SecurityConfig, AppProperties
│   ├── security/        JwtService, JwtAuthFilter, UserPrincipal
│   ├── auth/            AuthController, AuthService
│   ├── account/         AccountController, AccountService, Account entity
│   ├── transfer/        TransferController, TransferService, Transfer entity
│   ├── common/          ApiError, GlobalExceptionHandler, NotFoundException
│   └── money/           Money (BigDecimal value object)
├── src/main/resources/  application.yml, application-dev.yml
├── src/test/java/       unit + @SpringBootTest integration tests
└── Dockerfile
```

## Why each layer exists

| Layer | Owns | Never does |
|---|---|---|
| Controller | HTTP mapping, validation, DTO mapping | business rules, SQL |
| Service | Business rules, transactions | SQL, HTTP details |
| Repository | Persistence | business rules |
| Domain | Invariants (money math, status transitions) | Spring APIs |

Rules enforced in review: controllers call one service method; services don't import `HttpServletRequest`; entities don't leak to the wire (DTOs only); `Money` math lives in `Money`.

## The runbook

```bash
cd projects/payments-api
mvn spring-boot:run                    # dev on :8081
# or
mvn clean package && java -jar target/payments-api-0.0.1-SNAPSHOT.jar
curl -X POST localhost:8081/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"username":"ada","password":"password123","displayName":"Ada"}'
curl localhost:8081/api/accounts -H "Authorization: Bearer $TOKEN"
```

> **Why it matters (organizational view)** — This is the shape of a real service: every team's service looks like this. Layering is what makes teams parallelize (one dev on transfers, one on security) and what keeps refactors safe. Learn this skeleton and you can walk into any Spring codebase.

## Key takeaways

- Controllers → services → repositories → domain; one direction of dependency.
- DTOs at the boundary; entities inside; Money math in the value object.
- Security/config/error handling are cross-cutting, in their own packages.
- The project is real — open `projects/payments-api` and follow along.

**Official docs:** [Spring Boot reference](https://docs.spring.io/spring-boot/reference/)
