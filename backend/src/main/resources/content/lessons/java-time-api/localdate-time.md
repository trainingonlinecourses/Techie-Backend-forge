---
title: LocalDate and LocalTime — Calendar Dates and Clock Times
module: java-time-api
order: 2
minutes: 24
topics: ["LocalDate", "LocalTime", "calendar arithmetic", "Period", "Duration", "TemporalAdjusters"]
summary: The word local in LocalDate/LocalTime is the whole story: these types describe a date or time as written on a calendar or clock, with no time zone ...
docs:
  - title: "LocalDate (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/LocalDate.html"
---

# LocalDate and LocalTime — Calendar Dates and Clock Times

## The Concept: "Local" Means No Zone

The word **local** in `LocalDate`/`LocalTime` is the whole story: these types describe a date or time *as written on a calendar or clock*, with **no time zone attached**. "August 18" is a calendar fact — it doesn't become "August 17" when you cross the International Date Line, because it has no zone to convert. Same for "3:30 PM": it's a clock reading, nothing more.

That limitation is actually the superpower. Because there's no zone, these types are:

- **Predictable** — arithmetic is pure calendar math (`plusDays(1)` always means tomorrow).
- **Immutable and thread-safe** — no internal state to corrupt.
- **The right model for** birthdays, holidays, expiry dates, opening hours, deadlines — anything where "the calendar says so" is the truth.

What they *can't* do: represent a real moment. "August 18 at 3:30 PM" is not a moment until you say *where*. That's `ZonedDateTime`'s job (next lessons).

## Calendar Arithmetic vs Elapsed Time — Two Different "Durations"

This is the subtle idea. Consider: "the event is 1 month away."

- If today is **March 31** and you add 1 month, is the result April 30 or May 1? March has 31 days, April has 30 — "1 month" is ambiguous in *elapsed time* terms. A **`Period`** (calendar duration: years, months, days) resolves it by calendar rules: `March 31 + P1M = April 30` (clamped to month end).
- **`Duration`** is pure elapsed time (seconds/nanos): "90 minutes from now" is always 5,400 seconds, no calendar involved.

Rule: **`Period` for calendar amounts (months, years, days), `Duration` for clock amounts (hours, minutes, seconds).** Use the wrong one and DST/leap-year surprises await.

## The Code Walkthrough

```java
import java.time.*;
import java.time.temporal.TemporalAdjusters;

public class LocalDateTimeDemo {

    public static void main(String[] args) {
        // ---- 1. Creating LocalDate / LocalTime ----
        LocalDate today = LocalDate.now();
        LocalDate release = LocalDate.of(2026, 8, 18);
        LocalTime alarm = LocalTime.of(6, 30);           // 06:30
        LocalTime now = LocalTime.now();

        System.out.println(today.isLeapYear());          // false for 2026
        System.out.println(release.getDayOfYear());      // 230 (day number in year)

        // ---- 2. Calendar arithmetic with Period ----
        LocalDate nextMonth = today.plus(Period.ofMonths(1));
        LocalDate lastDay = today.with(TemporalAdjusters.lastDayOfMonth());
        LocalDate nextFriday = today.with(TemporalAdjusters.next(DayOfWeek.FRIDAY));

        System.out.println("next month: " + nextMonth);
        System.out.println("last day of month: " + lastDay);
        System.out.println("next Friday: " + nextFriday);

        // ---- 3. Elapsed time with Duration ----
        LocalTime start = LocalTime.of(9, 0);
        LocalTime end = LocalTime.of(17, 30);
        Duration workday = Duration.between(start, end);
        System.out.println("workday minutes: " + workday.toMinutes());   // 510

        // ---- 4. How many days between two dates? ----
        LocalDate courseStart = LocalDate.of(2026, 1, 5);
        long days = ChronoUnit.DAYS.between(courseStart, today);
        System.out.println("days since course start: " + days);

        // ---- 5. Combining date + time ----
        LocalDateTime meeting = LocalDateTime.of(release, alarm);
        System.out.println(meeting);                     // 2026-08-18T06:30
    }
}
```

### Walking Through Each Part

