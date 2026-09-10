---
title: Java Date & Time API — LocalDate, LocalDateTime, Instant, and DateTimeFormatter
summary: Why the old Date/Calendar API was replaced, the modern java.time package explained for beginners: LocalDate for dates, LocalDateTime for timestamps, Instant for epoch time, Duration/Period for calculations, DateTimeFormatter for parsing, and timezone handling with line-by-line walkthroughs.
order: 32
minutes: 28
topics: [localdate, localdatetime, instant, duration, period, datetimeformatter, timezone, epoch, java-time]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/time/package-summary.html
  - https://docs.oracle.com/javase/tutorial/datetime/iso/index.html
---

# Java Date & Time API — LocalDate, LocalDateTime, Instant, and DateTimeFormatter

## Why was the old Date/Calendar API replaced?

Java had `java.util.Date` and `java.util.Calendar` before Java 8. They were **mutating** (you could change a Date after creation), **not thread-safe**, and **confusing** (months start at 0, years start at 1900).

**Beginner mental model:** The old API was like a pencil — you could erase and change values, which caused bugs when multiple threads shared the same Date. The new `java.time` API (Java 8+) is like a pen — once created, values cannot change. This makes it thread-safe and predictable.


**What this code does — step by step:**

1. OLD WAY (don't use this!)
2. `Date oldDate = new Date();` — current time
3. `oldDate.setTime(0);` — mutable! someone can change it
4. `cal.get(Calendar.MONTH);` — returns 0 for January — confusing!
5. `cal.get(Calendar.YEAR) + 1900;` — years start at 1900 — who designed this?!
6. NEW WAY (use this!)
7. `LocalDate today = LocalDate.now();` — today's date, immutable
8. `LocalDateTime now = LocalDateTime.now();` — current date and time, immutable

The same code, clean:

```java
Date oldDate = new Date();
oldDate.setTime(0);

Calendar cal = Calendar.getInstance();
cal.get(Calendar.MONTH);
cal.get(Calendar.YEAR) + 1900;

LocalDate today = LocalDate.now();
LocalDateTime now = LocalDateTime.now();
```

## The three main types — when to use which

| Type | What it holds | Example | Use for |
|---|---|---|---|
| `LocalDate` | Date only (no time) | `2024-01-15` | Birthdays, holidays, deadlines |
| `LocalTime` | Time only (no date) | `14:30:00` | Store hours, meeting times |
| `LocalDateTime` | Date AND time | `2024-01-15T14:30:00` | Event timestamps, audit logs |
| `Instant` | UTC timestamp (epoch seconds) | `2024-01-15T14:30:00Z` | API calls, database storage |
| `ZonedDateTime` | Date/time WITH timezone | `2024-01-15T14:30:00+05:30[Asia/Kolkata]` | User-facing times in specific zones |

## LocalDate — working with dates


**What this code does — step by step:**

1. CREATE dates
2. `LocalDate today = LocalDate.now();` — today: 2024-01-15
3. `LocalDate christmas = LocalDate.of(2024, 12, 25);` — specific date
4. `LocalDate fromString = LocalDate.parse("2024-01-15");` — from ISO string (YYYY-MM-DD)
5. `LocalDate jan15 = LocalDate.of(2024, Month.JANUARY, 15);` — using Month enum
6. EXTRACT parts
7. `int year = today.getYear();` — 2024
8. `Month month = today.getMonth();` — Month.JANUARY
9. `int day = today.getDayOfMonth();` — 15
10. `DayOfWeek dow = today.getDayOfWeek();` — DayOfWeek.MONDAY
11. MODIFY dates (returns NEW object — original unchanged!)
12. `LocalDate tomorrow = today.plusDays(1);` — add 1 day
13. `LocalDate nextWeek = today.plusWeeks(1);` — add 1 week
14. `LocalDate nextMonth = today.plusMonths(1);` — add 1 month
15. `LocalDate lastYear = today.minusYears(1);` — subtract 1 year
16. `LocalDate adjusted = today.withDayOfMonth(1);` — set to 1st of month
17. COMPARE dates
18. `boolean isBefore = today.isBefore(christmas);` — true
19. `boolean isAfter = today.isAfter(christmas);` — false
20. `boolean isEqual = today.isEqual(today);` — true
21. CHECK date properties
22. `boolean isLeapYear = today.isLeapYear();` — 2024 is a leap year
23. `int dayOfYear = today.getDayOfYear();` — 15 (15th day of year)
24. `int lengthOfMonth = today.lengthOfMonth();` — 31 (January has 31 days)
25. `int lengthOfYear = today.lengthOfYear();` — 366 (leap year)
26. RANGE check

The same code, clean:

```java
LocalDate today = LocalDate.now();
LocalDate christmas = LocalDate.of(2024, 12, 25);
LocalDate fromString = LocalDate.parse("2024-01-15");
LocalDate jan15 = LocalDate.of(2024, Month.JANUARY, 15);

int year = today.getYear();
Month month = today.getMonth();
int day = today.getDayOfMonth();
DayOfWeek dow = today.getDayOfWeek();

LocalDate tomorrow = today.plusDays(1);
LocalDate nextWeek = today.plusWeeks(1);
LocalDate nextMonth = today.plusMonths(1);
LocalDate lastYear = today.minusYears(1);
LocalDate adjusted = today.withDayOfMonth(1);

boolean isBefore = today.isBefore(christmas);
boolean isAfter = today.isAfter(christmas);
boolean isEqual = today.isEqual(today);

boolean isLeapYear = today.isLeapYear();
int dayOfYear = today.getDayOfYear();
int lengthOfMonth = today.lengthOfMonth();
int lengthOfYear = today.lengthOfYear();

boolean inRange = today.isAfter(LocalDate.of(2024, 1, 1))
               && today.isBefore(LocalDate.of(2024, 12, 31));
```

## LocalDateTime — working with date AND time


**What this code does — step by step:**

1. CREATE timestamps
2. `LocalDateTime now = LocalDateTime.now();` — current date and time
3. `LocalDateTime meeting = LocalDateTime.of(2024, 1, 15, 14, 30);` — Jan 15, 2024 at 14:30
4. `LocalDateTime precise = LocalDateTime.of(2024, 1, 15, 14, 30, 45);` — with seconds
5. EXTRACT parts
6. `int hour = now.getHour();` — 14
7. `int minute = now.getMinute();` — 30
8. `int second = now.getSecond();` — 45
9. MODIFY
10. `LocalDateTime later = now.plusHours(2).plusMinutes(30);` — 2.5 hours from now
11. `LocalDateTime earlier = now.minusDays(7);` — 1 week ago
12. `LocalDateTime sameDay3pm = now.withHour(15).withMinute(0).withSecond(0);` — set to 3:00 PM today

The same code, clean:

```java
LocalDateTime now = LocalDateTime.now();
LocalDateTime meeting = LocalDateTime.of(2024, 1, 15, 14, 30);
LocalDateTime precise = LocalDateTime.of(2024, 1, 15, 14, 30, 45);
LocalDateTime fromString = LocalDateTime.parse("2024-01-15T14:30:00");

int hour = now.getHour();
int minute = now.getMinute();
int second = now.getSecond();

LocalDateTime later = now.plusHours(2).plusMinutes(30);
LocalDateTime earlier = now.minusDays(7);
LocalDateTime sameDay3pm = now.withHour(15).withMinute(0).withSecond(0);
```

## Instant — UTC timestamps for APIs and databases


**What this code does — step by step:**

1. Instant represents a point on the UTC timeline — ideal for API calls
2. `Instant now = Instant.now();` — 2024-01-15T14:30:00.123Z
3. `Instant epoch = Instant.ofEpochSecond(0);` — 1970-01-01T00:00:00Z (Unix epoch)
4. `Instant fromMillis = Instant.ofEpochMilli(1705329000000L);` — from epoch milliseconds
5. Convert between LocalDateTime and Instant
6. `Instant instant = local.atZone(ZoneId.systemDefault()).toInstant();` — local → instant
7. `LocalDateTime back = instant.atZone(ZoneId.of("UTC")).toLocalDateTime();` — instant → local
8. Duration between instants
9. ... do work ...

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Instant now = Instant.now();
        Instant epoch = Instant.ofEpochSecond(0);
        Instant fromMillis = Instant.ofEpochMilli(1705329000000L);

        LocalDateTime local = LocalDateTime.now();
        Instant instant = local.atZone(ZoneId.systemDefault()).toInstant();
        LocalDateTime back = instant.atZone(ZoneId.of("UTC")).toLocalDateTime();

        Instant start = Instant.now();
        Instant end = Instant.now();
        Duration elapsed = Duration.between(start, end);
        System.out.println("Took " + elapsed.toMillis() + "ms");
    }
}
```

## Duration and Period — measuring time


**What this code does — step by step:**

1. Duration: measures time in hours, minutes, seconds
2. `Duration twoHours = Duration.ofHours(2);` — PT2H
3. `Duration thirtyMinutes = Duration.ofMinutes(30);` — PT30M
4. `Duration fiveSeconds = Duration.ofSeconds(5);` — PT5S
5. `Duration fromString = Duration.parse("PT1H30M");` — 1 hour 30 minutes
6. Calculate duration between two times
7. `System.out.println("Work day: " + workDay.toHours() + " hours");` — 8 hours
8. Period: measures time in years, months, days (calendar-aware)
9. `Period twoYears = Period.ofYears(2);` — P2Y
10. `Period threeMonths = Period.ofMonths(3);` — P3M
11. `Period tenDays = Period.ofDays(10);` — P10D
12. `Period complex = Period.of(1, 6, 15);` — 1 year, 6 months, 15 days
13. Calculate period between two dates

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Duration twoHours = Duration.ofHours(2);
        Duration thirtyMinutes = Duration.ofMinutes(30);
        Duration fiveSeconds = Duration.ofSeconds(5);
        Duration fromString = Duration.parse("PT1H30M");

        LocalDateTime start = LocalDateTime.of(2024, 1, 15, 9, 0);
        LocalDateTime end = LocalDateTime.of(2024, 1, 15, 17, 30);
        Duration workDay = Duration.between(start, end);
        System.out.println("Work day: " + workDay.toHours() + " hours");

        Period twoYears = Period.ofYears(2);
        Period threeMonths = Period.ofMonths(3);
        Period tenDays = Period.ofDays(10);
        Period complex = Period.of(1, 6, 15);

        LocalDate birthday = LocalDate.of(1990, 5, 15);
        LocalDate today = LocalDate.now();
        Period age = Period.between(birthday, today);
        System.out.println("Age: " + age.getYears() + " years, " + age.getMonths() + " months");
    }
}
```

