---
title: Starter Versioning — Dependency Management and BOMs
summary: How to version your starter, dependency management with BOMs, avoiding version conflicts, and aligning with Spring Boot's version strategy.
order: 5
minutes: 15
topics: [versioning, bom, dependency-management, version-conflict, spring-boot-bom]
docs:
  - https://docs.spring.io/spring-boot/reference/features/dependency-management.html
---

## The Concept, From Zero

When you publish a starter, you need to version it carefully. Users should import your BOM (Bill of Materials) to manage versions automatically, and your starter should align with Spring Boot's dependency versions.

```xml
<!-- User's pom.xml -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.example</groupId>
            <artifactId>my-starter-bom</artifactId>
            <version>1.0.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

---

## BOM (Bill of Materials)

```xml
<!-- my-starter-bom/pom.xml -->
<project>
    <groupId>com.example</groupId>
    <artifactId>my-starter-bom</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>

    <properties>
        <my-starter.version>1.0.0</my-starter.version>
    </properties>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.example</groupId>
                <artifactId>my-starter</artifactId>
                <version>${my-starter.version}</version>
            </dependency>
            <dependency>
                <groupId>com.example</groupId>
                <artifactId>my-starter-core</artifactId>
                <version>${my-starter.version}</version>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

---

## Versioning Strategy

```
1.0.0  → MAJOR.MINOR.PATCH (SemVer)
  │        │       │       └── Bug fixes
  │        │       └────────── New features (backward-compatible)
  │        └────────────────── Breaking changes
  └─────────────────────────── Initial release
```

### Aligning with Spring Boot

```xml
<!-- Your starter should work with specific Spring Boot versions -->
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
</parent>

<!-- Or use dependency management only -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-dependencies</artifactId>
            <version>3.2.0</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>
```

---

## Real-World Scenarios

### Scenario 1: Publishing to Maven Central

```xml
<!-- pom.xml for publishing -->
<distributionManagement>
    <repository>
        <id>central</id>
        <url>https://oss.sonatype.org/service/local/staging/deploy/maven2/</url>
    </repository>
</distributionManagement>
```

### Scenario 2: Multi-module starter

```
my-starter/
├── my-starter-bom/       # BOM for version management
├── my-starter-core/      # Core library (no Spring dependency)
├── my-starter-spring/    # Spring auto-configuration
└── my-starter/           # Meta-starter (pulls everything together)
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| No BOM | Users must specify every version | Publish a BOM |
| Mixing Spring Boot versions | Dependency conflicts | Align with one Spring Boot version |
| Not following SemVer | Confusing upgrade path | Use MAJOR.MINOR.PATCH |
| Hardcoding dependency versions | Version conflicts | Use properties + dependency management |
