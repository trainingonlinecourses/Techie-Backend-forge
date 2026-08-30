---
title: Instant and Duration — Moments and Elapsed Time
module: java-time-api
order: 3
minutes: 24
topics: ["Instant", "Duration", "epoch", "UTC", "timestamps", "timeouts"]
summary: Two of the most important time concepts have nothing to do with calendars, months, or time zones:
docs:
  - title: "Instant (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/Instant.html"
---

# Instant and Duration — Moments and Elapsed Time

## The Concept: The Two Ideas That Don't Care About Calendars

Two of the most important time concepts have **nothing to do with calendars, months, or time zones**:

1. **`Instant` — a moment on the timeline.** "The moment this order was placed." It's the number of seconds (and nanoseconds) since the Unix epoch: `1970-01-01T00:00:00Z`. An `Instant` is the same value everywhere on Earth at the same moment. No zone conversion ever changes it. This is the *correct* type for logging, event timestamps, database `timestamptz` values, and anything you want to compare across machines.

2. **`Duration` — an amount of elapsed time.** "3.5 hours", "90 seconds", "250 milliseconds". Pure physics — no calendar, no DST, no leap years. The difference between two `Instant`s *is* a `Duration`.

Think of it this way: calendars are a *human* invention for naming moments ("August 18, 2026"); `Instant` is the *mathematical* reality underneath, and `Duration` measures the gaps.

## Why Instant Is the Storage Right Answer

When you store a timestamp, the two candidate representations are:

- **Wall-clock string**: `"2026-08-18T15:30:00"` — ambiguous. Which zone? Is it DST-adjusted? A server in another region reads a different moment from this string than you intended.
- **Instant (epoch-based)**: `1787074200` — unambiguous. It IS a moment. Any machine, any zone, same value.

The industry-standard practice: **store instants as UTC** (`Instant` in memory, `timestamptz` in Postgres, ISO-8601 with `Z` in JSON). Convert to a human zone **only at display time**, at the edge of your system. This is exactly how "when did the user click the button" should be recorded.

## The Code Walkthrough

```java
import java.time.*;

public class InstantDurationDemo {

    public static void main(String[] args) throws InterruptedException {
        // ---- 1. Measuring elapsed time with Instant ----
        Instant start = Instant.now();
        Thread.sleep(250);                       // simulate work
        Instant end = Instant.now();

        Duration elapsed = Duration.between(start, end);
        System.out.println("elapsed ms: " + elapsed.toMillis());   // ~250

        // ---- 2. Epoch conversion (what's actually stored) ----
        Instant now = Instant.now();
        System.out.println("epoch seconds: " + now.getEpochSecond());
        System.out.println("epoch millis:  " + now.toEpochMilli());   // what System.currentTimeMillis() gives

        // ---- 3. Arithmetic on instants ----
        Instant expiresAt = now.plusSeconds(3600);          // +1 hour
        Instant deadline = now.plus(Duration.ofDays(30));   // +30 days of elapsed time

        System.out.println(now.isBefore(expiresAt));        // true

        // ---- 4. Duration construction and math ----
        Duration timeout = Duration.ofSeconds(30);
        Duration retryWindow = timeout.multipliedBy(3);     // 90 seconds
        Duration remaining = retryWindow.minus(Duration.ofMinutes(1));  // 30s
        System.out.println(remaining.getSeconds());         // 30

        // ---- 5. Parsing ISO durations ----
        Duration fromText = Duration.parse("PT90S");        // ISO-8601: P[T]...
        System.out.println(fromText.toMinutes());           // 1
    }
}
```

### Walking Through Each Part

**Part 1 — measuring.** `Instant.now()` reads the system clock (UTC-based). `Duration.between(start, end)` is the gap. `toMillis()` gives it in milliseconds. Note `Instant.now()` has nanosecond precision when the platform clock supports it — use it instead of `System.currentTimeMillis()` when you need sub-millisecond measurement.

**Part 2 — epoch.** `getEpochSecond()` is the seconds since `1970-01-01T00:00:00Z`; `toEpochMilli()` is the millis version (the value `System.currentTimeMillis()` returns). Both are *pure numbers* — no formatting, no zones, trivially sortable and comparable.

**Part 3 — instant arithmetic.** `plusSeconds`/`minusSeconds` move along the timeline. `plus(Duration.ofDays(30))` adds 30 *elapsed* days (30 × 24h — **not** calendar months; there is no "month" for an instant). Use `Instant` arithmetic for TTLs, session expiry, cache lifetimes — all elapsed-time math.

**Part 4 — duration math.** Durations compose: `multipliedBy`, `minus`, `plus`. `getSeconds()` gives whole seconds; `toMillis()`, `toMinutes()`, `toHours()` convert. A negative duration means the end came before the start — check `isNegative()` where relevant.

**Part 5 — ISO-8601.** `Duration.parse("PT90S")` reads the standard text format: `P` = period, then `T` = time part, then components (`90S` seconds, `2H` hours, `5M` minutes). This is the format used in config files, APIs, and `@Scheduled`-adjacent settings, so knowing the pattern helps when reading foreign configs.

## Duration vs Period — The Boundary

| | `Duration` | `Period` |
|---|---|---|
| Measures | Elapsed time (seconds/nanos) | Calendar amounts (years/months/days) |
| Works with | `Instant`, `LocalTime`, `LocalDateTime`, `ZonedDateTime` | `LocalDate`, `LocalDateTime` |
| Example | `Duration.ofHours(8)` = exactly 8×3600s | `Period.ofMonths(1)` = "one calendar month" |
| DST-aware? | No — pure seconds | No, but month lengths vary |
| Typical use | Timeouts, TTLs, profiling, rate limits | Ages, subscriptions, "add 1 month" |

The trap: `Duration.between` on two `LocalDate`s throws — dates have no clock component. And `Period`-style "1 month" added to an `Instant` doesn't exist (a month isn't a fixed number of seconds).

## The Logging Rule

Log timestamps as instants in UTC:

```
2026-08-18T13:30:05.123Z  ERROR  order-service  ...
```

That `Z` suffix means UTC and makes every log line comparable across servers in different zones. If you log local wall-clock times per server, correlating an outage across three machines becomes guesswork.

## Common Beginner Pitfalls

1. **Storing wall-clock strings without a zone** — the moment is ambiguous. Store `Instant`/UTC.
2. **Using `Duration` for calendar math** — `Duration.ofDays(30)` from Jan 15 lands on Feb 14, not "same date next month"; that's `Period` territory.
3. **`Duration.between(LocalDate, LocalDate)`** — throws; use `ChronoUnit.DAYS.between`.
4. **Assuming `Instant` has a calendar** — `getDayOfMonth()` doesn't exist on `Instant`; convert via a zone first.
5. **Negative durations unexamined** — check `isNegative()` when order isn't guaranteed.
6. **Measuring with `System.currentTimeMillis()` twice** — fine, but `Instant.now()` gives you nanosecond granularity for free.

## Key Takeaways

- `Instant` = an unambiguous moment (seconds since epoch, UTC). Store it for all event timestamps.
- `Duration` = elapsed time; the difference between two instants.
- Instant arithmetic is pure timeline math — no calendars, no DST.
- `Duration` for seconds/timeouts; `Period` for calendar months/years.
- Convert instants to human zones only at the display boundary.
