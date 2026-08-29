---
title: DevTools & Automatic Restart — Complete Beginner's Guide
summary: How Spring Boot DevTools works, automatic restart vs LiveReload, what restarts and what doesn't, and the performance trade-offs.
order: 15
minutes: 16
topics: [devtools, automatic restart, livereload, restart classloader, developer tools]
docs:
  - https://docs.spring.io/spring-boot/reference/using/devtools.html
---

# DevTools & Automatic Restart — Complete Beginner's Guide

## What DevTools does

Spring Boot DevTools provides **automatic restart** — when you change code, the app restarts automatically without manually stopping and starting. It also enables **LiveReload** in the browser.

```xml
<!-- Add DevTools to your project -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>
    <optional>true</optional>  <!-- Line 1: Optional — won't be included in production JAR -->
</dependency>
```

**That's it — just add the dependency.** Spring Boot auto-configures everything.

## How automatic restart works

```
1. You change a .java file
2. DevTools detects the change
3. DevTools uses a special classloader to restart the app
4. Most of the app restarts in ~1-2 seconds (not 10-20 seconds)
5. Your browser (with LiveReload extension) refreshes automatically
```

**Why is restart so fast?** DevTools uses a **base classloader** for third-party JARs (which don't change) and a **restart classloader** for your code (which changes):

```
┌─────────────────────────────┐
│  Base Classloader           │  ← Loaded once (Spring, Hibernate, Jackson, etc.)
│  (JARs don't change)        │     NOT reloaded on restart
└─────────────────────────────┘
┌─────────────────────────────┐
│  Restart Classloader        │  ← Reloaded when you change code
│  (your .class files)        │     THIS is what makes restart fast
└─────────────────────────────┘
```

## What restarts and what doesn't

| Reloaded (restart classloader) | NOT reloaded (base classloader) |
|---|---|
| Your `.class` files | All JARs in `lib/` |
| `@Configuration` classes | Spring Framework classes |
| `@Component`, `@Service`, etc. | Third-party libraries |
| `application.yml` changes | Static resources (CSS, JS) |

**Static resources (HTML, CSS, JS) don't trigger a restart** — they're served directly. The browser refreshes via LiveReload instead.

## LiveReload — auto-refresh the browser

Install the **LiveReload extension** in your browser (Chrome/Firefox). When DevTools is active:

1. You change `index.html`
2. LiveReload detects the change
3. Browser refreshes automatically

```yaml
# application.yml — LiveReload is enabled by default
spring:
  devtools:
    livereload:
      enabled: true          # Line 1: Default is true
```

## Configuration options

```yaml
spring:
  devtools:
    restart:
      enabled: true                  # Line 1: Enable automatic restart
      additional-paths: src/main/kotlin  # Line 2: Watch additional directories
      exclude: static/**,public/**  # Line 3: Don't restart for these paths
    livereload:
      enabled: true                  # Line 4: Enable LiveReload
```

## DevTools is NOT in production

DevTools automatically detects production and disables itself:

```java
// DevTools checks for this:
// 1. Is spring-boot-devtools on the classpath?
// 2. Is it in the root classloader? (production JAR bundles it in BOOT-INF/lib)
// 3. Is spring.profiles.active set? (production always sets this)

// Result: DevTools is ONLY active in development
// In production: no restart overhead, no LiveReload
```

## When to NOT use DevTools

- **Performance testing** — DevTools adds overhead (restart classloader)
- **CI/CD pipelines** — DevTools should be excluded (`<optional>true</optional>`)
- **Production** — Automatically disabled, but explicit exclusion is better

## Real-world scenario — developer workflow

```bash
# Developer workflow with DevTools:
1. Run the app: mvn spring-boot:run
2. App starts in ~3 seconds
3. Edit OrderService.java
4. DevTools detects change → app restarts in ~1-2 seconds
5. Browser auto-refreshes via LiveReload
6. See changes immediately!

# Without DevTools:
1. Run the app: mvn spring-boot:run
2. App starts in ~10 seconds
3. Edit OrderService.java
4. Stop the app (Ctrl+C)
5. Start again: mvn spring-boot:run
6. Wait ~10 seconds
7. Manually refresh browser
# Total time wasted: ~20 seconds per change!
```

## Common mistakes

| Mistake | Why it fails | Fix |
|---|---|---|
| DevTools in production JAR | Performance overhead | Use `<optional>true</optional>` |
| Restart too slow | Too many packages to scan | Add `restart.exclude` for heavy packages |
| LiveReload not working | Browser extension not installed | Install LiveReload extension |
| Restart doesn't detect changes | IDE saves in wrong location | Configure IDE to save to `target/classes` |
| Confusing restart with reload | Restart re-creates context; reload doesn't | DevTools does full restart (safe) |

## Key takeaways

- DevTools = automatic restart + LiveReload — just add the dependency
- Base classloader (JARs) + restart classloader (your code) = fast restart (~1-2s)
- Static resources refresh via LiveReload, not restart
- Automatically disabled in production
- Add `<optional>true</optional>` to exclude from production JAR

**Official docs:** [Spring Boot DevTools](https://docs.spring.io/spring-boot/reference/using/devtools.html)
