---
title: Regular Expressions — Pattern & Matcher in Practice
summary: The regex engine, Pattern/Matcher lifecycle, groups and backreferences, and the validation, parsing, and scrubbing scenarios teams use them for.
order: 24
minutes: 22
topics: [regex, pattern, matcher, groups, lookahead, validation, parsing, replacement]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Pattern.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/regex/Matcher.html
  - https://www.regular-expressions.info/
---

# Regular Expressions — Pattern & Matcher in Practice

## The concept: what a regex is and how the engine works

A regular expression is a **mini-language for describing text patterns**. Java's engine (`java.util.regex`) compiles a pattern string into an internal automaton that scans a target string left to right, trying to match at each position, with three core ideas:

- **Literal characters** match themselves: `error` matches the substring `error`.
- **Character classes** match one of a set: `[A-Za-z0-9]` matches one alphanumeric.
- **Quantifiers** repeat: `+` (one or more), `*` (zero or more), `?` (optional), `{2,4}` (between 2 and 4).
- **Anchors** pin positions: `^` start, `$` end, `\b` word boundary.

The engine is **greedy by default** — quantifiers consume as much as possible, then backtrack. Understanding greediness is the difference between a working pattern and one that matches too much (the classic `.*` swallowing more than intended).

## The Pattern/Matcher lifecycle

The most common performance bug: compiling the pattern on every call.

```java
// WRONG — compiles the regex every request (expensive)
boolean ok = email.matches("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$");

// RIGHT — compile once, reuse forever
public final class EmailValidator {
    private static final Pattern EMAIL =
        Pattern.compile("^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$", Pattern.CASE_INSENSITIVE);
    // static final = compiled once per classloader; Pattern is thread-safe and immutable

    public static boolean isValid(String email) {
        return email != null && EMAIL.matcher(email).matches();
    }
}
```

`Pattern.compile` is the expensive part — it parses the regex into a state machine. `matcher(...)` and the match itself are cheap. A **`static final` Pattern** is the standard, and `Pattern` is immutable and thread-safe so one instance serves every thread. `String.matches` compiles a fresh pattern each call — fine for validation scripts, a disaster in a hot request path.

## How we use it in an organization: real scenarios

**Scenario 1 — extracting values with groups:**

```java
// Parse "GET /api/orders/12345 HTTP/1.1" from an access log
Pattern ACCESS = Pattern.compile("^(\\w+) (/[^ ]*) HTTP/1\\.[01]$");
Matcher m = ACCESS.matcher(line);
if (m.matches()) {
    String method = m.group(1);   // GET
    String path   = m.group(2);   // /api/orders/12345
}
```

Groups are the `( ... )` captures; `group(1)`, `group(2)`… retrieve them. `group(0)` is the whole match.

**Scenario 2 — sanitizing free-text input (scrubbing):**

```java
// Remove HTML tags and control characters from a user-supplied bio before rendering
String clean = rawBio.replaceAll("<[^>]*>", "")      // strip tags
                     .replaceAll("[\\p{Cntrl}]", "")  // strip control chars
                     .trim();
```

**Scenario 3 — validating with a strict anchor and a lookahead:**

```java
// Password policy: 8-64 chars, at least one letter and one digit
Pattern PASSWORD = Pattern.compile("^(?=.*[A-Za-z])(?=.*\\d).{8,64}$");
// (?=...) lookaheads assert a condition without consuming characters
```

**Scenario 4 — extracting tokens from structured text (config, headers):**

```java
// Parse "rate_limit=1000; window=60" style header values
Pattern KV = Pattern.compile("(\\w+)=([^;\\s]+)");
Matcher m = KV.matcher(header);
while (m.find()) {
    String key = m.group(1); // rate_limit
    String val = m.group(2); // 1000
}
```

`find()` scans for the *next* match anywhere; `matches()` requires the whole string to match; `lookingAt()` anchors at the start only. Choosing the right one is a common review comment.

## The pitfalls that bite in production

- **Catastrophic backtracking (ReDoS):** nested quantifiers like `(a+)+$` on a long non-matching string can take exponential time — a CPU-denial-of-service vector. Keep patterns linear; avoid nested quantifiers on overlapping alternatives; add input-length limits before matching untrusted text.
- **Greedy `.*` overreach:** `<b>bold</b> and <b>more</b>` with `<.*>` matches the *whole string* (greedy). Use `<.*?>` (reluctant) or a negated class `<[^>]*>` — the negated class is both correct and faster.
- **Regex is not a parser:** parsing JSON, HTML, or SQL with regex breaks on nesting. Reach for a real parser (Jackson, jsoup, an ANTLR grammar). Organizations ban regex-for-HTML in review.
- **Backslashes in Java strings:** `\d` in regex is `"\\d"` in a Java string. `String.matches("\\d+")` is correct; forgetting the double backslash compiles to an escape error.
- **Don't reinvent validation:** for emails/URLs use `jakarta.validation` annotations (`@Email`) plus a lightweight regex; don't build a custom validator for every field.

## Key takeaways

- Compile patterns once as `static final`; `Pattern` is thread-safe and immutable.
- Know `matches()` vs `find()` vs `lookingAt()`.
- Use groups to extract, lookaheads to assert, negated classes instead of greedy `.*`.
- Guard against catastrophic backtracking on untrusted input.
- Regex for patterns, not for parsing structured formats.
