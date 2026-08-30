---
title: DevTools Advanced — Customizing Restart, LiveReload, and Remote Debug
summary: Advanced DevTools configuration: custom restart triggers, conditional restart exclusions, remote application debugging, resource-only restart for frontend dev, and performance tuning.
order: 2
minutes: 22
topics: ["trigger file", "restart exclusion", "remote debug", "resource restart", "performance tuning"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/using/devtools.html"
    title: "Using DevTools"
---

## The Concept, From Zero

The default DevTools setup works for simple projects, but larger organizations need fine-grained control: "Don't restart when my test files change", "Only restart when I explicitly ask", "I need to debug the remote staging server from my IDE".

This lesson covers the advanced configuration that makes DevTools production-grade for development teams of any size.

---

## Trigger File — Manual Restart Control

Instead of auto-restarting on every file save (which can be disruptive during rapid editing), use a trigger file:

```yaml
spring:
  devtools:
    restart:
      trigger-file: .reloadtrigger
      additional-exclude: "**/*.generated.java"
```

Now the app only restarts when you explicitly touch the trigger file:

```bash
# Linux/Mac
touch .reloadtrigger

# Windows (PowerShell)
echo . > .reloadtrigger

# Or add an IDE keyboard shortcut to do this automatically
```

**Why this helps:** In a large project with 500+ Java files, you might accidentally save 10 files while typing. Without a trigger, that's 10 restarts in 2 seconds.

---

## Resource-Only Restart for Frontend Dev

If you're a full-stack developer and only want CSS/HTML/JS changes to trigger a refresh (no Java restart), use the `livereload` resource filter:

```yaml
spring:
  devtools:
    restart:
      exclude: "**/*Controller.java"  # Don't restart for controller changes
      additional-exclude: "static/**"
    livereload:
      enabled: true
```

Better yet, use `spring-boot-devtools` with a custom restart strategy:

```java
@Configuration
public class DevToolsConfig {

    @Bean
    public ConditionalOnDevToolsRestart restartConfig() {
        return new ConditionalOnDevToolsRestart();
    }
}
```

---

## Excluding Specific Packages from Restart

```yaml
spring:
  devtools:
    restart:
      # Exclude packages that change frequently but don't need restart
      exclude:
        - "**/generated/**"
        - "**/proto/**"
        - "**/proto3/**"
      # But DO restart when these critical packages change
      additional-paths:
        - src/main/java/com/example/config
        - src/main/java/com/example/security
```

---

## Remote Debugging with DevTools

DevTools can connect your local IDE to a remote Spring Boot instance:

### Step 1: Configure the Remote Server

```yaml
# application.yml on the REMOTE server
spring:
  devtools:
    remote:
      secret: "my-strong-secret-key-min-32-chars"
      debug:
        local-address: localhost
        local-port: 35729
```

### Step 2: Connect from Local Machine

```bash
# On your local machine:
mvn spring-boot:run \
  -Dspring-boot.run.jvmArguments="\
    -Dspring.devtools.remote.url=http://staging-server:8080 \
    -Dspring.devtools.remote.secret=my-strong-secret-key-min-32-chars"
```

**What this gives you:**
- Local LiveReload when remote code changes
- Can trigger restarts remotely
- Remote application logging appears locally

---

## Conditional Restart Exclusions

Use `spring-devtools.properties` (on the classpath) for per-project restart rules:

```properties
# spring-devtools.properties

# Don't restart when SQL migration files change
spring.devtools.restart.exclude=liquibase/**,flyway/**

# Don't restart when protobuf files change
spring.devtools.restart.exclude=**/*.proto

# Do restart when these specific files change
spring.devtools.restart.additional-paths=src/main/resources/templates
```

---

## Performance Tuning

For very large projects (1000+ files), restart can be slow:

```yaml
spring:
  devtools:
    restart:
      # Poll interval: how often to check for file changes
      poll-interval: 2s          # Default: 1s (slower = less CPU)
      # Quiet period: wait this long after last change before restarting
      quiet-period: 1s           # Default: 400ms (longer = more stable)
```

**Alternative: Classpath-based restart**

For projects where even DevTools restart is too slow, disable restart entirely and use a different approach:

```yaml
spring:
  devtools:
    restart:
      enabled: false  # Disable auto-restart
    livereload:
      enabled: true   # Keep LiveReload for CSS/HTML changes
```

Then use `spring-boot-devtools` with Spring Loaded or DCEVM for hot-swapping individual methods.

---

## Testing DevTools Behavior

Verify that DevTools is NOT active in production:

```java
@SpringBootTest
class DevToolsActivationTest {

    @Test
    void devToolsShouldBeInactiveInTestProfile() {
        // DevTools auto-disables when spring.profiles.active contains "prod"
        // and when running from a fat JAR
        boolean devtoolsActive = ClassUtils.isPresent(
            "org.springframework.boot.devtools.classpath.RestartClassLoader",
            getClass().getClassLoader());

        // In production tests, this should be false
        System.out.println("DevTools active: " + devtoolsActive);
    }
}
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Polling interval too low | High CPU usage during development | Set `poll-interval: 2s` |
| No quiet period | Rapid-fire restarts during typing | Set `quiet-period: 500ms` |
| Trigger file on network drive | File change detection fails | Use a local file, not network-mounted |
| Forgetting remote secret | Anyone can connect to remote server | Always set a strong secret |
| Including DevTools in fat JAR | DevTools runs in production | Use `<optional>true</optional>` |