## DateTimeFormatter — parsing and formatting


**What this code does — step by step:**

1. Predefined formatters
2. `DateTimeFormatter isoDate = DateTimeFormatter.ISO_DATE;` — 2024-01-15
3. `DateTimeFormatter isoDateTime = DateTimeFormatter.ISO_LOCAL_DATE_TIME;` — 2024-01-15T14:30:00
4. Custom formatter
5. `String formatted = now.format(formatter);` — "15/01/2024 14:30"
6. Parse from string
7. Common patterns
8. `DateTimeFormatter usa = DateTimeFormatter.ofPattern("MM/dd/yyyy");` — "01/15/2024"
9. "January 15, 2024 at 2:30 PM"
10. With locale ( month names in different languages)
11. `String frenchDate = now.format(french);` — "15 janvier 2024"

The same code, clean:

```java
DateTimeFormatter isoDate = DateTimeFormatter.ISO_DATE;
DateTimeFormatter isoDateTime = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
LocalDateTime now = LocalDateTime.now();
String formatted = now.format(formatter);

LocalDateTime parsed = LocalDateTime.parse("15/01/2024 14:30", formatter);

DateTimeFormatter usa = DateTimeFormatter.ofPattern("MM/dd/yyyy");
DateTimeFormatter friendly = DateTimeFormatter.ofPattern("MMMM dd, yyyy 'at' h:mm a");

DateTimeFormatter french = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH);
String frenchDate = now.format(french);
```

