---
title: java.time — The Modern Date & Time API
module: java-time-api
order: 1
minutes: 25
topics: ["java.time", "LocalDate", "LocalTime", "Instant", "design principles"]
docs:
  - title: "java.time package summary"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/package-summary.html"
summary: Dates look simple — "August 18, 2026, 3:30 PM." But that innocent sentence hides three separate questions:
---

# java.time — The Modern Date & Time API

## The Concept: Why Date and Time Is a Hard Problem

Dates look simple — "August 18, 2026, 3:30 PM." But that innocent sentence hides three separate questions:

1. **What's the calendar date?** — August 18, 2026 (the *civil* date).
2. **What's the time of day?** — 3:30 PM (15:30).
3. **Where on Earth is it 3:30?** — that's the *time zone*. When it's 3:30 PM in New York, it's 9:30 PM in Berlin and 4:30 AM the *next day* in Tokyo.

Mix those three up and you get the classic bugs: flights departing at the wrong hour, birthday emails sent a day early, logs timestamped inconsistently. Java's old `Date`/`Calendar` made this worse by lumping everything into one mutable, confusing class (`Date` actually represents an *instant*, not a "date" in the everyday sense, and its `getYear()` returned 1900-offset values that confused generations of developers).

**`java.time`** (Java 8, based on the Joda-Time design by Stephen Colebourne) fixed this by splitting the problem into **precise, dedicated types** — each models exactly one concept and nothing else:

| Type | Models | Example |
|---|---|---|
| `LocalDate` | A calendar date, no time, no zone | 2026-08-18 |
| `LocalTime` | Time of day, no date, no zone | 15:30:00 |
| `LocalDateTime` | Date + time, no zone | 2026-08-18T15:30 |
| `Instant` | A moment on the timeline (UTC) | 2026-08-18T13:30:00Z |
| `ZonedDateTime` | Date + time + zone | 2026-08-18T15:30+02:00[Europe/Berlin] |
| `OffsetDateTime` | Date + time + fixed offset | 2026-08-18T15:30+02:00 |
| `Duration` | Amount of *time* (seconds/nanos) | 2h 5m |
| `Period` | Amount of *calendar* time (years/months/days) | 1 year 3 months |

The core principle: **never mix types that answer different questions.** A `LocalDate` has no notion of time zones — it literally cannot be wrong about them. That's the design win: the type system prevents whole categories of bugs.

## The Code Walkthrough

```java
import java.time.*;
import java.time.format.DateTimeFormatter;

public class TimeApiOverview {

    public static void main(String[] args) {
        // 1. The three "now" concepts — deliberately different
        LocalDate today     = LocalDate.now();            // your machine's date
        LocalTime nowTime   = LocalTime.now();            // your machine's time
        Instant nowInstant  = Instant.now();              // the true moment, UTC

        System.out.println(today);       // 2026-08-18
        System.out.println(nowTime);     // 13:30:00.123456
        System.out.println(nowInstant);  // 2026-08-18T13:30:00.123456Z   (Z = UTC)

        // 2. Construct values explicitly (the "of" factories)
        LocalDate courseEnds = LocalDate.of(2026, 12, 15);
        LocalTime lectureAt  = LocalTime.of(14, 30);
        LocalDateTime start  = LocalDateTime.of(2026, 8, 18, 14, 30);

        // 3. Immutable arithmetic — every method returns a NEW object
        LocalDate nextWeek = courseEnds.plusWeeks(1);
        LocalDate twoMonthsAgo = courseEnds.minusMonths(2);
        System.out.println(courseEnds);   // 2026-12-15  (unchanged!)
        System.out.println(nextWeek);     // 2026-12-22

        // 4. Compare and query
        System.out.println(courseEnds.isAfter(today));   // true
        System.out.println(courseEnds.getDayOfWeek());   // TUESDAY
        System.out.println(courseEnds.lengthOfMonth());  // 31

        // 5. Convert between concepts (where it's meaningful)
        LocalDate date = nowInstant.atZone(ZoneId.of("Asia/Kolkata")).toLocalDate();
        System.out.println(date);         // the calendar date in Kolkata right now

        // 6. Format
        System.out.println(DateTimeFormatter.ofPattern("dd MMM yyyy").format(courseEnds));
        // 15 Dec 2026
    }
}
```

