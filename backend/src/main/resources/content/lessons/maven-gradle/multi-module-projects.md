---
title: Multi-Module Builds
module: maven-gradle
order: 5
minutes: 25
topics: ["multi-module Maven", "reactor", "module boundaries", "dependency graph", "split packages", "best practices"]
summary: As projects grow, one flat module becomes a tangle: the domain leaks into web controllers, tests drag in every dependency, and "where does this bel...
docs:
  - title: "Maven multi-module"
    url: "https://maven.apache.org/guides/mini/guide-multiple-modules.html"
---

# Multi-Module Builds

As projects grow, one flat module becomes a tangle: the domain leaks into web controllers, tests drag in every dependency, and "where does this belong?" has no answer. Multi-module builds enforce boundaries *at compile time* — the build graph is the architecture.

## The Shape

```
backend/                       (parent pom, packaging=pom)
├── pom.xml                    (parent: modules + dependencyManagement)
├── common/                    (DTOs, utilities, domain — no framework)
│   └── pom.xml
├── domain/                    (entities, ports, domain services)
│   └── pom.xml                (depends on common)
├── persistence/               (JPA, repositories — depends on domain)
│   └── pom.xml
├── api/                       (controllers, security — depends on domain + persistence)
│   └── pom.xml                (the runnable app)
└── worker/                    (scheduled jobs, listeners)
    └── pom.xml                (depends on domain + persistence)
```

## The Parent POM

```xml
<!-- parent pom.xml -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.academy</groupId>
  <artifactId>backend-parent</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>

  <modules>
    <module>common</module>
    <module>domain</module>
    <module>persistence</module>
    <module>api</module>
    <module>worker</module>
  </modules>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
  </parent>

  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>com.academy</groupId>
        <artifactId>common</artifactId>
        <version>${project.version}</version>
      </dependency>
      <dependency>
        <groupId>com.academy</groupId>
        <artifactId>domain</artifactId>
        <version>${project.version}</version>
      </dependency>
    </dependencies>
  </dependencyManagement>
</project>
```

## A Child Module

```xml
<!-- domain/pom.xml -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>com.academy</groupId>
    <artifactId>backend-parent</artifactId>
    <version>1.0.0</version>
  </parent>

  <artifactId>domain</artifactId>

  <dependencies>
    <dependency>
      <groupId>com.academy</groupId>
      <artifactId>common</artifactId>
    </dependency>
  </dependencies>
</project>
```

The child inherits versions from the parent — only the module name and its own dependencies.

## The Reactor

When you build the parent, Maven's **reactor** orders the modules by dependency:

```bash
mvn package          # from the parent
# Reactor build order:
#   common → domain → persistence → api → worker
# (topological sort of the dependency graph)
```

```bash
mvn -pl api -am package   # build api + its dependencies (am = also-make)
mvn -pl api package       # build api only (assumes deps already installed)
mvn -pl persistence -amd test  # build persistence + modules that depend on it
```

## What Multi-Module Actually Buys You

| Benefit | Mechanism |
|---------|-----------|
| Compile-time boundaries | A module can only see what it declares |
| Faster builds | `-pl api -am` builds only what changed |
| Smaller test scopes | Each module tests its own slice |
| Reusability | `common` usable by other projects |
| Clean dependency direction | The reactor enforces the DAG |

The key: **the dependency graph is the architecture.** If `api` can't compile without `domain`, the boundary is real — not a convention.

## The Spring Boot Gotcha

Only **one** module runs the Spring Boot app, and only it needs the repackage plugin:

```xml
<!-- api/pom.xml — the runnable module -->
<build>
  <plugins>
    <plugin>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-maven-plugin</artifactId>
      <configuration>
        <mainClass>com.academy.ApiApplication</mainClass>
      </configuration>
    </plugin>
  </plugins>
</build>
```

Other modules produce plain jars. If the repackage runs on every module, you get fat jars with no main class — a classic multi-module mistake.

## Module Boundaries: What Goes Where

| Module | Contains | Knows about |
|--------|----------|-------------|
| common | DTOs, utils, exceptions | Nothing internal |
| domain | Entities, ports, rules | common |
| persistence | JPA repos, mappers | domain, common |
| api | Controllers, security, config | domain, persistence |
| worker | Listeners, jobs | domain, persistence |

**Enforce it**: a controller in `persistence`? Doesn't compile. A JPA annotation in `domain`? Doesn't compile — unless you add the dependency, which is the point.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Every module depends on everything | Let the reactor teach you: add only what's needed |
| Boot plugin on every module | Only the runnable module |
| Circular dependencies | Extract the shared piece into a lower module |
| Version drift | dependencyManagement in the parent |
| Giant `common` | Split when it grows beyond "shared utilities" |
| Testing only the runnable module | Test each module's slice |

## The Gradle Version

```kotlin
// settings.gradle.kts
rootProject.name = "backend"
include("common", "domain", "persistence", "api", "worker")
```

```kotlin
// domain/build.gradle.kts
dependencies {
    implementation(project(":common"))
}
```

```bash
./gradlew :api:build
./gradlew :api:build -x test
```

Gradle's incremental builds shine here — unchanged modules are UP-TO-DATE instantly.

## Summary

| Decision | Answer |
|----------|--------|
| When to split | When modules have distinct owners/concerns |
| How many | 3–8 for most services (common, domain, api, worker) |
| Boundaries | Enforced by the dependency graph |
| Build | Reactor orders by dependencies |
| Spring Boot | Repackage only the runnable module |
| Versions | Parent dependencyManagement |
| Gradle | `include(...)` + `project(":x")` |

Multi-module builds make architecture mechanical: the compiler enforces what the diagram claims. Split by ownership and direction of dependency, keep the graph acyclic, and the build itself becomes the architecture review.
