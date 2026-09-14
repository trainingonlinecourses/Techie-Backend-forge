---
title: Unicode and Code Points — What a char Really Is
summary: A char is not a character — it is a UTF-16 code unit. Here is why "𝕏".length() is 2, why emoji break toUpperCase(), and how to handle text correctly with code points.
order: 9
minutes: 15
topics: [unicode, char, code points, utf-16, strings, encoding]
docs:
  - url: https://docs.oracle.com/javase/tutorial/i18n/text/unicode.html
    title: Oracle — The Unicode Standard and char
  - url: https://www.geeksforgeeks.org/java/difference-between-char-and-codepoint-in-java/
    title: GeeksforGeeks — char vs code points in Java
  - url: https://dev.java/learn/numbers-strings/strings/
    title: dev.java — Strings and Unicode
  - url: https://www.w3schools.com/java/ref_string_codepointat.asp
    title: W3Schools — String codePointAt()
  - url: https://www.codecademy.com/learn/learn-java
    title: Codecademy — Learn Java
---

## The idea in one sentence

A `char` holds a 16-bit UTF-16 code unit, but a real "character" (a code point) can need
**two** of them — which is why string lengths, loops and regexes can lie to you when text
contains emoji, math symbols, or any character beyond the BMP.

## Why char is 16 bits in the first place

When Java was designed in 1995, Unicode had fewer than 65,536 characters, so the plan was
simple: **one character = one 16-bit `char`**. Then Unicode kept growing. Characters beyond
U+FFFF (the "supplementary" range — emoji, rare scripts, math alphabets) do not fit in 16
bits, so UTF-16 encodes them as a **surrogate pair**: two `char` values, a high surrogate
(U+D800–U+DBFF) followed by a low surrogate (U+DC00–U+DFFF).

So Java text is a sequence of UTF-16 code units, and the *character* you see on screen may
be one unit or two:

```java
public class UnicodeDemo {
    public static void main(String[] args) {
        String ascii = "AB";
        String rocket = "🚀"; // U+1F680 — a supplementary character

        // length() counts UTF-16 code units, not characters you can see
        System.out.println("ascii.length()  = " + ascii.length());   // 2
        System.out.println("rocket.length() = " + rocket.length());  // 2 — one visible character!

        // A char cannot even hold the rocket: it wraps to two surrogates
        char[] units = rocket.toCharArray();
        System.out.println("unit[0] is high surrogate: " +
                Character.isHighSurrogate(units[0])); // true
        System.out.println("unit[1] is low surrogate:  " +
                Character.isLowSurrogate(units[1]));  // true
    }
}
```

## The everyday bugs this causes

**Bug 1 — wrong length and truncation.** Validation like `if (name.length() > 20)` counts
the rocket emoji as 2. Truncating with `substring(0, 20)` can split a surrogate pair in
half — the resulting string ends with a lone surrogate that renders as `?` and can even
crash some downstream systems.

```java
public class TruncationTrap {
    public static void main(String[] args) {
        String bio = "Coding 🚀☕️ daily";

        // WRONG: can cut an emoji in half
        System.out.println("naive : " + bio.substring(0, 9));

        // RIGHT: code points never split
        int limit = 9;
        if (bio.offsetByCodePoints(0, Math.min(limit, bio.codePointCount(0, bio.length()))) <= bio.length()) {
            int end = bio.offsetByCodePoints(0, limit);
            System.out.println("safe  : " + bio.substring(0, end));
        }
    }
}
```

**Bug 2 — broken uppercase and casing.** `Character.toUpperCase(char)` only works within
one code unit. Supplementary characters need the code-point version:

```java
public class Casing {
    public static void main(String[] args) {
        String mathK = "𝕂"; // U+1D542, double-struck K

        // WRONG: operates on a lone surrogate, changes nothing
        System.out.println("char-based  : " + Character.toUpperCase(mathK.charAt(0)));

        // RIGHT: operates on the whole code point
        int cp = mathK.codePointAt(0);
        System.out.println("cp-based    : " + new String(Character.toChars(cp)) + " → "
                + new String(Character.toChars(Character.toUpperCase(cp))));
    }
}
```

