---
title: Centralized Configuration with Spring Cloud Config
summary: A config server, config clients, profiles per environment, refresh at runtime, and encrypted secrets.
order: 3
minutes: 18
topics: [config-server, config-client, centralized-config, refresh]
docs:
  - https://docs.spring.io/spring-cloud-config/reference/
  - https://docs.spring.io/spring-cloud-config/reference/server.html
  - https://docs.spring.io/spring-cloud-config/reference/client.html
---

# Centralized Configuration with Spring Cloud Config

## The problem

Without a config server, every service carries its own `application.yml` — and when a database URL or feature flag changes, you deploy 30 services. **Spring Cloud Config** centralizes config in one server; every service fetches its slice at startup (and on demand).

```
order-service ──GET /order-service/prod──▶ config-server (:8888)
inventory-service ──GET /inventory-service/prod──▶ config-server
                     config-server reads from: git repo | Vault | classpath (native)
```

## 1. The config server

```java
@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication { ... }
```

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-config-server</artifactId>
</dependency>
```

```yaml
# config-server/application.yml
server:
  port: 8888
spring:
  profiles:
    active: native            # serve config from the classpath (dev)
  cloud:
    config:
      server:
        native:
          search-locations: classpath:/config
```

Put each service's config in `config-server/src/main/resources/config/<service-name>.yml`:

```yaml
# config/order-service.yml
server:
  port: 9001

app:
  order-limit: 100

eureka:
  client:
    serviceUrl:
      defaultZone: http://localhost:8761/eureka
```

## 2. The config client

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-config</artifactId>
</dependency>
```

```yaml
# order-service/application.yml — ONLY tells the client where the server is
spring:
  application:
    name: order-service            # which config file to fetch
  config:
    import: optional:configserver:http://localhost:8888
```

On startup the client fetches `order-service.yml` (plus `order-service-<profile>.yml` if a profile is active) **before** the context finishes building — so `server.port`, DataSources, and everything else can live centrally. The `optional:` prefix lets the app boot even if the config server is down (config values then come from local defaults).

## 3. Profiles: one file per environment

```
config/
├── order-service.yml          # shared defaults
├── order-service-dev.yml      # dev overrides
├── order-service-staging.yml
└── order-service-prod.yml
```

The client asks for `/{app}/{profile}` — the profile comes from `spring.profiles.active`. Same pattern as plain Boot profiles, but the files live in one place and are visible to every team. (In real orgs the backend is a **Git repo** instead of the classpath: `spring.cloud.config.server.git.uri` — config changes go through PRs.)

## 4. Refreshing config without restart

The context stays immutable after startup, so Spring Cloud Config can't rewrite `@Value` fields live. Instead, re-read config on demand:

```java
@RefreshScope          // re-created when a refresh is triggered
@Component
public class OrderProperties {
    @Value("${app.order-limit:100}")
    private int orderLimit;
}
```

```bash
curl -X POST localhost:9001/actuator/refresh     # re-fetch from config server
```

For zero-downtime updates orgs use **Spring Cloud Bus** (Kafka/RabbitMQ): one `POST /actuator/busrefresh` to any service → every service refreshes. Alternatively, re-deploy — config-in-Git + CI makes that cheap too.

## 5. Secrets: encrypt or use a vault

Config server can encrypt values (symmetric key via `encrypt.key`) but the modern org standard is a dedicated secrets store:

| Approach | When |
|---|---|
| `{cipher}` encrypted values in config files | Small, self-contained teams |
| HashiCorp Vault as config backend | Real orgs — `spring.cloud.config.server.vault` |
| Cloud secret managers (AWS Secrets Manager, GCP) | Cloud-native teams |
| Environment variables | Per-deployment secrets, no central store |

> **Why it matters (organizational view)** — Centralized config is how a platform team answers "which DB is prod pointing at?" in one place. The rules: config lives in Git with PR review; secrets never in config files (vault/env); every environment = one profile file; and services boot with local defaults when the config server is unreachable (`optional:` import) so a config outage doesn't kill every service.

## Key takeaways

- Config server serves `<app>-<profile>.yml`; clients fetch via `spring.config.import`.
- Classpath (`native`) for dev; Git repo backend for real orgs.
- `@RefreshScope` + `/actuator/refresh` for on-demand reloads; Bus for all-at-once.
- Secrets go to Vault/env, not config files.

**Official docs:** [Config reference](https://docs.spring.io/spring-cloud-config/reference/) · [Server](https://docs.spring.io/spring-cloud-config/reference/server.html) · [Client](https://docs.spring.io/spring-cloud-config/reference/client.html)
