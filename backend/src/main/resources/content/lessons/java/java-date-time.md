---
title: Date & Time with java.time
summary: The modern date/time API — Instant, LocalDate, ZonedDateTime, formatting and the pitfalls the legacy Date/Calendar API is famous for.
order: 13
minutes: 16
topics: [java.time, instant, zoneddatetime, datetimeformatter, timezones]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/package-summary.html
  - https://docs.oracle.com/javase/tutorial/datetime/iso/
---

# Date & Time with java.time

## Why java.time exists

The legacy `java.util.Date` / `Calendar` pair is notoriously broken:

- **Mutable** — any code can corrupt a shared instance.
- **Confusing semantics** — `new Date(2024, 0, 1)` months are 0-based, and `Date` silently mixes instants with local wall-clock time.
- **No timezone data model** — there is no type for "a date without a time" or "a time with an offset".

`java.time` (JSR-310, backported then added in Java 8) fixes all of it with **immutable, null-safe, well-named types** and a strict separation of concepts:

| Type | What it represents | Example |
|---|---|---|
| `Instant` | A point on the timeline (UTC epoch) | `2026-08-17T10:00:00Z` |
| `LocalDate` | A date with no time or zone | `2026-08-17` |
| `LocalTime` | A time with no date or zone | `14:30` |
| `LocalDateTime` | Date + time, still no zone | `2026-08-17T14:30` |
| `OffsetDateTime` | Date + time + fixed offset | `2026-08-17T14:30+02:00` |
| `ZonedDateTime` | Date + time + full zone (DST-aware) | `2026-08-17T14:30+02:00[Europe/Paris]` |
| `Duration` / `Period` | Amount of time (seconds) / calendar amount (days, months) | `PT2H` / `P1Y2M` |

## The rules teams actually use

1. **Store and transmit `Instant`** (or epoch millis) — UTC everywhere in the database and API. Convert to a zone **only at the UI edge**.
2. **Never use `LocalDateTime` for "a moment in time"** — it has no zone, so two servers in different zones would disagree. Use it only for things like "the shop opens at 09:00 local" that genuinely have no absolute instant.
3. **`ZonedDateTime` for scheduling logic** that must respect DST (a 2am recurring job on a DST-change day).
4. **Formatting goes through `DateTimeFormatter`, never `SimpleDateFormat`** (the latter is not thread-safe; the former is).

## Common operations

```java
// Now
Instant now = Instant.now();                              // UTC instant
ZonedDateTime here = ZonedDateTime.now();                  // system zone

// Parsing and formatting
LocalDate date = LocalDate.parse("2026-08-17");            // ISO by default
String s = date.format(DateTimeFormatter.ofPattern("dd MMM yyyy")); // "17 Aug 2026"

// Arithmetic (immutable — returns new instances)
LocalDate nextMonth = date.plusMonths(1);
Period age = Period.between(LocalDate.of(1990, 1, 1), LocalDate.now());

// Convert between types
ZonedDateTime zdt = instant.atZone(ZoneId.of("Europe/Paris"));
Instant back = zdt.toInstant();
```

## The classic bug: DST with LocalDateTime

```java
// Scheduled "every day at 02:30" in Europe/Paris — on the spring-forward day
// 02:30 does not exist, and on fall-back day it happens twice.
LocalDateTime naive = LocalDateTime.of(2026, 3, 29, 2, 30);
ZonedDateTime zoned = naive.atZone(ZoneId.of("Europe/Paris"));
// Java resolves non-existent times by shifting forward (02:30 → 03:30)
```

For recurring schedules, either store the zone + local time and resolve with `ZoneRules`, or store UTC instants and format in the user's zone.

## In a Spring Boot backend

```java
// JSON: Jackson serializes Instant as ISO-8601 by default (2026-08-17T10:00:00Z)
// — epoch-dependent, timezone-agnostic, perfect for APIs.
record Event(Long id, Instant occurredAt) {}

// Scheduling: Spring converts cron in the server zone; log the zone!
@Scheduled(cron = "0 0 2 * * *") // 02:00 server-local — document it
void nightlyReport() { ... }

// Auditing: capture once at the boundary
Instant at = Instant.now();
```

## Key takeaways

- `Instant` for storage/transport, `ZonedDateTime` for zone-aware logic, `LocalDate/Time` only for genuinely zone-less values.
- All `java.time` types are immutable and thread-safe — share them freely.
- Format with `DateTimeFormatter`; keep `SimpleDateFormat` out of new code.
- Mind DST at the boundaries (schedules, "next occurrence" logic) — resolve through `ZoneRules` when it matters.

Official docs: [java.time package](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/package-summary.html) · [Date Time tutorial](https://docs.oracle.com/javase/tutorial/datetime/iso/)
