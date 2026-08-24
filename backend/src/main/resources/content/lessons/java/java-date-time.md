---
title: Java Date & Time API — LocalDate, LocalDateTime, Instant, and DateTimeFormatter
summary: Why the old Date/Calendar API was replaced, the modern java.time package explained for beginners: LocalDate for dates, LocalDateTime for timestamps, Instant for epoch time, Duration/Period for calculations, DateTimeFormatter for parsing, and timezone handling with line-by-line walkthroughs.
order: 10
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

```java
// OLD WAY (don't use this!)
Date oldDate = new Date();               // current time
oldDate.setTime(0);                      // mutable! someone can change it

Calendar cal = Calendar.getInstance();
cal.get(Calendar.MONTH);                 // returns 0 for January — confusing!
cal.get(Calendar.YEAR) + 1900;           // years start at 1900 — who designed this?!

// NEW WAY (use this!)
LocalDate today = LocalDate.now();       // today's date, immutable
LocalDateTime now = LocalDateTime.now(); // current date and time, immutable
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

```java
// CREATE dates
LocalDate today = LocalDate.now();                          // today: 2024-01-15
LocalDate christmas = LocalDate.of(2024, 12, 25);           // specific date
LocalDate fromString = LocalDate.parse("2024-01-15");       // from ISO string (YYYY-MM-DD)
LocalDate jan15 = LocalDate.of(2024, Month.JANUARY, 15);    // using Month enum

// EXTRACT parts
int year = today.getYear();            // 2024
Month month = today.getMonth();        // Month.JANUARY
int day = today.getDayOfMonth();       // 15
DayOfWeek dow = today.getDayOfWeek();  // DayOfWeek.MONDAY

// MODIFY dates (returns NEW object — original unchanged!)
LocalDate tomorrow = today.plusDays(1);            // add 1 day
LocalDate nextWeek = today.plusWeeks(1);           // add 1 week
LocalDate nextMonth = today.plusMonths(1);         // add 1 month
LocalDate lastYear = today.minusYears(1);          // subtract 1 year
LocalDate adjusted = today.withDayOfMonth(1);      // set to 1st of month

// COMPARE dates
boolean isBefore = today.isBefore(christmas);       // true
boolean isAfter = today.isAfter(christmas);         // false
boolean isEqual = today.isEqual(today);             // true

// CHECK date properties
boolean isLeapYear = today.isLeapYear();            // 2024 is a leap year
int dayOfYear = today.getDayOfYear();               // 15 (15th day of year)
int lengthOfMonth = today.lengthOfMonth();          // 31 (January has 31 days)
int lengthOfYear = today.lengthOfYear();            // 366 (leap year)

// RANGE check
boolean inRange = today.isAfter(LocalDate.of(2024, 1, 1))
               && today.isBefore(LocalDate.of(2024, 12, 31));
```

## LocalDateTime — working with date AND time

```java
// CREATE timestamps
LocalDateTime now = LocalDateTime.now();                              // current date and time
LocalDateTime meeting = LocalDateTime.of(2024, 1, 15, 14, 30);       // Jan 15, 2024 at 14:30
LocalDateTime precise = LocalDateTime.of(2024, 1, 15, 14, 30, 45);   // with seconds
LocalDateTime fromString = LocalDateTime.parse("2024-01-15T14:30:00");

// EXTRACT parts
int hour = now.getHour();          // 14
int minute = now.getMinute();      // 30
int second = now.getSecond();      // 45

// MODIFY
LocalDateTime later = now.plusHours(2).plusMinutes(30);    // 2.5 hours from now
LocalDateTime earlier = now.minusDays(7);                   // 1 week ago
LocalDateTime sameDay3pm = now.withHour(15).withMinute(0).withSecond(0);  // set to 3:00 PM today
```

## Instant — UTC timestamps for APIs and databases

```java
// Instant represents a point on the UTC timeline — ideal for API calls
Instant now = Instant.now();                           // 2024-01-15T14:30:00.123Z
Instant epoch = Instant.ofEpochSecond(0);              // 1970-01-01T00:00:00Z (Unix epoch)
Instant fromMillis = Instant.ofEpochMilli(1705329000000L);  // from epoch milliseconds

// Convert between LocalDateTime and Instant
LocalDateTime local = LocalDateTime.now();
Instant instant = local.atZone(ZoneId.systemDefault()).toInstant();  // local → instant
LocalDateTime back = instant.atZone(ZoneId.of("UTC")).toLocalDateTime();  // instant → local

// Duration between instants
Instant start = Instant.now();
// ... do work ...
Instant end = Instant.now();
Duration elapsed = Duration.between(start, end);
System.out.println("Took " + elapsed.toMillis() + "ms");
```

## Duration and Period — measuring time

```java
// Duration: measures time in hours, minutes, seconds
Duration twoHours = Duration.ofHours(2);                          // PT2H
Duration thirtyMinutes = Duration.ofMinutes(30);                  // PT30M
Duration fiveSeconds = Duration.ofSeconds(5);                     // PT5S
Duration fromString = Duration.parse("PT1H30M");                  // 1 hour 30 minutes

// Calculate duration between two times
LocalDateTime start = LocalDateTime.of(2024, 1, 15, 9, 0);
LocalDateTime end = LocalDateTime.of(2024, 1, 15, 17, 30);
Duration workDay = Duration.between(start, end);
System.out.println("Work day: " + workDay.toHours() + " hours");  // 8 hours

