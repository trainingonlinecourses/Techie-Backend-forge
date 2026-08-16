---
title: Bootstrapping a Spring Boot Project
summary: start.spring.io, the standard layout, the main class, devtools and the Maven/Gradle lifecycle.
order: 2
minutes: 14
topics: [start-spring-io, project-structure, main-class, devtools]
docs:
  - https://docs.spring.io/spring-boot/reference/using/build-systems.html
  - https://start.spring.io
---

# Bootstrapping a Spring Boot Project

## start.spring.io — the standard starting point

Every Boot project begins at **start.spring.io**: pick the Boot version, Java version, build tool, and starters. It generates a working project with the right layout, parent POM, and a `main` class.

## The standard layout (Maven)

```
my-app/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/com/example/myapp/
    │   │   ├── MyAppApplication.java      ← main class, top-level package
    │   │   ├── config/                     ← @Configuration, security
    │   │   ├── controller/                 ← @RestController
    │   │   ├── service/                    ← business logic
    │   │   ├── repository/                 ← Spring Data interfaces
    │   │   ├── domain/ or model/           ← entities, records
    │   │   └── dto/                        ← request/response records
    │   └── resources/
    │       ├── application.yml
    │       └── ...
    └── test/
        └── java/com/example/myapp/...
```

## The main class

```java
@SpringBootApplication                       // = @Configuration + @EnableAutoConfiguration + @ComponentScan
public class MyAppApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyAppApplication.class, args);
    }
}
```

Three annotations in one: it's the configuration class, enables auto-configuration, and component-scans the package **below it**. That's why the main class sits at the top of the package tree — move it and components silently stop being found.

## Running in development

```bash
mvn spring-boot:run          # run from sources
./mvnw spring-boot:run       # wrapper: same version for everyone (CI too)
mvn spring-boot:run -Dspring-boot.run.profiles=dev

# DevTools (optional starter): auto-restart on code change + LiveReload
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
</dependency>
```

## The Maven wrapper

`mvnw`/`mvnw.cmd` + `maven-wrapper.properties` pin the Maven version in the repo — CI, laptops, and production builds all use the same tool. Always commit the wrapper.

## Packaging and running

```bash
mvn clean package                    # → target/my-app-0.0.1-SNAPSHOT.jar (fat jar)
java -jar target/my-app-0.0.1-SNAPSHOT.jar
# The fat jar contains Tomcat + all deps; run anywhere with a JVM.
```

> **Why it matters (organizational view)** — Consistency is the point: every service in the org has the same layout, wrapper, and run commands, so developers move between services without re-learning. The review checklist: main class in the root package, no logic in the main class, resources in `src/main/resources`, tests mirroring production packages.

## Key takeaways

- start.spring.io scaffolds; the wrapper pins the build; layout is a convention.
- `@SpringBootApplication` = config + auto-config + component scan (root package!).
- `mvn spring-boot:run` for dev; fat jar + `java -jar` for deploy.
- DevTools for fast iteration; never ship it.

**Official docs:** [Build systems](https://docs.spring.io/spring-boot/reference/using/build-systems.html) · [start.spring.io](https://start.spring.io)
