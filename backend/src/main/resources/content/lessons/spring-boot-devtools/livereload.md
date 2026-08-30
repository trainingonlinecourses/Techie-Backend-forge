---
title: LiveReload — Instant Browser Refresh
summary: How Spring Boot DevTools LiveReload works, configuring the LiveReload server, browser extensions, and combining with hot restart for rapid development.
order: 3
minutes: 10
topics: [livereload, browser-extension, auto-refresh, devtools, hot-reload]
docs:
  - https://docs.spring.io/spring-boot/reference/using/devtools.html
---

## The Concept, From Zero

LiveReload automatically refreshes your browser when classpath resources change. DevTools runs a LiveReload server on port 35729 that notifies the browser to refresh.

```
1. You change a file
2. DevTools detects the change
3. LiveReload server sends a signal to the browser
4. Browser refreshes automatically
```

---

## Setup

```yaml
# application.yml (optional customization)
spring:
  devtools:
    livereload:
      enabled: true  # default: true
      port: 35729    # default: 35729
```

### Browser Extension

Install the LiveReload extension:
- Chrome: "LiveReload" extension
- Firefox: "LiveReload" extension
- Edge: "LiveReload" extension

Click the extension icon → it connects to `localhost:35729` → green indicator = connected.

---

## How It Works

```java
// Spring Boot DevTools automatically:
// 1. Starts a LiveReload server on port 35729
// 2. Watches classpath for changes
// 3. On change: triggers browser refresh via WebSocket

// What triggers a refresh:
// - Static resource changes (HTML, CSS, JS)
// - Template changes (Thymeleaf, FreeMarker)
// - Property file changes
// - Template engine configuration changes

// What does NOT trigger a refresh:
// - Java class changes (these trigger a restart, not just refresh)
// - Entity changes
// - Configuration class changes
```

---

## Real-World Scenarios

### Scenario 1: Frontend development

```
// Edit src/main/resources/static/index.html
// Browser refreshes automatically (no manual F5)
```

### Scenario 2: Template changes

```
// Edit src/main/resources/templates/home.html (Thymeleaf)
// Browser refreshes automatically
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| LiveReload port blocked | Extension can't connect | Check firewall/antivirus |
| Not installing browser extension | No auto-refresh | Install LiveReload extension |
| Using in production | Security risk + performance | DevTools only activates in dev |
| Conflicting with other tools | Port 35729 occupied | Change port in config |