// Period: measures time in years, months, days (calendar-aware)
Period twoYears = Period.ofYears(2);                              // P2Y
Period threeMonths = Period.ofMonths(3);                          // P3M
Period tenDays = Period.ofDays(10);                               // P10D
Period complex = Period.of(1, 6, 15);                             // 1 year, 6 months, 15 days

// Calculate period between two dates
LocalDate birthday = LocalDate.of(1990, 5, 15);
LocalDate today = LocalDate.now();
Period age = Period.between(birthday, today);
System.out.println("Age: " + age.getYears() + " years, " + age.getMonths() + " months");
```

## DateTimeFormatter — parsing and formatting

```java
// Predefined formatters
DateTimeFormatter isoDate = DateTimeFormatter.ISO_DATE;         // 2024-01-15
DateTimeFormatter isoDateTime = DateTimeFormatter.ISO_LOCAL_DATE_TIME;  // 2024-01-15T14:30:00

// Custom formatter
DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
LocalDateTime now = LocalDateTime.now();
String formatted = now.format(formatter);           // "15/01/2024 14:30"

// Parse from string
LocalDateTime parsed = LocalDateTime.parse("15/01/2024 14:30", formatter);

// Common patterns
DateTimeFormatter usa = DateTimeFormatter.ofPattern("MM/dd/yyyy");     // "01/15/2024"
DateTimeFormatter friendly = DateTimeFormatter.ofPattern("MMMM dd, yyyy 'at' h:mm a");
// "January 15, 2024 at 2:30 PM"

// With locale ( month names in different languages)
DateTimeFormatter french = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.FRENCH);
String frenchDate = now.format(french);            // "15 janvier 2024"
```

## Timezone handling

```java
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
```

## How we use it in organizations

### Scenario 1: Scheduling system with timezone support

```java
@Service
public class MeetingScheduler {

    public ZonedDateTime scheduleMeeting(String title, LocalDateTime proposedTime,
                                          String organizerTimezone, String attendeeTimezone) {
        // Convert organizer's proposed time to their timezone
        ZonedDateTime organizerTime = proposedTime.atZone(ZoneId.of(organizerTimezone));

        // Convert to attendee's timezone for display
        ZonedDateTime attendeeTime = organizerTime.withZoneSameInstant(ZoneId.of(attendeeTimezone));

        // Check if meeting is during business hours for attendee
        int hour = attendeeTime.getHour();
        if (hour < 9 || hour > 17) {
            throw new BusinessHoursException(
                "Meeting would be at " + hour + ":00 for attendee — outside business hours");
        }

        // Store in UTC (always UTC in database!)
        Instant meetingInstant = organizerTime.toInstant();
        meetingRepository.save(new Meeting(title, meetingInstant));

        return organizerTime;  // return organizer's timezone version
    }
}
```

### Scenario 2: Audit logging with precise timestamps

```java
@Entity
public class AuditLog {
    @Id
    private Long id;

    private String action;
    private String userId;

    @Column(columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private Instant timestamp;  // ALWAYS store as Instant (UTC) in the database

    @PrePersist
    public void prePersist() {
        this.timestamp = Instant.now();  // set creation time automatically
    }
}

// Querying time ranges
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    List<AuditLog> findByTimestampBetween(Instant start, Instant end);

    // Find all actions in the last 24 hours
    @Query("SELECT a FROM AuditLog a WHERE a.timestamp > :since")
    List<AuditLog> findRecent(@Param("since") Instant since);
}

// Usage
Instant twentyFourHoursAgo = Instant.now().minus(Duration.ofHours(24));
List<AuditLog> recent = auditLogRepository.findRecent(twentyFourHoursAgo);
```

### Scenario 3: Business day calculator

```java
public class BusinessDayCalculator {

    private final Set<LocalDate> holidays;

    public BusinessDayCalculator(Set<LocalDate> holidays) {
        this.holidays = holidays;
    }

    // Add N business days to a date (skip weekends and holidays)
    public LocalDate addBusinessDays(LocalDate startDate, int daysToAdd) {
        LocalDate current = startDate;
        int added = 0;

        while (added < daysToAdd) {
            current = current.plusDays(1);                    // move to next day
            if (isBusinessDay(current)) {
                added++;                                      // count business days only
            }
        }
        return current;
    }

    private boolean isBusinessDay(LocalDate date) {
        DayOfWeek day = date.getDayOfWeek();
        return day != DayOfWeek.SATURDAY                      // not Saturday
            && day != DayOfWeek.SUNDAY                        // not Sunday
            && !holidays.contains(date);                      // not a holiday
    }

    // Calculate duration in business hours
    public Duration businessHoursBetween(LocalDateTime start, LocalDateTime end) {
        Duration total = Duration.ZERO;
        LocalDate current = start.toLocalDate();

        while (current.isBefore(end.toLocalDate()) || current.isEqual(end.toLocalDate())) {
            if (isBusinessDay(current)) {
                LocalDateTime dayStart = current.atTime(LocalTime.of(9, 0));   // 9 AM
                LocalDateTime dayEnd = current.atTime(LocalTime.of(17, 0));    // 5 PM

                // Clamp to actual start/end times
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
