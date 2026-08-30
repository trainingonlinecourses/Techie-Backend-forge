---
title: Production Monitoring & Incident Response
module: cicd-devops
order: 5
minutes: 20
topics: ["runbooks", "incident response", "postmortems", "logging in prod", "on-call", "blameless culture"]
docs:
  - title: "SRE book"
    url: "https://sre.google/sre-book/table-of-contents/"
summary: Deployments are the easy part; operating production is where systems live or die. This lesson covers the operational layer: what to log, how to res...
---

# Production Monitoring & Incident Response

Deployments are the easy part; **operating** production is where systems live or die. This lesson covers the operational layer: what to log, how to respond to incidents, and how to turn outages into improvements.

## Logging in Production

### Levels That Mean Something

| Level | What belongs |
|-------|--------------|
| ERROR | Request failed, retry won't help, someone must look |
| WARN | Degraded but serving (retry succeeded, cache miss storm) |
| INFO | Normal lifecycle (startup, shutdown, major state changes) |
| DEBUG | Verbose detail — off in prod |

### Structured Logging

Log in JSON so tools can filter and alert:

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

```xml
<!-- logback-spring.xml -->
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
</appender>
```

```json
{"timestamp":"2026-08-18T10:00:00.123Z","level":"ERROR",
 "logger":"com.acme.PaymentService","message":"Payment failed",
 "traceId":"4bf92f3577b34da6","userId":"u42",
 "stack_trace":"..."}
```

Rules:
- Log the **correlation ids** (traceId, userId, orderId) — they're the join keys.
- Log at the **boundary** (request entry/exit, external calls), not every line.
- **Never log secrets** — keys, passwords, tokens, PII. Log scrubbed values.
- Log the *outcome*: "Payment failed: gateway timeout after 3s" beats a raw exception.

## The Incident Response Playbook

### Severity Levels

| Sev | Definition | Response |
|-----|-----------|----------|
| SEV-1 | Total outage, revenue/data at risk | Page immediately, all hands |
| SEV-2 | Major feature degraded | Page, work hours |
| SEV-3 | Minor issue, workaround exists | Ticket, next day |
| SEV-4 | Cosmetic / tech debt | Backlog |

### The Incident Timeline

```
14:02  Alert fires (HighErrorRate > 1% for 10m)
14:03  On-call acknowledges (SLA: 5 min)
14:05  Declares SEV-2, opens incident channel
14:06  Checks Grafana: error spike on /payments, p95 up 3×
14:08  Checks recent deploys: v2.4 shipped 13:55 — prime suspect
14:10  Rolls back to v2.3 (kubectl rollout undo)
14:12  Error rate drops to 0.1% — service recovered
14:30  Postmortem started: root cause + follow-ups
```

The discipline: **acknowledge fast, declare early, roll back first, investigate later**. Don't debug in production while customers are down.

### The Incident Command

- **Commander** — one person coordinates, decides rollback.
- **Scribe** — records the timeline (for the postmortem).
- **Investigators** — the rest focus on diagnosis, not chatter.

## Postmortems: Blameless by Design

A postmortem's purpose is *prevention*, not punishment:

```
Incident: Payment failures after v2.4 deploy
Impact: 0.8% of payments failed for 18 minutes
Root cause: v2.4 changed the gateway timeout from 3s to 1s;
            under load, p99 latency exceeded 1s → mass timeouts
Trigger: Deploy at 13:55 without a canary gate
Detection: Error-ratio alert (10m delayed)
Resolution: Rolled back to v2.3 at 14:12

Follow-ups:
  1. [ ] Restore 3s timeout in v2.5
  2. [ ] Add timeout change to canary gate checks
  3. [ ] Reduce alert delay from 10m to 5m for payment errors
  4. [ ] Add load test that simulates p99 spikes
```

**Blameless** means the postmortem asks *what in the system allowed this?* — not *who broke it?* Blame destroys the psychological safety that makes people report problems early.

## The On-Call Contract

- **Documented runbooks** for every page: *"If X alert fires: check panel Y, run command Z, if still bad page someone."*
- **Time-to-acknowledge SLO**: 5 minutes for SEV-1/2.
- **Handoff**: on-call logs out only after the successor confirms the current state.
- **Follow-the-sun or rotations**: nobody should be on call 24/7 indefinitely.

## Chaos: Test the Failure Modes

Production is a system of systems; the only way to trust the failure modes is to practice them:

- **Game days** — simulate a dependency outage (kill the DB) and watch the app behave (fail open? queue? degrade?).
- **Load tests** — before releases, not after.
- **Backup restores** — test that backups actually restore, quarterly.

## Automation That Prevents Incidents

| Automation | Prevents |
|-----------|----------|
| CI + tests on every PR | Code regressions |
| Vulnerability scans | Known CVEs |
| Canary gates on metrics | Latency/error regressions |
| Schema migration checks | Breaking DB changes |
| Secret scanning | Leaked credentials |
| Config validation | Bad config reaching prod |
| Runbook links in alerts | Slow response |

## Summary

| Layer | Practice |
|-------|----------|
| Logging | Structured JSON, correlation ids, no secrets, boundary-level |
| Detection | Alert on burn rate, not blips |
| Response | Acknowledge fast, roll back first, document the timeline |
| Culture | Blameless postmortems, runbooks, game days |
| Prevention | Tests, scans, canary gates, migration checks |

Operations is engineering: the systems you build, the runbooks you write, and the culture you set decide how fast you recover when (not if) production misbehaves. The goal isn't zero incidents — it's fast, safe recovery every time.