### Walking Through Each Part

**Part 1 — three "now"s.** `LocalDate.now()` and `LocalTime.now()` use the **JVM's default time zone** — they tell you what the *calendar* looks like where the machine is. `Instant.now()` is different: it's the physical moment, expressed in UTC, independent of where the machine sits. If a server in Virginia and a phone in Delhi call `Instant.now()` at the same moment, they get the **same value** — which is why `Instant` is the right thing to store and transmit timestamps.

**Part 2 — the `of` factories.** `LocalDate.of(y, m, d)` — note month is 1-based here (12 = December), unlike the old `Calendar`'s 0-based months (the single most common old-API bug). Invalid values throw `DateTimeException` (`LocalDate.of(2026, 13, 1)` is rejected) — the API refuses nonsense rather than silently rolling over.

**Part 3 — immutability.** `plusWeeks`, `minusMonths` and all arithmetic **return new objects**; the original is untouched (like `String`). This makes the types safe to share across threads and impossible to corrupt mid-computation. If you don't assign the result, you discard it — `courseEnds.plusWeeks(1);` alone does nothing.

**Part 4 — comparisons.** `isAfter`/`isBefore`/`isEqual` compare chronologically. `getDayOfWeek()` returns an `enum` (`TUESDAY`) — no magic ints. `lengthOfMonth()` even handles leap years correctly (February 2024 → 29).

**Part 5 — conversions.** An `Instant` (moment) can be placed into a zone to get a civil date-time: `atZone(zone)` → `ZonedDateTime`, then `.toLocalDate()` extracts the date part. This is the only *correct* way to get "what date is it right now in Kolkata" from an instant.

**Part 6 — formatting.** `DateTimeFormatter.ofPattern(...)` produces human-readable strings. Patterns use letters: `dd` day, `MM` month, `yyyy` year, `HH` hour 24h, `hh` hour 12h, `mm` minute, `ss` second, `a` AM/PM.

## The Decision Table (Most Common Question)

**"Which type should I store?"**

| What you're modeling | Type to use |
|---|---|
| A moment in time (log timestamps, event times, "when did this happen") | `Instant` (store in UTC) |
| A birthday / holiday / expiry date ("date only, no time") | `LocalDate` |
| A recurring alarm / shop opening time ("time of day only") | `LocalTime` |
| A scheduled meeting with a real zone ("3 PM Berlin time") | `ZonedDateTime` |
| Business hours in a fixed offset ("09:00 UTC+2, DST irrelevant") | `OffsetDateTime` |
| A deadline on a calendar regardless of zone | `LocalDateTime` (with caution) |

The two dangerous ones: `LocalDateTime` and `ZonedDateTime` misuse. `LocalDateTime` has *no zone* — storing "2026-08-18T15:30" doesn't say where; if you later display it to users in different zones you're guessing. `ZonedDateTime` *has* a zone but applies DST rules — a time that doesn't exist (2:30 AM on a spring-forward day) gets adjusted automatically.

## Key Takeaways

- Date/time is three separate concepts: calendar date, clock time, and zone. `java.time` gives each its own type.
- Types are immutable and refuse invalid values.
- `Instant` = the true moment (UTC) — use it for storage and logs.
- `LocalDate`/`LocalTime`/`LocalDateTime` have no zone; `ZonedDateTime`/`OffsetDateTime` do.
- `Duration` = elapsed seconds; `Period` = calendar years/months/days.
- Never store "3:30 PM" without knowing *where* — that's where the bugs live.