**Part 1 — construction and queries.** `LocalDate.now()` reads the system clock *in the JVM's default zone* and extracts the date. `of(...)` builds exact values. `isLeapYear()` handles leap rules; `getDayOfYear()` counts from Jan 1 (Jan 1 = 1). Note again: months are 1-based in the `of` call — `LocalDate.of(2026, 8, 18)` is August, not September (the old `Calendar` used 0-based months and 1900-based years; `java.time` fixed both).

**Part 2 — calendar math.** `plus(Period.ofMonths(1))` adds a *calendar* month (clamping at month ends). `with(TemporalAdjusters.lastDayOfMonth())` returns the last day of the current month — leap-year-aware. `with(TemporalAdjusters.next(FRIDAY))` gives the *next* Friday strictly after today. `TemporalAdjusters` is the toolbox for "next business day", "first Monday of month", etc.

**Part 3 — `Duration.between`.** `LocalTime.of(9,0)` to `LocalTime.of(17,30)` — `between` measures elapsed time (8.5 hours = 510 minutes). If `end` is before `start` (night shift: 22:00 → 06:00), the duration is *negative*; use `Duration.between(start, end).plusDays(1)` style logic or `LocalTime` is simply the wrong type (a `LocalDateTime`/`ZonedDateTime` pair handles overnight correctly).

**Part 4 — `ChronoUnit.DAYS.between`.** The cleanest "days between two dates" — used for age, tenure, subscription days, streak counters. `ChronoUnit` also offers `MONTHS`, `YEARS`, `WEEKS`, `HOURS`, and so on. Note: "days between" is calendar-based (excludes the start, includes the end boundary) — Jan 5 → Jan 6 is 1 day.

**Part 5 — combining.** `LocalDateTime.of(date, time)` merges them into one value — the type you use for "a date and a time, but I'm not assigning a zone."

## TemporalAdjusters — The Useful Ones

| Adjuster | Meaning |
|---|---|
| `firstDayOfMonth()` / `lastDayOfMonth()` | Month boundaries |
| `firstDayOfNextMonth()` | First day of next month |
| `next(DayOfWeek.X)` | Next X (strictly after today) |
| `previous(DayOfWeek.X)` | Previous X (strictly before today) |
| `nextOrSame(DayOfWeek.X)` | Next X, or today if it is X |
| `dayOfWeekInMonth(n, X)` | The n-th X of the month (e.g., 3rd Friday) |
| `firstInMonth(DayOfWeek.X)` | First X of the month |

## Comparing and Sorting

`LocalDate` and `LocalTime` implement `Comparable`, so:

```java
List<LocalDate> dates = List.of(LocalDate.of(2026, 1, 1), LocalDate.of(2025, 12, 31));
dates.stream().sorted().toList();   // sorts chronologically
```

`isBefore`, `isAfter`, `isEqual` give boolean comparisons; `compareTo` gives ordering for sorters and streams.

## Common Beginner Pitfalls

1. **Using `LocalDateTime` when you mean a moment** — no zone = can't be a moment. Use `Instant`/`ZonedDateTime` for events.
2. **`Period` vs `Duration` mix-ups** — "1 month" is `Period`, "90 minutes" is `Duration`. `Duration.between` on `LocalDate`s throws (`UnsupportedTemporalTypeException`) — dates have no time component to measure.
3. **Ignoring return values** — `today.plusDays(1)` returns a new object; without assignment nothing changes.
4. **`LocalTime` arithmetic wrapping** — `LocalTime.of(23, 0).plusHours(2)` gives `01:00` (wraps) without telling you the date changed. For overnight spans use `LocalDateTime`.
5. **Default zone dependence** — `LocalDate.now()` depends on the machine's zone; in tests, pass an explicit `Clock` so results are deterministic.

## Key Takeaways

- "Local" = calendar/clock values with no time zone — predictable and safe.
- `Period` = calendar amounts (months/years/days); `Duration` = elapsed seconds.
- `TemporalAdjusters` covers next-day, month-end, nth-weekday logic.
- `ChronoUnit.DAYS.between(a, b)` is the standard "days between" idiom.
- Combine with `LocalDateTime.of(date, time)` when you need both but no zone.
