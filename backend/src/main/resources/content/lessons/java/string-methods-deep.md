---
title: Essential String Methods — The API You Use Every Single Day
summary: substring, split, indexOf, replace, strip, format, isBlank, repeat, chars — each method explained with what it actually returns, edge cases, and the production bugs each one has caused.
order: 79
minutes: 22
topics: [string-methods, substring, split, indexof, format, isblank]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
---

## The Concept, From Zero

`String` is the most-used class in Java, and its 100+ methods fall into a handful of families: **searching**, **cutting**, **transforming**, **comparing**, **testing**. This lesson walks through the ones that appear in virtually every codebase, with the edge cases that cause real bugs.

Remember one rule first: **Strings are immutable.** Every "modifying" method returns a *new* string and throws the original away if you don't capture it:

```java
String name = "  amy  ";
name.strip();                       // ❌ result discarded — name is STILL "  amy  "
name = name.strip();                // ✅ reassign to keep the new object
```

## Searching — `indexOf`, `contains`, `startsWith`

```java
String log = "2026-08-26 ERROR payment failed";

int at = log.indexOf("ERROR");          // 11 — position of first occurrence, or -1 if absent
boolean bad = log.contains("failed");   // true — simplest existence check
boolean err = log.startsWith("2026-08");// true — useful for prefix routing/filtering
int last = log.lastIndexOf("e");        // finds from the END backwards
```

| Call | Returns |
|---|---|
| `indexOf("x")` | index of first match or **-1** (never an exception!) |
| `contains("x")` | boolean — literally `indexOf(...) >= 0` |
| `indexOf("x", 5)` | search starts at index 5 |

The -1 convention matters: `if (log.indexOf("ERROR")) ` doesn't compile (int isn't boolean), but `if (log.indexOf("ERROR") == 0)` is a subtle bug — it checks "error at position zero," not presence.

## Cutting — `substring`, `split`

```java
String csv = "amy,engineer,bangalore";

String[] parts = csv.split(",");        // ["amy", "engineer", "bangalore"]
String role = parts[1];                 // "engineer"

String domain = email.substring(email.indexOf('@') + 1);   // everything AFTER '@'
```

### split's regex trap — the #1 string bug in Java

`split` takes a **regular expression**, not plain text:

```java
"a.b".split(".")        // [] — EMPTY! '.' means "any character" in regex
"a.b".split("\\.")      // ["a", "b"] ✅ escape it
"a|b".split("|")        // splits between EVERY character
"a|b".split("\\|")      // ["a", "b"] ✅
```

Also: **trailing empty strings are dropped** by default.

```java
"a,b,,,".split(",")             // ["a","b"] — empties at end vanish
"a,b,,,".split(",", -1)         // ["a","b","","",""] — limit=-1 keeps them all
```

That second form matters when parsing fixed-column records where trailing blanks are meaningful data positions.

## Transforming — `replace`, `strip`, `toUpperCase`, `format`, `repeat`

```java
String clean = raw.replace(" ", "_");     // ALL occurrences; literal text, NOT regex
String tidy   = input.strip();            // trims Unicode whitespace (Java 11+)
String shout  = name.toUpperCase(Locale.ROOT);  // deterministic across locales

String msg = "Hello %s, you have %d alerts".formatted("Amy", 3);   // Java 15+
// identical to String.format("Hello %s, ...", "Amy", 3)

String divider = "-".repeat(40);          // 40 dashes — no loops needed
```

Line-by-line notes:

| Method | Edge case to know |
|---|---|
| `replace` | Literal matching — safe with dots and pipes, unlike `replaceAll` which IS regex |
| `strip()` vs `trim()` | trim only removes chars ≤ U+0020; strip handles all Unicode whitespace |
| `toUpperCase()` without Locale | Turkish locale famously maps 'i' → 'İ' breaking URL schemes — always pass `Locale.ROOT` for machine-facing text |
| `formatted` / `format` | `%s` any string, `%d` integer, `%.2f` two-decimal float, `%n` platform newline |

## Testing — `isEmpty`, `isBlank`, `matches`

```java
"".isEmpty()        // true  — length 0
"   ".isEmpty()     // false — has characters!
"   ".isBlank()     // true  — only whitespace (Java 11+)

"12345".matches("\\d{5}")    // true — matches validates the WHOLE string against regex
```

For user input validation, `isBlank()` is usually what you meant when you wrote `isEmpty()` — "did the user type nothing useful?"

## Real Organizational Scenarios

**Scenario 1 — The CSV import outage.** An ingestion job parsed `"id,name,dept"` rows with `split(",")`. Rows with empty trailing department silently lost a column, shifting every field after import. Fix: `split(",", -1)` plus explicit length assertion per row.

**Scenario 2 — The Turkish-I incident.** Cache keys were uppercased with default locale; on servers running `tr_TR` the key `"file"` became `"FİLE"`, missing cached entries and hammering the database. Org-wide rule: `Locale.ROOT` everywhere machine text is cased.

**Scenario 3 — Log scraping dashboards.** SRE alerting parses `ERROR` lines using `indexOf` + `substring` windows. Understanding that `indexOf` returns -1 prevented the classic bug where absence of a marker produced garbage substrings from negative indices (`substring(-1)` throws!).

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Ignoring return value of transform methods | "replace didn't work" | Strings are immutable — assign the result |
| `split(".")` on filenames/dots | Empty array | Escape regex metacharacters `\\.`, or use `Pattern.quote` |
| `isEmpty()` for user input | Whitespace-only passes validation | Use `isBlank()` |
| `replaceAll` thinking it's literal | Dots match everything unexpectedly | `replace` for literals; `replaceAll` is regex |
| Chained substring math without bounds checks | StringIndexOutOfBoundsException on odd inputs | Guard with length checks before slicing |
