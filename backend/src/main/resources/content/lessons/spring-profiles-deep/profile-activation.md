---
title: Profile Activation Methods — Ways to Enable Profiles
summary: Every method to activate Spring profiles: command line, environment variables, properties files, programmatic activation, and test annotations.
order: 4
minutes: 15
topics: [profile-activation, command-line, environment, system-property, test-profile, spring-active-profiles]
docs:
  - https://docs.spring.io/spring-boot/reference/features/profiles.html
---

## The Concept, From Zero

You can activate Spring profiles in many ways. The order matters — later sources override earlier ones.

```bash
# The most common: command line
java -jar app.jar --spring.profiles.active=dev

# Or environment variable
SPRING_PROFILES_ACTIVE=dev java -jar app.jar
```

---

## Activation Methods

### 1. Command Line

```bash
# Single profile
java -jar app.jar --spring.profiles.active=prod

# Multiple profiles
java -jar app.jar --spring.profiles.active=prod,docker
```

### 2. Environment Variable

```bash
export SPRING_PROFILES_ACTIVE=prod
java -jar app.jar
```

### 3. application.yml

```yaml
spring:
  profiles:
    active: dev
```

### 4. System Property

```bash
java -Dspring.profiles.active=dev -jar app.jar
```

### 5. Programmatic

```java
SpringApplicationBuilder app = new SpringApplicationBuilder(Application.class)
    .profiles("dev", "local")
    .build();
```

### 6. Test Annotation

```java
@SpringBootTest
@ActiveProfiles("test")
class UserServiceTest { }
```

---

## Real-World Scenarios

### Scenario 1: Docker multi-stage build

```yaml
# docker-compose.yml
services:
  app:
    image: myapp:latest
    environment:
      - SPRING_PROFILES_ACTIVE=docker
```

### Scenario 2: CI/CD pipeline

```yaml
# GitHub Actions
- name: Run tests
  run: java -jar app.jar --spring.profiles.active=test-ci
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Setting profile in both yml and env | Confusion about which wins | Env vars override yml |
| Forgetting to include profile in tests | Tests use wrong beans | Always use `@ActiveProfiles` |
| Profile name with uppercase | Doesn't match | Spring profiles are case-sensitive |
