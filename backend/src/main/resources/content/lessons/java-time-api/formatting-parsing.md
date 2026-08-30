---
title: Formatting and Parsing Dates
module: java-time-api
order: 5
minutes: 24
topics: ["DateTimeFormatter", "ISO-8601", "parsing", "patterns", "locales"]
docs:
  - title: "DateTimeFormatter (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/format/DateTimeFormatter.html"
summary: Data crosses system boundaries as text: a JSON field, a CSV column, a log line, a query parameter. Converting a LocalDate to text is formatting; co...
---

# Formatting and Parsing Dates

## The Concept: Text ⇄ Time, Safely

Data crosses system boundaries as **text**: a JSON field, a CSV column, a log line, a query parameter. Converting a `LocalDate` to text is **formatting**; converting text back to a `LocalDate` is **parsing**. Both are deceptively simple and both are where date bugs cluster — because text dates have *ambiguity* problems that binary data never has.

The three classic text-date problems:

1. **"01/02/2026" — January 2nd or February 1st?** Day/month order varies by region. The fix: ISO-8601 (`2026-08-18`), which is unambiguous and sortable as text.
2. **Mismatched patterns** — a date written with `dd/MM/yyyy` (day-first) read back with `MM/dd/yyyy` (month-first) silently swaps day and month, producing wrong-but-valid dates. There is no error; the bug is invisible.
3. **Locale surprises** — "Aug" is English, "Ago" is Spanish, "Août" is French. Month names and day names are locale-dependent.

`java.time` answers with `DateTimeFormatter`: a **pattern compiler** that both formats and parses, with strict validation (it rejects invalid dates like Feb 30) and full locale support.

## The Two Formatter Styles

**1. Pattern style** (familiar, letter-based):

| Letters | Meaning | Example output |
|---|---|---|
| `yyyy` | 4-digit year | 2026 |
| `yy` | 2-digit year | 26 |
| `MM` | 2-digit month | 08 |
| `MMM` | Abbreviated month | Aug |
| `MMMM` | Full month | August |
| `dd` | 2-digit day | 18 |
| `HH` | Hour 0–23 | 14 |
| `hh` | Hour 1–12 | 02 |
| `mm` | Minute | 30 |
| `ss` | Second | 05 |
| `a` | AM/PM | PM |
| `XXX` | Offset (+05:30 / Z) | +05:30 |

**2. Predefined ISO style** — `DateTimeFormatter.ISO_LOCAL_DATE` (`2026-08-18`), `ISO_INSTANT` (`2026-08-18T13:30:05Z`), `ISO_DATE_TIME`. These are the standard exchange formats; use them for APIs and storage unless you have a reason not to.

## The Code Walkthrough

```java
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Locale;

public class FormattingDemo {

    public static void main(String[] args) {
        // ---- 1. Formatting: date -> text ----
        LocalDate release = LocalDate.of(2026, 8, 18);

        DateTimeFormatter iso = DateTimeFormatter.ISO_LOCAL_DATE;
        DateTimeFormatter pretty = DateTimeFormatter.ofPattern("dd MMM yyyy");
        DateTimeFormatter verbose = DateTimeFormatter.ofPattern("EEEE, MMMM d, yyyy", Locale.US);

        System.out.println(iso.format(release));         // 2026-08-18
        System.out.println(pretty.format(release));      // 18 Aug 2026
        System.out.println(verbose.format(release));     // Tuesday, August 18, 2026

        // ---- 2. Parsing: text -> date (the dangerous direction) ----
        LocalDate fromIso = LocalDate.parse("2026-08-18");               // ISO by default
        LocalDate fromCustom = LocalDate.parse("18/08/2026",
                DateTimeFormatter.ofPattern("dd/MM/yyyy"));

        System.out.println(fromIso.equals(release));     // true
        System.out.println(fromCustom.equals(release));  // true

        // ---- 3. Invalid input is rejected, not silently "adjusted" ----
        try {
            LocalDate.parse("2026-02-30");               // February 30th doesn't exist
        } catch (DateTimeParseException e) {
            System.out.println("Rejected: " + e.getMessage());
        }

        // ---- 4. The classic silent bug: pattern mismatch ----
        // Written day-first, read month-first:
        DateTimeFormatter written = DateTimeFormatter.ofPattern("dd/MM/yyyy");
        DateTimeFormatter misread = DateTimeFormatter.ofPattern("MM/dd/yyyy");

        String text = written.format(LocalDate.of(2026, 8, 18));   // "18/08/2026"
        LocalDate wrong = LocalDate.parse(text, misread);
        System.out.println("Written as " + text + " but read as " + wrong);
        // 2026-18-08 doesn't exist... actually this THROWS, which is the lucky case.
        // With "01/02/2026" both patterns succeed and swap day/month silently.

        // ---- 5. Locale-aware month names ----
        DateTimeFormatter espanol = DateTimeFormatter.ofPattern("dd MMMM yyyy", Locale.of("es"));
        System.out.println(espanol.format(release));     // 18 agosto 2026
    }
}
```

