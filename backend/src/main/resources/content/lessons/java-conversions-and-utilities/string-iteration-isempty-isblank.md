---
title: String Iteration, isEmpty vs isBlank, and String Inspection — How to Look at a String Correctly
summary: How to iterate a String character by character, code-point by code-point, and line by line. The difference between isEmpty() and isBlank(), why isBlank() catches the "user entered only spaces" case that isEmpty misses, and how to inspect strings safely without off-by-one errors.
order: 3
minutes: 16
topics: [String iteration, isEmpty, isBlank, codePoints, charAt, lines, whitespace, off-by-one]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Character.html
---

## The Concept, From Zero

A `String` in Java is a sequence of UTF-16 code units. Three ways to iterate it, each for a different purpose:

1. **`charAt(i)` / classic for-loop** — iterate by UTF-16 code unit index. This is the oldest way, works everywhere, but produces surrogate halves for emoji (you get two `char`s for one emoji, which is usually not what you want).

2. **`String.codePoints()`** — iterate by Unicode code point (the real "character"). This handles emoji, rare CJK, and other supplementary characters correctly as single items. Available since Java 8.

3. **`String.lines()`** — split a multi-line string into a stream of lines. Available since Java 11. Convenient for processing text with newlines, and it handles `\r\n`, `\n`, and `\r` line separators correctly.

And two predicates that look similar but are not:

- **`isEmpty()`** — returns `true` if `length() == 0`. An empty string has zero characters. `" "` (a single space) is **not** empty — it has length 1.
- **`isBlank()`** — returns `true` if the string is empty **or** contains only whitespace code points. `" "` is blank. `"\t\n"` is blank. `"  hello  "` is **not** blank (it has non-whitespace characters).

The difference matters when validating user input: `isEmpty()` lets a string of spaces pass, but `isBlank()` catches it. A user who accidentally presses space a few times and submits an empty-looking form — `isEmpty()` says "not empty," `isBlank()` says "blank, reject it."


**What this code does — step by step:**

1. --- 1. Iterate by char (UTF-16 code unit) ---
2. --- 2. Iterate by code point (real Unicode character) ---
3. --- 3. Iterate lines ---
4. --- isEmpty vs isBlank ---
5. '' -> isEmpty=true, isBlank=true. ' ' -> isEmpty=false, isBlank=true. ' ' -> isEmpty=false, isBlank=true. 'hello' -> isEmpty=false, isBlank=false. ' hello ' -> isEmpty=false, isBlank=false
6. --- Collecting code points back to a String (round-trip) ---
7. `System.out.println("round-trip equals original: " + reconstructed.equals(text));` — true

The same code, clean:

```java
import java.util.stream.Collectors;

public class StringIterationDemo {
    public static void main(String[] args) {
        String text = "Hello 世界\nLine 2\r\nLine 3";

        System.out.println("--- by charAt ---");
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            System.out.print(c == '\n' ? "\\n " : c == '\r' ? "\\r " : c + " ");
        }
        System.out.println();

        System.out.println("--- by codePoint ---");
        text.codePoints().forEach(cp -> {
            if (cp == '\n') System.out.print("\\n ");
            else if (cp == '\r') System.out.print("\\r ");
            else System.out.print(new String(Character.toChars(cp)) + " ");
        });
        System.out.println();

        System.out.println("--- by lines ---");
        text.lines().forEach(line -> System.out.println("LINE: " + line));

        System.out.println("--- empty vs blank ---");
        String[] tests = {"", "   ", "\t\n", "hello", "  hello  "};
        for (String s : tests) {
            System.out.println("'" + s + "' -> isEmpty=" + s.isEmpty() + ", isBlank=" + s.isBlank());
        }

        String reconstructed = text.codePoints()
            .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
            .toString();
        System.out.println("round-trip equals original: " + reconstructed.equals(text));
    }
}
```

Line by line:

- **`text.length()`** returns the number of UTF-16 code units. For "Hello 世界\nLine 2\r\nLine 3", the length includes the two bytes for each CJK character (世界 = 2 chars), plus the newlines.
- **`text.charAt(i)`** — gets the `char` at index `i`. For ASCII and most Latin text, this is one visible character per `char`. For "世界", each character is one `char` (U+4E16 and U+754C are both in the BMP, so they fit in one `char` each). For emoji like "😊", `charAt` gives the high surrogate (U+D83D) and low surrogate (U+DE0A) as two separate `char`s — not one character.
- **`text.codePoints()`** — returns an `IntStream` of Unicode code points. Each item is one real character: 'H', 'e', 'l', 'l', 'o', ' ', '世' (U+4E16), '界' (U+754C), '\n', 'L', 'i', 'n', 'e', ' ', '2', '\r', '\n', 'L', 'i', 'n', 'e', ' ', '3'. Emoji would be one item each, not two surrogates.
- **`Character.toChars(cp)`** — converts a code point back to a `char[]` (one `char` for BMP characters, two for supplementary). `new String(Character.toChars(cp))` builds a one-character string from the code point. This is how you print a code point as a character.
- **`text.lines()`** — splits the string by line separators and returns a `Stream<String>`. It handles `\n`, `\r\n`, and `\r` as line separators. The output is three lines: "Hello 世界", "Line 2", "Line 3".
- **`isEmpty()`** — `true` only for `""`. `"   "` has length 3, so `isEmpty()` is `false`.
- **`isBlank()`** — `true` for `""` and `"   "` and `"\t\n"` (all whitespace). `"hello"` is not blank. `"  hello  "` is not blank (has non-whitespace).
- **The round-trip** — `codePoints().collect(...)` rebuilds the string from its code points. The result equals the original, confirming that iterating by code point and rebuilding is lossless for valid Unicode.

### Why isBlank() Saves You from the "Space-Only Input" Bug

A common form-validation bug: the user submits a field with only spaces (maybe they copied whitespace, or their input device sent spaces). `isEmpty()` returns `false` because the string has length > 0. Your validation passes, and you store "   " in the database. Later, reports show names like "   " (three spaces) — corrupt data.

`isBlank()` returns `true` for that string, so your validation catches it. This is the standard pattern for "is this input meaningfully empty?"


**What this code does — step by step:**

1. WRONG: lets spaces through
2. `if (name == null || name.isEmpty()) return false;` — " " passes
3. RIGHT: catches spaces, tabs, newlines
4. `if (name == null || name.isBlank()) return false;` — " " rejected
5. `return name.trim().length() >= 2;` — also require at least 2 non-space chars
6. `System.out.println("'' -> " + isValidName(""));` — false (empty)
7. `System.out.println("'   ' -> " + isValidName("   "));` — false (blank) — caught by isBlank
8. `System.out.println("'Jo' -> " + isValidName("Jo"));` — true
9. `System.out.println("'  Jo  ' -> " + isValidName("  Jo  "));` — true (trim + length check)

The same code, clean:

```java
public class ValidationDemo {
    public static boolean isValidName(String name) {
        if (name == null || name.isEmpty()) return false;

        if (name == null || name.isBlank()) return false;

        return name.trim().length() >= 2;
    }

    public static void main(String[] args) {
        System.out.println("'' -> " + isValidName(""));
        System.out.println("'   ' -> " + isValidName("   "));
        System.out.println("'Jo' -> " + isValidName("Jo"));
        System.out.println("'  Jo  ' -> " + isValidName("  Jo  "));
    }
}
```

Line by line:

- **`name == null || name.isEmpty()`** — the wrong check. `"   "` (three spaces) is not empty, so it passes. This lets whitespace-only input into the system.
- **`name == null || name.isBlank()`** — the correct check. `"   "` is blank, so it returns `false`. This catches space-only, tab-only, newline-only, and empty inputs.
- **`name.trim().length() >= 2`** — an additional check: after trimming leading/trailing whitespace, require at least 2 characters. This lets "  Jo  " pass (trimmed to "Jo", length 2) but rejects "  A  " (trimmed to "A", length 1).

### Off-by-One and Index Errors

Iterating with `charAt` and a for-loop is error-prone. The two classic bugs:

1. **Starting at 1 instead of 0** — skips the first character.
2. **Using `<= length()` instead of `< length()`** — `charAt(length())` throws `StringIndexOutOfBoundsException` because valid indices are `0` to `length() - 1`.


**What this code does — step by step:**

1. WRONG: skips 'A'
2. `System.out.println();` — "BC"
3. WRONG: throws StringIndexOutOfBoundsException
4. RIGHT:
5. `System.out.println();` — "ABC"

The same code, clean:

```java
public class OffByOneDemo {
    public static void main(String[] args) {
        String s = "ABC";

        System.out.print("start at 1: ");
        for (int i = 1; i < s.length(); i++) System.out.print(s.charAt(i));
        System.out.println();

        try {
            for (int i = 0; i <= s.length(); i++) System.out.print(s.charAt(i));
        } catch (StringIndexOutOfBoundsException e) {
            System.out.println("\n'<= length()' throws: " + e.getMessage());
        }

        System.out.print("correct: ");
        for (int i = 0; i < s.length(); i++) System.out.print(s.charAt(i));
        System.out.println();
    }
}
```

Line by line:

