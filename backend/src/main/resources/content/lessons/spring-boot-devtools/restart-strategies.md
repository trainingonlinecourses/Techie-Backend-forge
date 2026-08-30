---
title: Restart Strategies — Configuring Fast Development
summary: How DevTools restart works, custom restart triggers, restart exclusions, baseline performance, and when to use restart vs LiveReload.
order: 5
minutes: 15
topics: [restart, triggers, exclusions, classpath, performance, fast-restart]
docs:
  - https://docs.spring.io/spring-boot/reference/using/devtools.html
---

## The Concept, From Zero

DevTools restart uses a custom ClassLoader to load only your classes (not third-party JARs). This makes restart much faster — typically 1-2 seconds instead of 5-10 seconds.

```
How restart works:
1. DevTools creates a "restart" ClassLoader for your code
2. The base ClassLoader loads third-party JARs (never changes)
3. On change: only the restart ClassLoader is discarded and recreated
4. Result: fast restart (only your code is reloaded)
```

---

## Configuration

```yaml
spring:
  devtools:
    restart:
      enabled: true
      # Files that trigger restart
      additional-paths: src/main/java,src/main/resources
      # Files that DON'T trigger restart
      exclude: static/**,public/**,templates/**,*.html
      # Additional exclude patterns
      additional-exclude: test/**
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.context.annotation.Configuration;
import org.springframework.devtools.restart.RestartScope;
import org.springframework.devtools.restart.Restarter;

@Configuration
public class DevToolsConfig {

    // 1. Trigger restart programmatically
    public void triggerRestart() {
        if (Restarter.isEnabled()) {
            Restarter.getInstance().restart();
        }
    }

    // 2. Exclude specific beans from restart
    // These beans survive restart (state is preserved)
    @RestartScope  // bean state survives restart
    @Bean
    public ExpensiveService expensiveService() {
        return new ExpensiveService();  // created once, survives restart
    }

    // 3. Custom trigger condition
    // Only restart when specific files change
    // (configured in application.yml)
}

// 4. Trigger patterns
// Default triggers: class files, property files, YAML files
// Custom triggers: add paths in additional-paths
// Excludes: static resources, templates, HTML
```

---

## Performance Optimization

```yaml
# application.yml
spring:
  devtools:
    restart:
      # Fast restart settings
      enabled: true
      additional-exclude: "*.html,*.css,*.js,*.json"

    # Remote restart (for remote dev)
    remote:
      secret: ${DEVTOOLS_SECRET:changeme}
```

```java
// In your code — check if restart is active
if (ClassUtils.isPresent("org.springframework.devtools.Restarter", null)) {
    // DevTools is active — optimize for development
}
```

---

## Real-World Scenarios

### Scenario 1: Custom restart trigger

```yaml
spring:
  devtools:
    restart:
      additional-paths: src/main/java,config/
      exclude: "static/**,resources/public/**"
```

### Scenario 2: Preserve expensive initialization

```java
@Component
@RestartScope  // survives restart
public class DatabaseMigration {
    @PostConstruct
    void init() {
        // This runs once, survives restarts
        flyway.migrate();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Restart too slow | DevTools can't optimize | Check excludes — too many files to watch |
| Restart in production | Performance + security | DevTools auto-disables (JAR packaging) |
| Forgetting @RestartScope | State lost on restart | Annotate expensive beans |
| Not excluding static resources | Browser refresh instead of restart | Add static/** to excludes |