## Timezone handling

// ZonedDateTime: date/time WITH timezone
ZonedDateTime tokyo = ZonedDateTime.now(ZoneId.of("Asia/Tokyo"));
ZonedDateTime ny = ZonedDateTime.now(ZoneId.of("America/New_York"));
ZonedDateTime london = ZonedDateTime.now(ZoneId.of("Europe/London"));

// Convert between timezones
ZonedDateTime tokyoMeeting = ZonedDateTime.of(
    LocalDateTime.of(2024, 1, 15, 9, 0),
    ZoneId.of("Asia/Tokyo")
);
ZonedDateTime nyEquivalent = tokyoMeeting.withZoneSameInstant(ZoneId.of("America/New_York"));
// "9:00 AM Tokyo" becomes "7:00 PM (previous day) New York"

// List all available timezones
ZoneId.getAvailableZoneIds().stream()
    .filter(id -> id.startsWith("America/"))
    .sorted()
    .forEach(System.out::println);

## How we use it in organizations

### Scenario 1: Scheduling system with timezone support


**What this code does — step by step:**

1. Convert organizer's proposed time to their timezone
2. Convert to attendee's timezone for display
3. Check if meeting is during business hours for attendee
4. Store in UTC (always UTC in database!)
5. `return organizerTime;` — return organizer's timezone version

The same code, clean:

