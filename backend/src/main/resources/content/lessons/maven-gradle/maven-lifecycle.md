---
title: The Maven Lifecycle and Build Phases
module: maven-gradle
order: 1
minutes: 22
topics: ["Maven lifecycle", "phases", "goals", "plugins", "pom.xml", "profiles"]
summary: Maven isn't a build script — it's a fixed lifecycle with pluggable goals. Understanding the three lifecycles, the phase ordering, and how plugins b...
docs:
  - title: "Maven lifecycle"
    url: "https://maven.apache.org/guides/introduction/introduction-to-the-lifecycle.html"
---

# The Maven Lifecycle and Build Phases

Maven isn't a build script — it's a **fixed lifecycle** with pluggable goals. Understanding the three lifecycles, the phase ordering, and how plugins bind to phases is what turns "Maven is magic" into "Maven is predictable."

## The Three Lifecycles

| Lifecycle | Purpose |
|-----------|---------|
| `default` | Compile, test, package, deploy |
| `clean` | Delete build output |
| `site` | Generate project documentation |

Each lifecycle is an ordered list of **phases**; each phase is a slot where **plugin goals** execute.

## The Default Lifecycle (the important one)

```
validate         → project structure is correct
initialize
generate-sources → protobuf, JAXB codegen
process-sources
compile          → main classes
process-classes
generate-test-sources
process-test-sources
test-compile     → test classes
process-test-classes
test             → run tests (surefire)
prepare-package
package          → jar/war (jar plugin)
verify           → integration checks (failsafe)
install          → copy to local repo (~/.m2)
deploy           → copy to remote repo
```

**Key rule**: running `mvn package` executes *every phase up to and including* `package` — validate, compile, test, then package. You never "run one phase"; you run a prefix of the lifecycle.

## Goals Bind to Phases

Phases are empty slots — plugins bind their goals to them:

| Plugin | Goal | Default phase |
|--------|------|---------------|
| maven-compiler-plugin | `compile` | compile |
| maven-surefire-plugin | `test` | test |
| maven-jar-plugin | `jar` | package |
| spring-boot-maven-plugin | `repackage` | package |
| maven-failsafe-plugin | `integration-test` | integration-test (post-package) |

```bash
mvn clean package         # clean lifecycle, then default through package
mvn test                 # default through test only (skips packaging)
mvn install              # default through install (includes tests!)
```

## The pom.xml Anatomy

```xml
<project>
  <modelVersion>4.0.0</modelVersion>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
  </parent>

  <groupId>com.academy</groupId>
  <artifactId>backend</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>

  <properties>
    <java.version>21</java.version>
    <maven.compiler.release>21</maven.compiler.release>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>
```

## The Spring Boot Parent: What It Gives You

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
</parent>
```

- **Dependency management**: versions for every Spring Boot starter — you omit `<version>` everywhere
- **Plugin management**: compiler, surefire, jar plugins configured with sensible defaults
- **Property defaults**: `java.version`, resource filtering, UTF-8

```xml
<!-- Without the parent, you must pin versions manually: -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <version>3.3.5</version>   <!-- ❌ redundant with the parent -->
</dependency>
```

## The Repackage: Why Spring Boot Jars Run

```java
java -jar app.jar
```

The jar-plugin produces a *thin* jar; the **spring-boot-maven-plugin's `repackage` goal** (bound to `package`) rewrites it into a fat jar — your classes plus all dependencies plus the `JarLauncher`:

```xml
<plugin>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-maven-plugin</artifactId>
    <configuration>
        <mainClass>com.academy.BackendApplication</mainClass>
    </configuration>
</plugin>
```

## Profiles: Environment-Specific Builds

```xml
<profiles>
    <profile>
        <id>ci</id>
        <properties>
            <skip.tests>false</skip.tests>
        </properties>
    </profile>
    <profile>
        <id>fast</id>
        <properties>
            <skip.tests>true</skip.tests>
        </properties>
    </profile>
</profiles>
```

```bash
mvn package -P ci        # run tests
mvn package -P fast      # skip tests (dev iteration)
mvn package -DskipTests  # compile tests but don't run
mvn package -Dmaven.test.skip=true  # don't even compile tests
```

## Skipping Tests Correctly

| Flag | Compiles tests? | Runs tests? |
|------|-----------------|-------------|
| `-DskipTests` | ✅ | ❌ |
| `-Dmaven.test.skip=true` | ❌ | ❌ |

CI should **never** skip tests — that's the verification gate. Dev iteration can.

## Common Commands

```bash
mvn clean                    # wipe target/
mvn compile                  # classes only
mvn test                     # compile + test
mvn package                  # ... + jar
mvn install                  # ... + local repo
mvn deploy                   # ... + remote repo
mvn verify                   # ... + integration tests
mvn dependency:tree          # dependency graph
mvn help:effective-pom       # the full effective pom
mvn -pl module-a -am package # build module + its dependencies
```

## Summary

| Concept | Key fact |
|---------|----------|
| Lifecycle | Fixed phase order; commands run a prefix |
| Phase | Slot where plugin goals execute |
| Goal | A plugin's action bound to a phase |
| Parent | Spring Boot parent = version management |
| Repackage | spring-boot plugin makes the fat jar |
| Profiles | `-P ci`, `-P fast` for env builds |
| Skip tests | `-DskipTests` (run) vs `-Dmaven.test.skip` (compile) |

Maven is a lifecycle engine with a plugin system: pick the prefix (`test`, `package`, `verify`), let the plugins bind, and the build is deterministic. The next lessons cover dependency management, plugins, and the Gradle alternative.