- **`for (int i = 1; i < s.length(); i++)`** — starts at index 1, skipping 'A'. The output is "BC". This is the "off by one" that loses the first character.
- **`for (int i = 0; i <= s.length(); i++)`** — the `<=` is wrong. When `i == s.length()`, `charAt(i)` is `charAt(3)` for a 3-character string, which is out of bounds (valid indices are 0, 1, 2). Throws `StringIndexOutOfBoundsException`.
- **`for (int i = 0; i < s.length(); i++)`** — correct. `i` goes from 0 to `length() - 1`, which are exactly the valid indices.

The modern, safer alternatives — `codePoints()`, `lines()`, `toCharArray()`, enhanced for-loop over `chars()` (Java 8+) — avoid index math entirely. Use them when you can.

### Real-World Scenarios

**Scenario 1: Validating a form field.** A user registration form asks for a display name. The user types spaces and submits. `isEmpty()` says "not empty," the form passes, and the database gets "   ". With `isBlank()`, the form rejects the input and asks the user to enter a real name. This is the most common place `isBlank()` saves you.

**Scenario 2: Processing a log file line by line.** You read a log file into a `String` (or receive it as a multiline string) and want to process each line. `lines().forEach(line -> analyze(line))` is cleaner than `split("\r?\n")` and handles all line separator styles. It also does not include trailing empty lines (a `split` might).

**Scenario 3: Counting characters in a string that may contain emoji.** A social media app shows "X characters remaining" for a post. If you use `length()`, an emoji counts as 2 (two UTF-16 code units). The user sees "2 characters remaining" when they typed one emoji, which is confusing. Using `codePointCount(0, length())` counts real characters, so one emoji = 1 character. This is the correct count for user-facing character limits.

**Scenario 4: Inspecting a string for hidden whitespace.** A user copies a value from a spreadsheet and pastes it into a form. The pasted value may have leading/trailing spaces or a trailing newline. `isBlank()` detects if the whole string is whitespace; `trim()` removes the surrounding whitespace; `strip()` (Java 11, Unicode-aware) removes Unicode whitespace. Checking `s.strip().isEmpty()` is the modern pattern for "is this string meaningful after removing surrounding whitespace?"

### Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|---|
| Using `isEmpty()` to validate user input | `isEmpty()` only catches `""`, not whitespace-only | Use `isBlank()` for "is this input meaningfully empty?" |
| Using `length()` as "number of visible characters" | `length()` counts UTF-16 code units, not code points | Use `codePointCount(0, length())` for real character count |
| Iterating with `charAt` and `<= length()` | Classic off-by-one, throws `StringIndexOutOfBoundsException` | Use `< length()`, or switch to `codePoints()` / `toCharArray()` to avoid indices |
| Using `split("\n")` on cross-platform text | Windows uses `\r\n`; `split("\n")` leaves `\r` at the end of each line | Use `lines()` (handles all separators) or `split("\\r?\\n")` |
| Assuming `trim()` removes all whitespace | `trim()` only removes ASCII control characters ≤ U+0020 (space, tab, newline, etc.), not all Unicode whitespace | Use `strip()` (Java 11) for Unicode-aware whitespace removal |
| Using `charAt` to compare single characters when the string may contain surrogate pairs | `charAt` can return a surrogate half, not a full character | For character-level comparison, use `codePoints()` and compare code points |

## For the Practice Lab

In the lab, you will start with a multiline string that includes emoji, CJK characters, and mixed line separators. You will iterate it three ways: `charAt` in a for-loop, `codePoints()`, and `lines()`. You will print each iteration and compare — seeing that `charAt` splits emoji into surrogates while `codePoints()` keeps them whole. Then you will build a validation function that uses `isBlank()` to reject whitespace-only input, and test it with `""`, `"   "`, `"\t\n"`, `"Jo"`, and `"  Jo  "`. You will compare with the `isEmpty()` version and see that `isEmpty()` lets `"   "` through. Finally, you will implement a character counter that uses `codePointCount` (correct) vs `length()` (wrong for emoji) and verify the difference with a string containing emoji.

## Summary

Iterate a `String` the way that matches your purpose: `charAt` + for-loop for legacy code or when you need indices; `codePoints()` for real Unicode character iteration (emoji, CJK safe); `lines()` for multiline text processing (handles all line separators). `isEmpty()` only catches the empty string; `isBlank()` catches empty **and** whitespace-only — use `isBlank()` for input validation to reject space-only submissions. Beware off-by-one errors with `charAt` and `<= length()`. Use `strip()` (Java 11) for Unicode-aware trimming, and `codePointCount` for user-facing character counts. When working with text that may contain emoji or supplementary characters, `codePoints()` is the correct tool — `charAt` and `length()` work at the UTF-16 code-unit level and can misrepresent real characters.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html)
