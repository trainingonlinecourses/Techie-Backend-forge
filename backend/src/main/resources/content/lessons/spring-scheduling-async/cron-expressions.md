---
title: Cron Expressions Deep Dive
module: spring-scheduling-async
order: 4
minutes: 20
topics: ["cron fields", "special characters", "timezones", "cron testing", "common patterns"]
summary: Cron is the de facto language for calendarbased scheduling. Spring's variant has six fields — seconds first — which differs from the fivefield Unix...
docs:
  - title: "Cron expressions"
    url: "https://docs.spring.io/spring-framework/reference/integration/scheduling.html#scheduling-cron-expression"
---

# Cron Expressions Deep Dive

Cron is the de facto language for calendar-based scheduling. Spring's variant has **six fields** — seconds first — which differs from the five-field Unix cron. Misunderstanding that one detail is the most common cron bug in Spring applications.

## The Six Fields

```
 ┌───────────── second (0-59)
 │ ┌─────────── minute (0-59)
 │ │ ┌───────── hour (0-23)
 │ │ │ ┌─────── day of month (1-31)
 │ │ │ │ ┌───── month (1-12 or JAN-DEC)
 │ │ │ │ │ ┌─── day of week (0-7, SUN-SAT; 0 and 7 both mean Sunday)
 │ │ │ │ │ │
 * * * * * *
```

| Field | Values | Special chars |
|-------|--------|---------------|
| second | 0–59 | `* , - /` |
| minute | 0–59 | `* , - /` |
| hour | 0–23 | `* , - /` |
| day of month | 1–31 | `* , - / ? L W` |
| month | 1–12, JAN–DEC | `* , - /` |
| day of week | 0–7, SUN–SAT | `* , - / ? L #` |

## Special Characters

### Asterisk — every value
```java
"* * * * * *"   // every second (be careful!)
```

### Comma — list
```java
"0 0 6,18 * * *"   // 6 AM and 6 PM daily
```

### Hyphen — range
```java
"0 30 9-17 * * MON-FRI"   // 9:30 through 17:30, weekdays
```

### Slash — step
```java
"0 */10 * * * *"     // every 10 minutes
"0 0/15 * * * *"     // every 15 minutes starting at minute 0
"0 30/45 * * * *"    // minute 30, then minute 75→15 of next hour
```

### Question mark — no specific value
Only legal in day-of-month or day-of-week. Use `?` when you want the *other* field to do the work:

```java
"0 0 9 ? * MON"      // 9 AM on Mondays (day-of-week drives it)
"0 0 9 1 * ?"        // 9 AM on the 1st of every month
```

Using `*` in both day fields is ambiguous — Spring treats `* *` as "every day of month AND every day of week," which effectively means every day, but `?` is the explicit, intent-revealing choice.

### L — last
```java
"0 0 9 L * ?"        // 9 AM on the last day of the month
"0 0 9 ? * L"        // 9 AM on the last day of the week (Saturday)
```

### W — nearest weekday (day-of-month only)
```java
"0 0 9 15W * ?"      // 9 AM on the weekday nearest the 15th
```
If the 15th is a Saturday, this fires Friday the 14th; if Sunday, Monday the 16th.

### # — nth weekday (day-of-week only)
```java
"0 0 9 ? * 2#1"      // 9 AM on the first Monday of the month
"0 0 9 ? * 5#3"      // 9 AM on the third Friday
```

## Common Production Patterns

```java
"0 0 3 * * *"            // daily 3 AM (batch, report generation)
"0 */5 * * * *"          // every 5 minutes (heartbeat, health)
"0 0 8-18 * * MON-FRI"   // hourly 8 AM–6 PM weekdays
"0 0 12 * * MON"         // Monday noon
"0 0 0 1 * ?"            // midnight on the 1st of each month
"0 0 2 ? * 6#1"          // 2 AM first Saturday
"0 15 10 ? * 6L"         // 10:15 AM last Friday of month
"0 0 9 * * MON-FRI"      // 9 AM weekdays
"0 0 0/2 * * *"          // every 2 hours
```

## Timezone Awareness

By default, cron expressions evaluate in the JVM's default timezone — which is the **server's** timezone. A 3 AM job on a server in UTC runs at 3 AM UTC, not 3 AM your time. Fix it explicitly:

```java
@Scheduled(cron = "0 0 3 * * *", zone = "Asia/Kolkata")
public void nightlyReport() { ... }
```

The `zone` attribute accepts any `java.time.ZoneId` string. For schedules from configuration:

```java
@Scheduled(cron = "${app.jobs.cron}", zone = "${app.jobs.zone}")
public void job() { ... }
```

## Testing Cron Expressions

Never trust a cron string by eye. Options:

1. **Spring's `CronExpression`** (available since Spring 5.3):
```java
CronExpression expression = CronExpression.parse("0 0 3 * * *");
Instant next = expression.next(Instant.now());
System.out.println("Next run: " + next);
```

2. **Unit test the next-fire times**:
```java
@Test
void cronFiresAtThreeAm() {
    CronExpression cron = CronExpression.parse("0 0 3 * * *");
    Instant base = Instant.parse("2026-08-18T10:00:00Z");
    Instant next = cron.next(base);
    assertEquals(Instant.parse("2026-08-19T03:00:00Z"), next);
}
```

3. **Online validators** (crontab.guru etc.) for quick sanity — but remember they assume 5-field Unix cron; mentally add the seconds field.

## Pitfalls

| Mistake | Result |
|---------|--------|
| `0 0 3 * * *` vs Unix `0 3 * * *` | Spring treats the first field as seconds — `0 3 * * * *` fires at second 0 of minute 3 **every hour** |
| `*` in both day fields | Every day, but ambiguous intent — use `?` |
| `#` in day-of-month | Invalid — `#` is day-of-week only |
| `W` in day-of-week | Invalid — `W` is day-of-month only |
| No `zone` attribute | Job fires in server TZ, not your TZ |
| `0 0 12 * *` (5 fields) | Spring needs 6 fields — this throws at startup |

## Summary

Master the six fields, the three "which day" characters (`?`, `L`, `W`, `#`), and timezone control, and cron becomes precise rather than guesswork. The highest-value habits: always include seconds, always set `zone` explicitly for business-time jobs, and verify every expression with `CronExpression.parse(...)` in a unit test before it ships.
