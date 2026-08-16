---
title: Spring Boot Philosophy — Starters & Auto-configuration
summary: Why Boot exists, what starters and auto-configuration actually do, and the conventions that make it work.
order: 1
minutes: 18
topics: [auto-configuration, starters, spring-boot, conventions]
docs:
  - https://docs.spring.io/spring-boot/reference/using/index.html
  - https://docs.spring.io/spring-boot/reference/using/auto-configuration.html
---

# Spring Boot Philosophy — Starters & Auto-configuration

## The problem Boot solves

Spring Framework is powerful but demands lots of wiring: pick libraries, configure them, write XML or `@Configuration` glue. **Spring Boot inverts that**: it makes *reasonable defaults* and lets you override. Convention over configuration.

## Starters: batteries included

A **starter** is a curated set of dependencies for one capability. Add one line to your `pom.xml` and everything needed — plus versions that work together — comes along:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>      <!-- MVC + Tomcat + Jackson -->
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId> <!-- JPA + Hibernate + DataSource -->
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId> <!-- Spring Security -->
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId> <!-- health, metrics, info -->
</dependency>
```

## Auto-configuration: how "it just works"

Auto-configuration classes (in `spring-boot-autoconfigure`) inspect your classpath and properties, then register beans **conditionally**. The core annotations:

| Condition | Meaning |
|---|---|
| `@ConditionalOnClass` | Only if this class is on the classpath |
| `@ConditionalOnMissingBean` | Only if no bean of this type exists yet |
| `@ConditionalOnProperty` | Only if a property is set |
| `@ConditionalOnWebApplication` | Only for web apps |

That's why adding `com.h2database:h2` to the classpath magically gives you a working DataSource: H2 is present → Boot auto-configures an embedded database → Spring Data JPA picks it up → repositories work. **Your own `@Bean` of the same type overrides the default** (conditional on missing bean).

```java
@Configuration
@ConditionalOnClass(DataSource.class)
static class DataSourceAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    DataSource dataSource() { /* embedded DB or property-driven */ }
}
```

## The three layers of configuration

1. **Starters** decide *what libraries* you get.
2. **Auto-configuration** decides *what beans* Spring creates.
3. **Your code + properties** decide *what behavior* you want.

## Inspect what Boot actually did

```bash
# Show every auto-configuration that applied (and why some didn't)
mvn spring-boot:run -Dspring-boot.run.arguments=--debug
# or
curl localhost:8080/actuator/conditions
```

> **Why it matters (organizational view)** — Boot standardizes project creation: same parent POM, same starter set, same layout — a new service takes minutes to scaffold and every service looks familiar. Auto-configuration means teams add capabilities (security, JPA, AI) without a config-diff rabbit hole. The mental model everyone needs: Boot gives you 90% defaults, you override the 10% that matters, and `--debug`/`actuator/conditions` shows exactly why each bean exists.

## Key takeaways

- Boot = curated dependencies (starters) + conditional auto-configuration + defaults.
- Your `@Bean` overrides auto-config (conditional on missing bean).
- `--debug` and `/actuator/conditions` reveal what happened and why.
- Convention over configuration: layout, packaging, defaults.

**Official docs:** [Using Spring Boot](https://docs.spring.io/spring-boot/reference/using/index.html) · [Auto-configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html)
