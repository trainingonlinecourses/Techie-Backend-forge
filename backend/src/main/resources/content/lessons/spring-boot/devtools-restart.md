---
title: DevTools, Restart & Live Reload — Fast Inner-Loop Development
summary: What spring-boot-devtools does, why restart beats full startup, the automatic restart and LiveReload mechanics, and why it never ships to prod.
order: 14
minutes: 15
topics: [devtools, restart, livereload, hot-reload, developer-experience, classloader]
docs:
  - https://docs.spring.io/spring-boot/reference/using/devtools.html
---

# DevTools, Restart & Live Reload — Fast Inner-Loop Development

## The concept: the developer's restart accelerator

`spring-boot-devtools` is a **development-only** module that dramatically shortens the edit → test → see-result loop. Its core trick is **restart with classloader surgery**: instead of shutting down the JVM and starting it again (a full Spring Boot start can take 10-30s), DevTools keeps the JVM alive and swaps in a *new* classloader that reloads only your classes:

```text
Startup with devtools:
   base classloader  → dependencies (Spring, Hibernate, jars) — loaded ONCE
   restart classloader → YOUR classes (src/main/java, resources) — reloaded on each change

On file change → discard restart classloader, build a fresh one → re-run SpringApplication
```

Because the heavy dependency classes stay loaded, a DevTools restart is typically a few seconds — not tens. This is the same idea behind "fat restart vs. slim restart" in IDE hot-reload tools, but built in and dependable.

## What DevTools actually gives you

- **Automatic restart** — any change under `src/main/java` or `src/main/resources` triggers a restart (the build must copy the change to `target/classes` first — run your IDE's build or `mvn compile`; DevTools itself watches the compiled output).
- **LiveReload** — with the browser extension (or a LiveReload-capable dev setup), a page refresh happens automatically after a restart completes.
- **Cache disabling** — template caches (Thymeleaf, FreeMarker) and other caches are disabled by default so changes show up immediately.
- **`/actuator/restart`** (with Actuator) — trigger a restart on demand.
- **Remote apps** — `spring.devtools.remote.secret` enables hot updates to a remote dev instance (use only in dev environments; it's a remote-code-execution risk if exposed).

## How we use it in an organization: the workflow

**Setup — the standard dev profile dependency:**

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-devtools</artifactId>
    <scope>runtime</scope>   <!-- runtime scope: present in dev, NOT packaged into prod jar -->
    <optional>true</optional>
</dependency>
```

The `runtime` + `optional` scopes are the guard rails: DevTools ends up on the dev classpath but **is never shipped inside the production jar**. Teams still add a belt-and-suspenders check:

```properties
# application.properties (base) — devtools is harmless when absent, but never run it in prod
spring.devtools.restart.enabled=true   # default true; prod jars don't include the classes anyway
```

**Scenario 1 — fast entity + migration iteration.** Change an entity, add a column, restart (3s), hit the endpoint, see the schema error, fix, repeat. Without DevTools this loop costs 15s+ per iteration and the developer context-switches away.

**Scenario 2 — frontend-backend pairing.** A React frontend proxying to the Spring API: backend change → DevTools restart → LiveReload refreshes the browser tab → the developer sees the integrated result without touching anything.

**Scenario 3 — CI is untouched.** DevTools being runtime-scoped means the packaged artifact is identical with or without it. The production deploy never contains it; restart behavior never affects prod.

## The restart mechanics worth knowing

- **Two classloaders:** your code is loaded by a fresh restart classloader each cycle; dependencies live in the base classloader. This is why a DevTools restart is fast — and why it's *not* a full JVM restart: static state in *dependencies* survives, static state in *your* classes is reset.
- **Trigger files:** you can tune what triggers a restart (`spring.devtools.restart.trigger-file=...`) or exclude paths (`spring.devtools.restart.exclude=...`) to avoid restarting on noisy changes (e.g., generated resources).
- **Restart vs. reload:** restart = re-run the context (safe, general); true hot-swap of a single method body (JRebel-style) is not what DevTools does — it restarts the app context with new classes.

## Pitfalls

- **Never ship to production.** Even if the jar excludes it, a careless `mvn package` including runtime deps (wrong scope) or a `@SpringBootTest` running with DevTools active slows tests. CI should assert DevTools is absent from the produced artifact if you want zero surprises.
- **Restart state is not JVM state.** A `static` field in your class resets on restart; a `static` field in a *dependency* does not. Code that depends on JVM-lifetime singletons behaves differently between dev (restart) and prod (cold start).
- **First restart after a build is still needed** — DevTools watches compiled output; an IDE that doesn't auto-build means no restart. Know your IDE's "build on save" setting.
- **Remote devtools is a security hole** if the port is reachable — it allows class injection. Localhost-only or disabled outside dev.

## Key takeaways

- DevTools swaps a fresh classloader for your classes — seconds, not tens, per iteration.
- `runtime` + `optional` scopes keep it out of the production jar.
- Automatic restart + LiveReload + disabled caches = fast inner loop.
- Restart resets *your* statics, not dependency statics — know the difference.
- It's a dev tool: excluded from prod by scope, and should never be enabled there.
