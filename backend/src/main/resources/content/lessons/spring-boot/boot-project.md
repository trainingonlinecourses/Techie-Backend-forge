---
title: Spring Boot Project Structure — The Complete Guide
summary: How a Spring Boot project is organized — src/main/java, src/main/resources, src/test, the role of pom.xml/build.gradle, and how to structure a real enterprise application. Beginner-friendly with line-by-line explanations.
order: 2
minutes: 20
topics: [project structure, pom.xml, build.gradle, src layout, application.properties, profiles, enterprise structure]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#using.spring-boot
  - https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#structuring.your.code
---

# Spring Boot Project Structure — The Complete Guide

## What is a Spring Boot Project? (From Zero)

When you create a Spring Boot project (via Spring Initializr or manually), it follows a standard directory layout. Understanding this layout is crucial because Spring Boot uses **conventions** — it looks for things in specific places, and if you put files in the wrong location, they won't work.

Think of it like a hotel: rooms are numbered, restaurants are on specific floors, check-in is at the front desk. You can rearrange things, but then nobody knows where anything is.

---

## The Standard Directory Layout

```
techie-backend-forge/
├── pom.xml                              # Maven build config (or build.gradle)
├── src/
│   ├── main/
│   │   ├── java/                        # Your Java source code
│   │   │   └── com/example/academy/
│   │   │       ├── AcademyApplication.java   # Main class (@SpringBootApplication)
│   │   │       ├── controller/          # REST controllers (handle HTTP requests)
│   │   │       │   ├── AuthController.java
│   │   │       │   └── CourseController.java
│   │   │       ├── service/             # Business logic (what the app DOES)
│   │   │       │   ├── AuthService.java
│   │   │       │   └── CourseService.java
│   │   │       ├── repository/          # Database access (what the app READS/WRITES)
│   │   │       │   ├── UserRepository.java
│   │   │       │   └── CourseRepository.java
│   │   │       ├── model/               # Domain objects (entities, DTOs)
│   │   │       │   ├── User.java
│   │   │       │   └── Course.java
│   │   │       ├── config/              # Configuration classes
│   │   │       │   └── SecurityConfig.java
│   │   │       └── exception/           # Custom exceptions + handlers
│   │   │           └── GlobalExceptionHandler.java
│   │   └── resources/
│   │       ├── application.yml          # Main configuration file
│   │       ├── application-dev.yml      # Dev-specific config
│   │       ├── application-prod.yml     # Production-specific config
│   │       ├── content/                 # Static content (lessons, data)
│   │       │   └── lessons/
│   │       ├── static/                  # Static web assets (CSS, JS, images)
│   │       ├── templates/               # Thymeleaf templates (server-side rendering)
│   │       └── schema.sql               # Database initialization SQL
│   └── test/
│       └── java/                        # Test classes (mirrors main structure)
│           └── com/example/academy/
│               ├── controller/
│               │   └── AuthControllerTest.java
│               └── service/
│                   └── CourseServiceTest.java
└── target/                              # Build output (compiled classes, JAR)
```

---

## The Code — Key Files Explained

### The Main Application Class

```java
@SpringBootApplication       // Combines @Configuration + @EnableAutoConfiguration + @ComponentScan
public class AcademyApplication {

    public static void main(String[] args) {
        SpringApplication.run(AcademyApplication.class, args);
        // This single line:
        // 1. Creates the Spring ApplicationContext
        // 2. Scans all packages under com.example.academy for components
        // 3. Auto-configures DataSource, Tomcat, Jackson, etc.
        // 4. Starts the embedded Tomcat server
        // 5. Your app is now serving HTTP requests!
    }
}
```

**Line-by-line explained:**
- `@SpringBootApplication` — The magic annotation. It tells Spring: "scan this package and everything below it, auto-configure everything you need."
- `SpringApplication.run()` — Starts the entire Spring Boot application. This is where the magic happens.

### The application.yml Configuration

```yaml
# application.yml — Main configuration
server:
  port: 8080                              # HTTP port (default 8080)
  servlet:
    context-path: /api                     # All URLs start with /api

spring:
  application:
    name: academy-backend                 # App name (used in logs, service discovery)

  # Database configuration
  datasource:
    url: jdbc:postgresql://localhost:5432/academy
    username: ${DB_USERNAME}              # From environment variable
    password: ${DB_PASSWORD}              # From environment variable

  # JPA / Hibernate
  jpa:
    hibernate:
      ddl-auto: validate                  # Validate schema on startup (never 'create' in prod!)
    show-sql: false                       # Don't log SQL in production
    properties:
      hibernate:
        format_sql: true                  # Pretty-print SQL in logs

# Actuator (health checks, metrics)
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics      # Only expose safe endpoints
  endpoint:
    health:
      show-details: never                 # Don't expose health details to unauthorized users

# Custom application properties
app:
  jwt:
    secret: ${JWT_SECRET}                 # JWT signing key from environment
    expiration: 3600000                   # 1 hour in milliseconds
```

