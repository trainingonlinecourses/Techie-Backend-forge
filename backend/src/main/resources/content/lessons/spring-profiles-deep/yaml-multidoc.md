---
title: YAML Multi-Document and Profile Configuration
summary: How Spring profiles work with YAML multi-document sections, property precedence, profile-specific properties, and externalized configuration strategies.
order: 3
minutes: 15
topics: [yaml, multi-document, profile-properties, property-source, configuration]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html
---

## The Concept, From Zero

YAML files support multiple documents separated by `---`. Spring Boot uses this to define profile-specific properties in a single file instead of creating separate files.

```yaml
# application.yml (default properties)
server:
  port: 8080

spring:
  datasource:
    url: jdbc:h2:mem:default

---
# Active only when "dev" profile is on
spring:
  config:
    activate:
      on-profile: dev
  datasource:
    url: jdbc:h2:mem:devdb
  h2:
    console:
      enabled: true

---
# Active only when "prod" profile is on
spring:
  config:
    activate:
      on-profile: prod
  datasource:
    url: jdbc:postgresql://prod-db:5432/myapp
```

---

## Property Precedence

Spring Boot loads properties in this order (later wins):

1. Default properties (no profile)
2. `application.yml`
3. `application-{profile}.yml`
4. Command-line arguments
5. System properties
6. Environment variables

```yaml
# application.yml
app:
  feature:
    enabled: false

---
spring:
  config:
    activate:
      on-profile: dev
app:
  feature:
    enabled: true  # overrides the default
```

---

## Real-World Scenarios

### Scenario 1: Profile-specific logging

```yaml
logging:
  level:
    root: INFO

---
spring:
  config:
    activate:
      on-profile: dev
logging:
  level:
    com.example: DEBUG
    org.springframework: DEBUG

---
spring:
  config:
    activate:
      on-profile: prod
logging:
  level:
    root: WARN
    com.example: INFO
```

### Scenario 2: Profile groups

```yaml
# Bundle multiple profiles under one name
spring:
  profiles:
    group:
      production: prod,docker,monitoring
      development: dev,h2-console
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Missing `---` separator | Properties don't activate per profile | Always separate documents with `---` |
| Wrong `on-profile` syntax | Profile never activates | Use `spring.config.activate.on-profile` |
| Property override order confusion | Wrong value wins | Remember: later profiles override defaults |