### Walking Through Each Part

**Part 1 — formatting.** Three patterns, three styles. `ISO_LOCAL_DATE` is the exchange format — machine-readable, unambiguous, sortable. `"dd MMM yyyy"` is a compact human style. `"EEEE, MMMM d, yyyy"` adds the weekday (`EEEE`) and full month — note the `Locale.US` argument, because "Tuesday" is English; the same pattern with `Locale.FRANCE` prints "mardi".

**Part 2 — parsing.** `LocalDate.parse("2026-08-18")` uses ISO by default — no formatter needed for the standard format. Custom patterns require a matching `DateTimeFormatter`. Parse with the **same pattern** that produced the text.

**Part 3 — strictness.** `2026-02-30` throws `DateTimeParseException`. `java.time` refuses impossible dates instead of rolling over (old `SimpleDateFormat` was lenient by default and silently produced March 2 — the exact bug that corrupts data). Always catch `DateTimeParseException` when parsing external input.

**Part 4 — the mismatch trap.** This is the important one. If text was *written* with `dd/MM/yyyy` and *read* with `MM/dd/yyyy`:

- `"18/08/2026"` read as month-first: month 18 doesn't exist → throws (you get lucky; an error surfaces).
- `"01/02/2026"` read as month-first → February 1st, but it meant January 2nd → **silent data corruption** (both patterns succeed).

There is no way to detect this by looking at the text — which is why the rule is: **standardize on one pattern across the whole system** (ISO-8601) and never hand-roll date text in APIs.

**Part 5 — locale.** `Locale.of("es")` gives Spanish month names: `18 agosto 2026`. Formats for human display should always take a `Locale`; formats for exchange should be ISO.

## Formatting and Parsing Zoned / Instant Values

```java
// Instant <-> text with 'Z' suffix (ISO-8601 UTC)
Instant moment = Instant.parse("2026-08-18T13:30:05Z");           // parsing
String text = DateTimeFormatter.ISO_INSTANT.format(moment);       // "2026-08-18T13:30:05Z"

// ZonedDateTime with offset — the wire format for "a moment in a zone"
ZonedDateTime zdt = moment.atZone(ZoneId.of("Asia/Kolkata"));
String zText = DateTimeFormatter.ISO_ZONED_DATE_TIME.format(zdt);
// 2026-08-18T19:00:05+05:30[Asia/Kolkata]

// OffsetDateTime — for APIs where zone rules don't travel
OffsetDateTime odt = zdt.toOffsetDateTime();
// 2026-08-18T19:00:05+05:30
```

The API-level practice: send **`OffsetDateTime`** (ISO-8601 with offset) in JSON so the receiver knows the exact moment even without the IANA database; use `ZonedDateTime` only when the region rules themselves matter.

## Thread Safety Note

`DateTimeFormatter` is **immutable and thread-safe** — one instance can be shared as a `static final` field across all threads, unlike the old `SimpleDateFormat` (which was famously unsafe to share and caused corrupted output in multi-threaded code). Make your formatters `static final` constants:

```java
public static final DateTimeFormatter API_DATE = DateTimeFormatter.ISO_LOCAL_DATE;
```

## Common Beginner Pitfalls

1. **Pattern mismatch between writer and reader** — silently swaps day/month. Standardize on ISO-8601.
2. **Lenient parsing expectations** — `java.time` rejects `2026-02-30`; catch `DateTimeParseException`.
3. **Sharing `SimpleDateFormat` across threads** — use `DateTimeFormatter` (thread-safe) instead.
4. **No `Locale` for human formats** — month/day names depend on locale; pass it.
5. **2-digit years (`yy`)** — `"26"` could be 1926 or 2026; `java.time` resolves with a pivot rule, but 4-digit years remove the guess.
6. **Custom patterns for exchange formats** — use `ISO_*` constants; don't reinvent `2026-08-18T13:30:05Z` by hand.

## Key Takeaways

- Formatting = date → text; parsing = text → date; always with a matching pattern.
- ISO-8601 (`ISO_LOCAL_DATE`, `ISO_INSTANT`) is the unambiguous exchange standard.
- Parsing is strict: invalid dates throw instead of silently adjusting.
- Pattern mismatch causes silent day/month swaps — standardize, don't improvise.
- `DateTimeFormatter` is immutable and thread-safe; make it `static final`.
- Pass a `Locale` for any human-facing month/day names.