**Line-by-line explained:**
- `server.port: 8080` — The HTTP port. Change to 8081 if 8080 is in use.
- `spring.datasource.url` — Database connection URL. Use environment variables for credentials.
- `hibernate.ddl-auto: validate` — In production, only VALIDATE the schema (don't auto-create/modify tables).
- `management.endpoints.web.exposure.include` — Only expose health/info/metrics. Don't expose env, configprops, or beans in production.
- `app.jwt.secret` — Custom properties with the `app.` prefix are your own configuration.

### Profile-Specific Configuration

```yaml
# application-dev.yml — Development only
spring:
  jpa:
    show-sql: true                        # Log SQL queries in dev
    hibernate:
      ddl-auto: update                    # Auto-update schema in dev (convenient)
  datasource:
    url: jdbc:h2:mem:academy              # In-memory database for dev

logging:
  level:
    com.example.academy: DEBUG            # Verbose logging in dev
```

```yaml
# application-prod.yml — Production only
spring:
  jpa:
    show-sql: false                       # Don't log SQL in prod
    hibernate:
      ddl-auto: validate                  # Never auto-modify in prod

logging:
  level:
    com.example.academy: INFO             # Normal logging in prod
    org.springframework.security: WARN    # Reduce security noise

management:
  endpoints:
    web:
      exposure:
        include: health,info              # Minimal endpoints in prod
```

---

## Real-World Scenarios

### Scenario 1: Running Different Configs

```bash
# Development (uses application-dev.yml):
java -jar app.jar --spring.profiles.active=dev

# Production (uses application-prod.yml):
java -jar app.jar --spring.profiles.active=prod

# Override specific properties:
java -jar app.jar --server.port=9090 --spring.profiles.active=prod
```

### Scenario 2: Enterprise Package Structure

```
com.example.academy/
├── AcademyApplication.java
├── config/                    # @Configuration classes
│   ├── SecurityConfig.java
│   ├── CacheConfig.java
│   └── AsyncConfig.java
├── module/                    # Feature modules (by domain)
│   ├── auth/
│   │   ├── AuthController.java
│   │   ├── AuthService.java
│   │   ├── UserRepository.java
│   │   └── dto/
│   │       ├── LoginRequest.java
│   │       └── LoginResponse.java
│   └── course/
│       ├── CourseController.java
│       ├── CourseService.java
│       └── CourseRepository.java
├── common/                    # Shared utilities
│   ├── exception/
│   │   └── GlobalExceptionHandler.java
│   └── util/
│       └── SlugUtil.java
└── content/                   # Content management
    ├── ContentService.java
    └── ContentRepository.java
```

### Scenario 3: Multi-Module Maven Project

```
parent-pom/
├── pom.xml                    # Parent POM (manages versions)
├── api/                       # REST API module
│   ├── pom.xml
│   └── src/main/java/
├── core/                      # Business logic module
│   ├── pom.xml
│   └── src/main/java/
├── data/                      # Database access module
│   ├── pom.xml
│   └── src/main/java/
└── common/                    # Shared code module
    ├── pom.xml
    └── src/main/java/
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Putting `@SpringBootApplication` in a sub-package | Component scan misses classes in parent package | Put it at the root of your package hierarchy |
| Using `ddl-auto: create` in production | Drops all tables on restart! | Always use `validate` in production |
| Hardcoding database credentials | Security risk, can't change between environments | Use environment variables |
| No profile-specific configs | Dev settings leak into production | Use `application-{profile}.yml` |
| Mixing business logic in controllers | Untestable, hard to maintain | Keep controllers thin, logic in services |

---

## Key Takeaways

- **Convention over configuration** — Spring Boot looks for specific files in specific locations. Follow the convention.
- **`@SpringBootApplication` at the root** — ensures component scanning finds all your classes.
- **Profile-specific configs** (`application-{profile}.yml`) — separate dev/test/prod configurations.
- **Never hardcode secrets** — always use environment variables or a secrets manager.
- **Thin controllers, fat services** — controllers handle HTTP, services handle business logic.

Official docs: [Using Spring Boot](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#using.spring-boot) · [Code Structure](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#structuring.your.code)
