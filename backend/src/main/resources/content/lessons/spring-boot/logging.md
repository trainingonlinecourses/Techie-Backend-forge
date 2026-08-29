---
title: Logging with SLF4J & Logback
summary: Structured, level-aware logging with the SLF4J API and Logback — configuration, log levels, patterns, structured (JSON) logging and common anti-patterns.
order: 11
minutes: 14
topics: [slf4j, logback, log levels, structured logging, log configuration]
docs:
  - https://docs.spring.io/spring-boot/reference/features/logging.html
  - https://logback.qos.ch/documentation.html
---

# Logging with SLF4J & Logback

## The stack

Spring Boot ships **SLF4J** (the API) over **Logback** (the implementation) — `spring-boot-starter-logging` is included in every starter. Rules of thumb:

- **Code against SLF4J**, never the concrete logger — implementations stay swappable.
- Use `LoggerFactory.getLogger(MyClass.class)` or Lombok's `@Slf4j` (which generates the same field).

```java
private static final Logger log = LoggerFactory.getLogger(OrderService.class);

log.trace("entry params {}", params);    // TRACE — internal diagnostics
log.debug("loading order {}", id);       // DEBUG — dev-time detail
log.info("order {} created", id);        // INFO — business milestones
log.warn("cache miss for {}", id);       // WARN — recoverable anomaly
log.error("payment failed for {}", id, ex); // ERROR — needs attention
```

**Never** string-concatenate: `log.info("order " + id)` always builds the string; `log.info("order {}", id)` skips it entirely when the level is disabled. The `{}` placeholder also takes multiple args and never throws on `null`.

## Levels and configuration

Default level is `INFO`; per-logger overrides in `application.yml`:

```yaml
logging:
  level:
    root: INFO
    com.backendforge.academy: DEBUG      # your package — more detail
    org.springframework.web: WARN        # quiet the framework noise
    org.hibernate.SQL: DEBUG             # see SQL (with parameters: org.hibernate.orm.jdbc.bind: TRACE)
```

Levels: `TRACE < DEBUG < INFO < WARN < ERROR`. Production teams run `INFO` (or `WARN` at the root), then **raise the level at runtime** — Spring Boot Actuator exposes `POST /actuator/loggers/{name}` with `{"configuredLevel":"DEBUG"}` to debug an incident without a redeploy.

## Patterns and appenders

`logging.pattern.console` controls the output format:

```yaml
logging:
  pattern:
    console: "%d{yyyy-MM-dd HH:mm:ss.SSS} %-5level [%thread] %logger{36} - %msg%n"
```

Fields: `%d` timestamp, `%level` (or `%-5level` padded), `%thread`, `%logger{36}` (abbreviated class), `%msg`/`%n`. For **file** output add a `logback-spring.xml` with `FileAppender`s and rolling policies — but in the cloud, the platform collects stdout; keep console as the single sink unless you need local file logs.

## Structured (JSON) logging

Logs as plain text are unsearchable at scale. Structured logging emits each entry as one JSON object so the platform can index fields:

```yaml
logging:
  file:
    name: /tmp/app.json
  pattern:
    console: '{"ts":"%d{ISO8601}","level":"%level","logger":"%logger{36}","msg":"%msg"}%n'
```

Better: use the **logstash-logback-encoder** dependency and `LogstashEncoder`, which handles escaping properly — hand-rolled JSON breaks the moment a message contains a quote. In code, add key-value context with a `MDC`-based helper or the encoder's `%kvp` — the crucial part is that `orderId`, `userId`, `tenant` appear as *fields*, not buried in prose.

## The anti-patterns that hurt

1. **Logging secrets** — never log passwords, tokens, or full card numbers. This is a compliance breach, not a style nit.
2. **Logging in a hot loop** — each `log.debug(...)` in a tight loop is a syscall; raise the level or log aggregates.
3. **Catching and logging, then rethrowing** — the same error appears twice with no new information; log once at the boundary.
4. **`log.error("failed: " + ex.getMessage())`** — the stack trace is the payload; pass the exception as the last arg (`{}`-style), don't discard it.
5. **Conditional logging on the message** — `if (log.isDebugEnabled())` is already done for you by `{}` placeholders (only needed when building the arg itself is expensive).

## Correlation IDs

For request tracing, put a correlation ID in the **MDC** (inherited by all log lines from that thread):

```java
MDC.put("correlationId", reqId);   // set in a servlet filter
try { ... } finally { MDC.remove("correlationId"); }
```

Every line in that request then carries the same ID — the field that makes log-diving possible across services.

## Key takeaways

- SLF4J API, Logback impl; use `{}` placeholders, never concatenation.
- Set package-level levels in `application.yml`; tune at runtime via Actuator.
- Structured/JSON logs with an MDC correlation ID are the production standard.
- Never log secrets; log once, at the boundary, with the exception attached.

Official docs: [Spring Boot Logging](https://docs.spring.io/spring-boot/reference/features/logging.html) · [Logback](https://logback.qos.ch/documentation.html)
