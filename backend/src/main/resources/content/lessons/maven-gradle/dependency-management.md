---
title: Dependency Management and Versioning
module: maven-gradle
order: 2
minutes: 22
topics: ["dependency scopes", "transitive deps", "exclusions", "dependencyManagement", "BOM", "conflict resolution"]
docs:
  - title: "Maven dependency mechanism"
    url: "https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html"
summary: Dependencies are the biggest source of build pain: conflicts, scope mistakes, and silent version drift. This lesson covers the dependency mechanism...
---

# Dependency Management and Versioning

Dependencies are the biggest source of build pain: conflicts, scope mistakes, and silent version drift. This lesson covers the dependency mechanism — scopes, transitivity, conflict resolution, and the BOM/parent patterns that keep a large project's versions coherent.

## Dependency Scopes

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>my-lib</artifactId>
    <scope>compile</scope>     <!-- default -->
</dependency>
```

| Scope | Available at compile? | At runtime? | In the fat jar? | Typical use |
|-------|:---:|:---:|:---:|-------------|
| `compile` (default) | ✅ | ✅ | ✅ | Main dependencies |
| `provided` | ✅ | ❌ (container gives it) | ❌ | Servlet API, Lombok |
| `runtime` | ❌ | ✅ | ✅ | JDBC drivers |
| `test` | ❌ (test yes) | ❌ | ❌ | JUnit, Mockito |
| `system` | ✅ | ❌ | ❌ | Local jars (avoid!) |

```xml
<!-- JDBC driver: compile against it? No — needed at runtime only -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>
```

**A scope mistake ships the wrong jar**: `provided` for Lombok (annotation processing only), `runtime` for drivers (never compiled against), `test` for JUnit (never in production).

## Transitive Dependencies

Maven pulls your dependency's dependencies automatically:

```
app → spring-boot-starter-web
        → spring-web, spring-webmvc, tomcat-embed-core, jackson-databind, ...
```

The full tree:

```bash
mvn dependency:tree
```

```
[INFO] com.academy:backend:jar:1.0.0
[INFO] +- org.springframework.boot:spring-boot-starter-web:jar:3.3.5:compile
[INFO]    +- org.springframework.boot:spring-boot-starter-tomcat:jar:3.3.5:compile
[INFO]       +- org.apache.tomcat.embed:tomcat-embed-core:jar:10.1.31:compile
```

## Conflict Resolution: Nearest Wins

When two versions of the same library appear in the tree, Maven picks the **nearest to the root** (shortest path). Ties go to declaration order.

```
app
├── lib-a → jackson 2.15        (depth 2)
└── lib-b → lib-c → jackson 2.17 (depth 3)
→ jackson 2.15 WINS (nearest)
```

**The problem**: "nearest wins" can pick the *older* version silently. Check the effective version:

```bash
mvn dependency:tree -Dverbose
```

## Enforcing a Version: dependencyManagement

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.fasterxml.jackson.core</groupId>
            <artifactId>jackson-databind</artifactId>
            <version>2.17.2</version>
        </dependency>
    </dependencies>
</dependencyManagement>
```

`dependencyManagement` **pins the version without adding the dependency** — every transitive occurrence now uses 2.17.2, and any child project declaring jackson inherits the version.

## Exclusions: Cutting Unwanted Transitives

```xml
<dependency>
    <groupId>com.example</groupId>
    <artifactId>legacy-lib</artifactId>
    <version>1.0</version>
    <exclusions>
        <exclusion>
            <groupId>commons-logging</groupId>
            <artifactId>commons-logging</artifactId>   <!-- conflicts with SLF4J -->
        </exclusion>
    </exclusions>
</dependency>
```

Exclude only when necessary (logging bridges, duplicate libs) — over-excluding silently breaks the library.

## The BOM Pattern: Version Alignment

A **BOM** (Bill of Materials) is a pom whose only job is `dependencyManagement` — imported for its versions:

```xml
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.cloud</groupId>
            <artifactId>spring-cloud-dependencies</artifactId>
            <version>2023.0.3</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

Then use cloud dependencies without versions:

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

The Spring Cloud BOM aligns *all* cloud components to tested-together versions — the canonical fix for "cloud component versions drift apart."

## The Spring Boot Parent Chain

```
spring-boot-starter-parent
└── spring-boot-dependencies (a BOM)
    └── pins versions for ~900 libraries
```

That's why you never write versions for starters — the parent's BOM manages them, aligned to the Boot release.

## Overriding a Managed Version

```xml
<properties>
    <!-- the BOM uses these property names — override in <properties> -->
    <jackson-bom.version>2.17.2</jackson-bom.version>
</properties>
```

Or pin directly in your own `dependencyManagement` (your entry wins over the parent's).

## Verifying the Result

```bash
mvn dependency:tree            # the resolved graph
mvn dependency:analyze         # unused/undeclared deps
mvn versions:display-dependency-updates   # newer versions available
```

**Dependency hygiene in CI** — add `dependency:analyze` to the verify phase to catch undeclared-but-used libraries (they work by luck, break on upgrade).

## Summary

| Concern | Mechanism |
|---------|-----------|
| Scope | compile / provided / runtime / test |
| Transitives | Automatic — inspect with `dependency:tree` |
| Conflicts | Nearest wins — pin with dependencyManagement |
| Remove transitives | `<exclusions>` |
| Align versions | Import a BOM |
| Boot versions | Parent's BOM does it |
| Override | `<properties>` or your own dependencyManagement |
| Audit | `dependency:analyze`, `versions:display-dependency-updates` |

Dependency management is governance: scopes say where a jar lives, the BOM says what version, exclusions trim what leaks in, and the tree shows what actually arrived. Run `dependency:tree` before every upgrade — the graph tells you more than the docs.
