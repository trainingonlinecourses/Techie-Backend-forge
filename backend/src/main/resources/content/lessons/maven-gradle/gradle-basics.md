---
title: Gradle: The Modern Alternative
module: maven-gradle
order: 4
minutes: 25
topics: ["Gradle", "build.gradle", "Groovy vs Kotlin DSL", "tasks", "dependency configurations", "incremental build"]
docs:
  - title: "Gradle docs"
    url: "https://docs.gradle.org/current/userguide/userguide.html"
---

# Gradle: The Modern Alternative

Gradle is the build tool of Android and a growing share of the JVM world. Where Maven is XML and fixed lifecycles, Gradle is a **programmable build** with a task graph and incremental execution. This lesson covers the DSL, tasks, dependencies, and when Gradle beats Maven.

## The build.gradle.kts (Kotlin DSL)

```kotlin
plugins {
    java
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
}

group = "com.academy"
version = "1.0.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}
```

## Gradle vs Maven: The Core Difference

| | Maven | Gradle |
|--|-------|--------|
| Config | XML (declarative) | Groovy/Kotlin (programmable) |
| Model | Fixed lifecycle | Task graph (DAG) |
| Incremental | Whole lifecycle reruns | Only changed tasks |
| Speed | Slower (baseline) | Faster (incremental + daemon) |
| Flexibility | Limited | Unlimited (it's code) |
| Learning curve | Gentle | Steeper |
| Convention | Enforced | You define it |

## The Task Model

Gradle builds a **task graph** — every build is a DAG of tasks with dependencies:

```kotlin
tasks.register("hello") {
    doLast {
        println("Hello, Gradle!")
    }
}

// A task depending on another
tasks.register("buildAndGreet") {
    dependsOn("build")
    doLast { println("built!") }
}
```

```
:compileJava
:processResources
:classes        (depends on the two above)
:test           (depends on classes)
:jar            (depends on classes)
:bootJar        (depends on jar)
:build          (depends on test, jar, ...)
```

Run `./gradlew tasks` to see everything.

## Incremental Build: The Speed Advantage

Gradle tracks task **inputs and outputs**. A task whose inputs haven't changed is **UP-TO-DATE** — skipped entirely:

```bash
$ ./gradlew build
:compileJava UP-TO-DATE
:test UP-TO-DATE
:bootJar UP-TO-DATE
BUILD SUCCESSFUL in 1s
```

Plus the **Gradle daemon** keeps the JVM warm between builds. Combined: 5-minute Maven builds become 20-second Gradle builds on iteration.

## Dependency Configurations

| Configuration | Analog | Use |
|---------------|--------|-----|
| `implementation` | compile (not exposed) | Dependencies hidden from consumers |
| `api` | compile (exposed) | Leaks to consumers' compile classpath |
| `compileOnly` | provided | Lombok, annotations |
| `runtimeOnly` | runtime | JDBC drivers |
| `testImplementation` | test | JUnit, Mockito |
| `annotationProcessor` | — | Lombok, MapStruct |

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.projectlombok:lombok")
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.testcontainers:testcontainers")
}
```

**`implementation` vs `api`** is Gradle's signature subtlety: `implementation` hides the dependency from consumers (faster compilation, cleaner encapsulation); `api` exposes it.

## Version Catalogs (the modern way)

```toml
# gradle/libs.versions.toml
[versions]
spring-boot = "3.3.5"
testcontainers = "1.20.1"

[libraries]
spring-boot-starter-web = { module = "org.springframework.boot:spring-boot-starter-web" }
testcontainers = { module = "org.testcontainers:testcontainers", version.ref = "testcontainers" }

[plugins]
spring-boot = { id = "org.springframework.boot", version.ref = "spring-boot" }
```

```kotlin
plugins {
    alias(libs.plugins.spring.boot)
}

dependencies {
    implementation(libs.spring.boot.starter.web)
    testImplementation(libs.testcontainers)
}
```

Version catalogs centralize versions across multi-module builds — the Gradle answer to Maven's BOM.

## Multi-Project Builds

```
settings.gradle.kts:  include(":common", ":api", ":worker")

:api/build.gradle.kts:
dependencies {
    implementation(project(":common"))
}
```

```bash
./gradlew :api:build          # just api
./gradlew build               # everything
./gradlew :api:build -x test  # skip tests in api
```

## The Wrapper

```bash
./gradlew build    # downloads the right Gradle version, runs the build
```

`gradle-wrapper.properties` pins the version — every dev and CI uses the identical toolchain. Commit the wrapper (`gradlew`, `gradlew.bat`, `gradle/wrapper/`).

## Custom Tasks in Practice

```kotlin
// A real-world custom task: print the dependency count
tasks.register("depCount") {
    doLast {
        val count = configurations.runtimeClasspath.get()
            .resolve().distinct().count()
        println("Runtime dependencies: $count")
    }
}
```

## Boot Jar and BootRun

```kotlin
// The Boot plugin provides:
./gradlew bootRun        # run the app
./gradlew bootJar        # build the fat jar (analog of repackage)
./gradlew build          # includes bootJar
```

```kotlin
tasks.bootRun {
    args("--spring.profiles.active=dev")
    jvmArgs("-Xmx512m")
}
```

## Summary

| Concern | Gradle answer |
|---------|---------------|
| Config | Groovy/Kotlin DSL — programmable |
| Model | Task DAG, incremental |
| Speed | Daemon + up-to-date checks |
| Dependencies | `implementation`/`api`/`testImplementation`... |
| Versions | Version catalog (libs.versions.toml) |
| Multi-module | `include(":module")` + `project(":x")` |
| Toolchain | Wrapper pins the version |
| Boot | `bootRun`, `bootJar` plugins |

Gradle is Maven's programmable, incremental successor: a task graph instead of a lifecycle, code instead of XML, and build speed that compounds daily. Choose it for new projects with complex builds or large multi-module codebases; Maven stays a perfectly good default when conventions and familiarity matter more.
