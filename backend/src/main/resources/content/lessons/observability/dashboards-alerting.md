---
title: Dashboards and Alerting
module: observability
order: 5
minutes: 22
topics: ["Prometheus", "Grafana", "alert rules", "SLOs", "on-call", "golden signals"]
docs:
  - title: "Prometheus querying"
    url: "https://prometheus.io/docs/prometheus/latest/querying/basics/"
---

# Dashboards and Alerting

Metrics without dashboards are numbers; dashboards without alerts are archaeology. This lesson covers the standard stack — Prometheus scrapes, Grafana visualizes, Alertmanager pages — and, more importantly, *what to alert on* so you're woken up for signal, not noise.

## The Stack

```
Spring Boot ──/actuator/prometheus──▶ Prometheus ──scrape──▶ Grafana
                                        │
                                        └──rules──▶ Alertmanager ──▶ PagerDuty/Slack/email
```

Prometheus pulls metrics every 15s. Grafana queries Prometheus for dashboards. Alertmanager evaluates alert rules and routes notifications.

## PromQL: The Query Language

```
# Request rate (per second, over 5m window)
rate(http_server_requests_seconds_count[5m])

# Error rate — 5xx only
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
  / sum(rate(http_server_requests_seconds_count[5m]))

# p95 latency
histogram_quantile(0.95,
  sum(rate(http_server_requests_seconds_bucket[5m])) by (le))

# JVM heap usage
jvm_memory_used_bytes{area="heap"}
```

## The Golden Signals Dashboard

Every service dashboard should show these four:

1. **Latency** — histogram_quantile p50/p95/p99
2. **Traffic** — request rate
3. **Errors** — error ratio
4. **Saturation** — the most constrained resource (DB connections, queue depth)

A minimal, universally useful dashboard panel:

```
Panel: Error ratio
Query: sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
       / sum(rate(http_server_requests_seconds_count[5m]))
```

## Alert Rules That Don't Wake You Up

### Bad alert: page on any error

```yaml
groups:
  - name: api
    rules:
      # ❌ A single 500 during a deploy fires this
      - alert: AnyError
        expr: sum(rate(http_server_requests_seconds_count{status=~"5.."}[1m])) > 0
```

### Good alert: sustained error ratio above SLO

```yaml
groups:
  - name: api
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            / sum(rate(http_server_requests_seconds_count[5m])) > 0.01
        for: 10m          # must persist 10 minutes
        labels:
          severity: page
        annotations:
          summary: "Error rate above 1% for 10 minutes"
```

The `for: 10m` clause is the single best noise filter — transient blips never page.

### Good alert: latency SLO breach

```yaml
- alert: LatencySLO
  expr: |
    histogram_quantile(0.95,
      sum(rate(http_server_requests_seconds_bucket[5m])) by (le)) > 0.8
  for: 15m
  labels: { severity: page }
  annotations:
    summary: "p95 latency above 800ms for 15 minutes"
```

### Good alert: saturation

```yaml
- alert: ConnectionPoolExhausted
  expr: hikaricp_connections_active / hikaricp_connections_max > 0.8
  for: 5m
  labels: { severity: page }
  annotations:
    summary: "DB connection pool above 80% for 5 minutes"
```

## Alert Threshold Design

| Threshold | Alert | Page |
|-----------|-------|------|
| Error ratio > 1% for 10m | Slack | ✅ Page |
| p95 > 800ms for 15m | Slack | ✅ Page |
| Any 500 | Log only | ❌ |
| Disk > 85% | Slack | ✅ (grows slowly — alert early) |
| Cert expires < 14 days | Slack | ✅ |
| p99 > 2s for 5m | Slack | maybe |

Rules of thumb:
- Alert on **burn rate** (how fast are you consuming your error budget), not single events.
- Every page must be actionable: "DB connections exhausted" → you know what to do. "Error rate 1.1%" → noise.
- Alert the **symptom** (latency, errors) not the cause (a specific log line).

## SLOs: The Contract

An SLO is a target your service promises: *99.9% of requests return < 500ms*. Alert when the burn is unsustainable:

```
Error budget = 100% - SLO%
Burn rate = actual error rate / allowed error rate
```

Alert on burn rate > 14.4 (exhausting a 30-day budget in 2 days):

```yaml
- alert: ErrorBudgetBurn
  expr: |
    (1 - sum(rate(http_server_requests_seconds_count{status=~"5.."}[1h]))
          / sum(rate(http_server_requests_seconds_count[1h])))
      < 0.999
  for: 6h
  labels: { severity: page }
```

## Grafana: From Metrics to Pictures

A production dashboard skeleton:

```
Row: Overview
  Panel: Request rate      (rate, per endpoint)
  Panel: Error ratio       (percentage)
  Panel: p50/p95/p99       (histogram_quantile)
  Panel: Active connections (HikariCP)
Row: JVM
  Panel: Heap usage        (jvm_memory_used)
  Panel: GC pause time     (jvm_gc_pause_seconds_sum)
  Panel: Threads           (jvm_threads_live_threads)
Row: Dependencies
  Panel: DB query latency  (external call timers)
  Panel: Queue depth       (your queue gauge)
```

Use variables (`$endpoint`, `$instance`) so one dashboard serves every service.

## On-Call Discipline

- **Runbooks** — every page links to a runbook ("1. Check Grafana panel X. 2. If Y, restart Z.").
- **Silence maintenance** — silence alerts during deploys so the deploy itself doesn't page.
- **Postmortems** — after every real incident: what alerted, what was missed, what changed.

## Testing Alert Rules

Prometheus ships `promtool`:

```bash
promtool check rules alert-rules.yml
promtool test rules alert-rules-test.yml
```

Unit-test the rule with fixture data:

```yaml
rule_files: [alert-rules.yml]
evaluation_interval: 1m

tests:
  - interval: 1m
    input_series:
      - series: 'http_server_requests_seconds_count{status="500",job="api"}'
        values: '0+1x60'
    alert_rule_test:
      - eval_time: 60m
        alertname: HighErrorRate
        exp_alerts: []
```

## Summary

| Layer | Tool | Purpose |
|-------|------|---------|
| Export | Micrometer + /actuator/prometheus | Numbers out of the app |
| Collect | Prometheus | Scrape + store |
| Visualize | Grafana | Golden-signal dashboards |
| Alert | Alertmanager + rules | Page on burn, not blips |
| Contract | SLOs + burn rate | Know when you're failing the promise |

Observability is a loop: dashboards tell you what's happening, alerts tell you when to act, and postmortems turn incidents into improvements. Instrument early, alert on burn rate, and let the platform metrics do the heavy lifting.
