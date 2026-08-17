---
title: Starters — Curated Dependency Bundles
module: spring-boot-internals
order: 2
minutes: 22
topics: ["starters", "dependencies", "spring-boot-starter", "version management", "bill of materials"]
docs:
  - title: "Starters (Spring Boot docs)"
    url: "https://docs.spring.io/spring-boot/reference/using/build-systems.html#using.build-systems.starters"
---

# Starters — Curated Dependency Bundles

## The Concept: One Dependency, One Working Subsystem

In raw Spring (no Boot), wiring up a web app meant adding **half a dozen dependencies by hand** — `spring-webmvc`, `spring-context`, `jackson-databind`, `tomcat-embed-core`, `hibernate-validator`, ... — and getting the *versions* right so they all interoperate. Miss one or mix versions, and you get `NoClassDefFoundError` at runtime, hours deep in Maven hell.

**A starter** is a Maven artifact whose only content is *dependencies on other artifacts*. `spring-boot-starter-web` depends on everything a web app needs: `spring-webmvc`, `spring-web`, `jackson-databind`, embedded Tomcat, validation — with versions already matched and tested against each other by the Spring team.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

No version number needed — the **parent POM** (or the Spring Boot BOM) supplies it. That's the second half of the trick: `spring-boot-starter-parent` pins *all* managed versions (Spring Framework, Jackson, Tomcat, Hibernate, and dozens more) to a tested, compatible set. One version number (`3.x.y`) controls the whole universe.

## The Starter Gallery

| Starter | What it brings |
|---|---|
| `spring-boot-starter-web` | MVC + embedded Tomcat + Jackson + validation |
| `spring-boot-starter-webflux` | Reactive stack (Netty + WebFlux) |
| `spring-boot-starter-data-jpa` | Hibernate + Hikari + JPA |
| `spring-boot-starter-security` | Spring Security + its auto-config |
| `spring-boot-starter-test` | JUnit 5, Mockito, AssertJ, MockMvc, Testcontainers |
| `spring-boot-starter-actuator` | Health, metrics, info endpoints |
| `spring-boot-starter-validation` | Bean Validation (hibernate-validator) |
| `spring-boot-starter-data-redis` | Redis client + Spring Data Redis |
| `spring-boot-starter-amqp` | RabbitMQ (Spring AMQP) |
| `spring-boot-starter-aop` | Spring AOP + AspectJ |

The naming pattern: `spring-boot-starter-<technology>` for official ones. **`spring-boot-starter`** alone is the *core* starter (auto-config, logging, `@ConfigurationProperties` support) — the minimal base that most apps build on.

## What's Inside a Starter — The Concept

A starter's POM is a list of dependencies. Opening `spring-boot-starter-web` reveals (simplified):

```xml
<dependencies>
    <dependency>org.springframework.boot:spring-boot-starter</dependency>
    <dependency>org.springframework.boot:spring-boot-starter-json</dependency>
    <dependency>org.springframework.boot:spring-boot-starter-tomcat</dependency>
    <dependency>org.springframework:spring-webmvc</dependency>
    <dependency>org.hibernate.validator:hibernate-validator</dependency>
</dependencies>
```

Starters compose — `spring-boot-starter-web` *is* a starter built from smaller starters. And each dependency's version is omitted because the parent POM manages it.

## The Code Walkthrough — Using Starters Correctly

```xml
<!-- pom.xml (Maven) -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.1</version>
    <relativePath/>
</parent>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### Walking Through Each Part

**The parent POM** — `spring-boot-starter-parent` does three jobs: (1) pins versions of every managed dependency via its BOM, (2) configures the Maven plugins (`spring-boot-maven-plugin` for the executable jar, compiler settings, UTF-8, Java version), (3) provides sensible defaults. Its version *is* the Spring Boot version.

**`spring-boot-starter-web`** — one line, and you have a complete web stack. The version comes from the parent — never add a version to a managed dependency (it creates drift risk).

**`spring-boot-starter-data-jpa`** — JPA + Hibernate + connection pool. You then add the **driver** yourself (`postgresql` with `runtime` scope — the app needs it at runtime, tests/code don't import it).

**`spring-boot-starter-test`** — `test` scope: JUnit, Mockito, AssertJ, MockMvc, JSONassert, Testcontainers — everything for tests, kept out of the production jar.

**No version tags anywhere** — the parent owns versions. If you must override one (rare), use `<properties>`:

```xml
<properties>
    <jackson.version>2.17.0</jackson.version>
</properties>
```

## The Two "Parent" Options

| Option | Pros | Cons |
|---|---|---|
| `spring-boot-starter-parent` | Versions + plugin config in one | You can't have *another* parent POM (Maven allows one parent) |
| **BOM import** (`spring-boot-dependencies`) | Works alongside your own parent | You configure plugins yourself |

For multi-module enterprise builds with a company parent POM, teams import the BOM instead:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-dependencies</artifactId>
            <version>3.4.1</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

## Managing Versions Properly

- **Never hardcode versions for managed dependencies** — the BOM pins them; your number only creates divergence.
- **Only non-BOM libraries need explicit versions** — third-party libs outside Spring's BOM (e.g., a specific AWS SDK) get explicit `<version>` tags.
- **Let `mvn dependency:tree` reveal the actual versions** — when in doubt, inspect the resolved tree rather than guessing.

## Common Beginner Pitfalls

1. **Adding versions to managed dependencies** — redundant and risky; the BOM owns them.
2. **Using a starter "for safety" you don't need** — `starter-web` *and* `starter-webflux` together cause ambiguous bean/runtime conflicts; pick one stack.
3. **Forgetting the driver jar** — `starter-data-jpa` doesn't include your database driver; add `postgresql`/`mysql`/`h2` explicitly.
4. **`starter-test` in the production jar** — it's `test` scope; don't promote it to compile scope.
5. **Mixing Spring Boot versions** — parent at 3.4.1 but a manually pinned Spring Framework at 6.0.x → subtle incompatibilities. Keep one version source.
6. **Thinking starters add code** — they add *dependencies*; the behavior comes from auto-configuration reacting to them.

## Key Takeaways

- A starter is a dependency bundle — add one artifact, get a working subsystem.
- The parent POM (or BOM) pins all versions to a tested, compatible set.
- Never add versions to managed dependencies; let the BOM decide.
- Drivers (Postgres, MySQL, H2) are added separately, usually `runtime` scope.
- Starters + auto-configuration = "add a dependency, it just works".
- Check `mvn dependency:tree` to see what your starters actually pulled in.