```java
@Service
public class MeetingScheduler {

    public ZonedDateTime scheduleMeeting(String title, LocalDateTime proposedTime,
                                          String organizerTimezone, String attendeeTimezone) {
        ZonedDateTime organizerTime = proposedTime.atZone(ZoneId.of(organizerTimezone));

        ZonedDateTime attendeeTime = organizerTime.withZoneSameInstant(ZoneId.of(attendeeTimezone));

        int hour = attendeeTime.getHour();
        if (hour < 9 || hour > 17) {
            throw new BusinessHoursException(
                "Meeting would be at " + hour + ":00 for attendee — outside business hours");
        }

        Instant meetingInstant = organizerTime.toInstant();
        meetingRepository.save(new Meeting(title, meetingInstant));

        return organizerTime;
    }
}
```

### Scenario 2: Audit logging with precise timestamps


**What this code does — step by step:**

1. `private Instant timestamp;` — ALWAYS store as Instant (UTC) in the database
2. `this.timestamp = Instant.now();` — set creation time automatically
3. Querying time ranges
4. Find all actions in the last 24 hours
5. Usage

The same code, clean:

```java
@Entity
public class AuditLog {
    @Id
    private Long id;

    private String action;
    private String userId;

    @Column(columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private Instant timestamp;

    @PrePersist
    public void prePersist() {
        this.timestamp = Instant.now();
    }
}

public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByTimestampBetween(Instant start, Instant end);

    @Query("SELECT a FROM AuditLog a WHERE a.timestamp > :since")
    List<AuditLog> findRecent(@Param("since") Instant since);
}

Instant twentyFourHoursAgo = Instant.now().minus(Duration.ofHours(24));
List<AuditLog> recent = auditLogRepository.findRecent(twentyFourHoursAgo);
```

### Scenario 3: Business day calculator


**What this code does — step by step:**

1. Add N business days to a date (skip weekends and holidays)
2. `current = current.plusDays(1);` — move to next day
3. `added++;` — count business days only
4. `return day != DayOfWeek.SATURDAY` — not Saturday
5. `&& day != DayOfWeek.SUNDAY` — not Sunday
6. `&& !holidays.contains(date);` — not a holiday
7. Calculate duration in business hours
8. `LocalDateTime dayStart = current.atTime(LocalTime.of(9, 0));` — 9 AM
9. `LocalDateTime dayEnd = current.atTime(LocalTime.of(17, 0));` — 5 PM
10. Clamp to actual start/end times

The same code, clean:

```java
public class BusinessDayCalculator {

    private final Set<LocalDate> holidays;

    public BusinessDayCalculator(Set<LocalDate> holidays) {
        this.holidays = holidays;
    }

    public LocalDate addBusinessDays(LocalDate startDate, int daysToAdd) {
        LocalDate current = startDate;
        int added = 0;

        while (added < daysToAdd) {
            current = current.plusDays(1);
            if (isBusinessDay(current)) {
                added++;
            }
        }
        return current;
    }

    private boolean isBusinessDay(LocalDate date) {
        DayOfWeek day = date.getDayOfWeek();
        return day != DayOfWeek.SATURDAY
            && day != DayOfWeek.SUNDAY
            && !holidays.contains(date);
    }

    public Duration businessHoursBetween(LocalDateTime start, LocalDateTime end) {
        Duration total = Duration.ZERO;
        LocalDate current = start.toLocalDate();

        while (current.isBefore(end.toLocalDate()) || current.isEqual(end.toLocalDate())) {
            if (isBusinessDay(current)) {
                LocalDateTime dayStart = current.atTime(LocalTime.of(9, 0));
                LocalDateTime dayEnd = current.atTime(LocalTime.of(17, 0));

                LocalDateTime effectiveStart = start.isAfter(dayStart) ? start : dayStart;
                LocalDateTime effectiveEnd = end.isBefore(dayEnd) ? end : dayEnd;

                if (effectiveStart.isBefore(effectiveEnd)) {
                    total = total.plus(Duration.between(effectiveStart, effectiveEnd));
                }
            }
            current = current.plusDays(1);
        }
        return total;
    }
}
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using `java.util.Date` or `Calendar` | Mutable, not thread-safe, confusing APIs | Use `java.time` instead |
| Storing times without timezone | Ambiguous — which timezone? | Store as `Instant` (UTC) |
| Comparing LocalDateTime across timezones | Wrong comparison — different zones = different times | Convert to Instant first |
| Using `Period` for precise time differences | Period doesn't account for DST changes | Use `Duration` for precise time |
| Formatting without specifying Locale | Month names in wrong language | Always specify `Locale` in formatters |
| Parsing dates without DateTimeFormatter | Relying on default format — breaks across JVMs | Always use explicit formatters |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
