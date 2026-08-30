---
title: Spring Boot DevTools — Development Productivity
summary: How Spring Boot DevTools accelerates development with automatic restarts, LiveReload, property defaults, and remote debugging — and why it's automatically disabled in production.
order: 1
minutes: 20
topics: ["devtools", "automatic restart", "livereload", "property defaults", "remote debug"]
docs:
  - url: "https://docs.spring.io/spring-boot/reference/using/devtools.html"
    title: "Spring Boot DevTools"
---

## The Concept, From Zero

When you're developing, every small code change requires a full restart of your Spring Boot application. This can take 5-15 seconds for a large project — and you do it hundreds of times a day.

**Spring Boot DevTools** solves this by:
1. Watching your classpath for changes and restarting automatically
2. Restarting only your code (not third-party libraries), making it much faster
3. Providing a **LiveReload** browser extension that refreshes the page automatically
4. Setting sensible development defaults (like disabling caching and template caching)

**Key safety feature:** DevTools is **automatically disabled** in production. It detects the `spring-boot-devtools` dependency and only activates in development. You never need to worry about it running in prod.

**When organizations use this:**
- Frontend developers: See CSS/HTML changes instantly without manual refresh
- Backend developers: Changes to `@Service` or `@Controller` classes take effect in 1-2 seconds
- Team leads: Standard dev environment for all developers

---

## How Automatic Restart Works

When DevTools is on the classpath, Spring Boot uses a special ClassLoader:

```
┌─────────────────────────────────┐
│   Base ClassLoader (JDK, libs)  │  ← Never restarts (~200ms to load)
│   spring-boot-devtools.jar      │
│   spring-core.jar               │
│   ...                           │
├─────────────────────────────────┤
│   Restart ClassLoader           │  ← Restarts when code changes (~1s)
│   Your application code         │
│   com.example.*                 │
│   application.yml               │
└─────────────────────────────────┘
```

When a file changes:
1. DevTools detects the file modification
2. Kills the "Restart ClassLoader"
3. Creates a new one with the updated code
4. Re-runs `SpringApplication.run()`

Because the "Base ClassLoader" never restarts, only your code reloads — making restarts **5-10x faster** than a full cold start.

---

## Setup

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>  <!-- Won't be included in production fat JAR -->
</dependency>
```

The `<optional>true</optional>` is crucial — it means when someone else runs your project, DevTools won't be included unless they also declare it.

---

## LiveReload — Browser Auto-Refresh

1. Install the [LiveReload extension](http://livereload.com/extensions/) in your browser
2. DevTools starts a LiveReload server on port 35729
3. When a file changes → DevTools restarts → notifies browser → page refreshes

```yaml
# application.yml
spring:
  devtools:
    livereload:
      enabled: true   # Default: true
      port: 35729     # Default: 35729
```

**What triggers LiveReload:**
- Java file changes → restart → full page reload
- HTML/CSS/JS changes → no restart → CSS-only refresh (instant!)
- `application.yml` changes → restart

---

## Development Property Defaults

DevTools automatically sets these properties:

```yaml
# These are set BY DevTools — you don't need to add them:
spring.thymeleaf.cache: false          # No template caching
spring.freemarker.cache: false         # No FreeMarker caching
spring.cache.type: none                # No caching at all
spring.devtools.restart.additional-paths: src/main/resources  # Watch resources too
spring.devtools.restart.exclude: static/**,public/**  # Don't restart for static files
```

---

## Configuring Restart Behavior

```yaml
spring:
  devtools:
    restart:
      enabled: true
      # Paths to watch for changes (default: everything on classpath)
      additional-paths: src/main/java
      # Paths to exclude from triggering restart
      exclude: test/**,build/**,target/**
      # Poll interval for file changes (default: 1 second)
      poll-interval: 1s
      # Quiet period after a change before restarting (default: 400ms)
      quiet-period: 400ms
```

### Trigger File — Manual Restart Control

Instead of auto-restarting on every file save, you can use a "trigger file":

```yaml
spring:
  devtools:
    restart:
      trigger-file: .reloadtrigger  # Only restart when this file is touched
```

Touch the file when you want to restart:
```bash
touch .reloadtrigger  # Linux/Mac
# or
echo . > .reloadtrigger  # Windows
```

---

## Remote Development

DevTools can connect to a running application on a remote server for live debugging:

```yaml
# On your local machine, add to application.yml:
spring:
  devtools:
    remote:
      secret: mySecretKey  # Password for remote connection
      debug:
        local-port: 35729  # Local LiveReload port
```

**Connect to a remote app:**
```bash
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.devtools.remote.url=http://your-server:8080"
```

This gives you local restart capability while the app runs on a remote server.

---

## Common Mistakes

| Mistake | Why It's Wrong | Fix |
|---------|---------------|-----|
| Including DevTools in production | Adds restart overhead, security risk | Use `<optional>true</optional>` |
| Disabling DevTools for speed | You lose auto-restart and LiveReload | Keep it — it's only active during dev |
| Watching too many paths | Slow polling, CPU waste | Use `exclude` to skip test/build directories |
| Ignoring `quiet-period` | Rapid saves cause multiple restarts | Set `quiet-period: 500ms` for stability |
| Using DevTools with dev profile | DevTools runs regardless of profile | It's classpath-based, not profile-based |