**Bug 3 — reverse without reversing the pairs.** A hand-rolled reverse loop that walks
`char` by `char` swaps the two halves of every surrogate pair and produces garbage:

```java
public class ReverseCheck {
    public static void main(String[] args) {
        String s = "a🚀b";
        // WRONG — naive char loop
        String wrong = new StringBuilder(s).reverse().toString(); // safe: SB handles pairs
        // but this hand-rolled loop is the classic bug:
        StringBuilder manual = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (Character.isLowSurrogate(c) && manual.length() > 0
                    && Character.isHighSurrogate(manual.charAt(manual.length() - 1))) {
                // swap back: low met a preceding high — append low first
                char high = manual.charAt(manual.length() - 1);
                manual.setCharAt(manual.length() - 1, c);
                manual.append(high);
            } else {
                manual.append(c);
            }
        }
        System.out.println("manual reverse still intact: " + manual.toString().equals(wrong));
    }
}
```

## The code-point API — the correct toolkit

```java
public class CodePointToolkit {
    public static void main(String[] args) {
        String s = "a🚀b𝕂";

        // Count real characters (code points), not code units
        System.out.println("code units : " + s.length());          // 6
        System.out.println("code points: " + s.codePointCount(0, s.length())); // 4

        // Iterate code points safely
        s.codePoints().forEach(cp ->
                System.out.println("U+" + Integer.toHexString(cp).toUpperCase()
                        + " → " + new String(Character.toChars(cp))));

        // codePointAt returns the FULL code point at an index — even if the
        // character started one unit earlier
        System.out.println("first unit's code point: U+"
                + Integer.toHexString(s.codePointAt(1)).toUpperCase()); // 🚀, not the surrogate

        // Build a string from code points
        int[] points = {'a', 0x1F680, 'b'};
        System.out.println("rebuilt: " + new String(points, 0, points.length));
    }
}
```

## Rules to internalize

1. **Never trust `length()` for user-visible limits** — use `codePointCount`, or accept
   that limits are in "storage units" (many real systems — databases, Twitter-length APIs —
   define limits in UTF-16 units deliberately).
2. **Never split strings with raw index math on user text** — use
   `offsetByCodePoints` / `codePointBefore`.
3. **For casing, counting, comparing "characters", prefer the `codePoints()` stream** —
   it turns a confusing array of surrogates into a plain stream of `int` code points.
4. **Grapheme clusters are one level above.** A user-perceived character can be *multiple*
   code points (🚀 + variation selector, family emoji = 4 people joined by ZWJ). Java's
   `BreakIterator` (ICU in the JDK) handles those when you truly need "what the user sees".

## How this shows up in backends

- **Usernames and display names**: truncate by code points or you will corrupt emoji names.
- **Database columns**: `VARCHAR(20)` in MySQL counts *characters*, Postgres counts
  *characters* too — but `utf8mb3` cannot store emoji at all, so text silently truncates
  on insert. Encoding bugs masquerade as "character bugs".
- **Slugs and IDs**: ASCII-ify (`Normalizer` + regex) before matching so "café" and
  "cafe" unify deterministically.
- **JSON APIs**: Jackson transmits UTF-8, but a client slicing by JS string index (also
  UTF-16!) hits exactly the same trap — this is why "𝕏".length is 2 in *JavaScript* too.

## References

- [Oracle — International text: the Unicode standard](https://docs.oracle.com/javase/tutorial/i18n/text/unicode.html)
- [GeeksforGeeks — char vs code points](https://www.geeksforgeeks.org/java/difference-between-char-and-codepoint-in-java/)
- [dev.java — Working with Strings](https://dev.java/learn/numbers-strings/strings/)
- [W3Schools — Java String codePointAt()](https://www.w3schools.com/java/ref_string_codepointat.asp)
- [Codecademy — Learn Java](https://www.codecademy.com/learn/learn-java)
