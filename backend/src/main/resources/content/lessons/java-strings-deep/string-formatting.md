---
title: String Formatting — printf, String.format, and MessageFormat
module: java-strings-deep
order: 4
minutes: 21
topics: ["printf", "String.format", "format specifiers", "locale", "MessageFormat"]
docs:
  - title: "Formatter (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Formatter.html"
summary: Concatenation with + gets ugly fast when you want control over layout:
---

# String Formatting — printf, String.format, and MessageFormat

## The Concept: Why Not Just Concatenate?

Concatenation with `+` gets ugly fast when you want control over layout:

```java
String line = "Total: $" + total + " — discount " + pct + "% off — " + count + " items";
```

Three problems:

1. **No alignment control** — numbers don't line up in columns.
2. **No precision control** — `59.9` prints as `59.9`, `59.0` as `59.0`, `3.14159265...` as a long mess.
3. **Readability** — the *shape* of the output is buried inside the expression.

**Formatting** separates *what you want to print* (a template with placeholders) from *the values* you plug in:

```java
String line = String.format("Total: $%.2f — discount %d%% off — %d items", total, pct, count);
```

The template `"Total: $%.2f — discount %d%% off — %d items"` shows the exact output shape. `%.2f`, `%d` are **format specifiers** — placeholders that say "put a floating-point number here, rounded to 2 decimals" and "put an integer here".

## The Anatomy of a Format Specifier

```
%[argument_index$][flags][width][.precision]conversion
```

| Piece | Meaning | Example |
|---|---|---|
| `%` | Starts the specifier | — |
| `argument_index$` | Which argument (1-based) | `%2$s` = second argument |
| `flags` | `-` left-justify, `0` zero-pad, `+` force sign, `,` grouping | `%-,10d` |
| `width` | Minimum field width (pad if shorter) | `%10s` |
| `.precision` | For floats: decimals. For strings: max chars | `%.2f` |
| `conversion` | The type: `d` int, `f` float, `s` string, `x` hex, `t` date/time | `%d` |

## The Code Walkthrough

```java
import java.util.Locale;

public class FormatDemo {

    public static void main(String[] args) {
        int items = 3;
        double total = 1234.56789;
        double discount = 15.0;
        String product = "Widget";

        // 1. String.format — returns a String
        String line = String.format(
                "You bought %d %s(s) for $%,.2f (%.0f%% off)",
                items, product, total, discount);
        System.out.println(line);
        // You bought 3 Widget(s) for $1,234.57 (15% off)

        // 2. printf — prints directly to System.out (same specifiers)
        System.out.printf("| %-10s | %6.2f |%n", product, total);
        // | Widget     | 1234.57 |

        // 3. Explicit argument index — reuse without reordering
        System.out.printf("%2$s is cheaper than %1$s%n", "A", "B");
        // B is cheaper than A

        // 4. Zero-padding and sign flags
        System.out.printf("%05d%n", 42);          // 00042
        System.out.printf("%+d and %+d%n", 7, -7); // +7 and -7

        // 5. Locale-aware formatting (comma vs dot decimals)
        System.out.printf(Locale.GERMANY, "%.2f%n", 1234.5);   // 1234,50
        System.out.printf(Locale.US, "%.2f%n", 1234.5);        // 1234.50
    }
}
```

### Walking Through Each Part

**Part 1 — `String.format`:** The template is scanned left to right; each specifier consumes the next argument. `%d` → `items` (3), `%s` → `product` ("Widget"), `%,.2f` → `total` — the `,` flag adds thousands separators and `.2` rounds to 2 decimals (`1,234.57`), and `%.0f` → `discount` with zero decimals (`15`). The `%%` prints a literal percent sign — because a single `%` would start a specifier.

**Part 2 — `printf` + width/alignment:** `%-10s` left-justifies `"Widget"` in a 10-character field (trailing spaces). `%6.2f` right-justifies `1234.57` in a 6-character field. `%n` is the portable newline (works on any OS, unlike `\n` which is Unix-only).

**Part 3 — argument index:** `%2$s` means "use argument #2", `%1$s` means "use argument #1". This lets you reference an argument more than once or in a different order — useful in internationalized messages where word order differs by language.

**Part 4 — flags:** `%05d` pads with zeros to width 5 (`00042`). `%+d` forces a sign on positive numbers so columns align with negatives.

**Part 5 — Locale:** The same number formats differently by region — `1234,50` in Germany, `1234.50` in the US. If your code runs in a multi-locale environment, **always pass an explicit `Locale`**; otherwise `String.format` silently uses the default locale, which can produce surprising decimals, grouping, or even corrupt data (e.g., in SQL or file names).

## String.format vs System.out.printf vs MessageFormat

| Tool | Purpose | Best for |
|---|---|---|
| `String.format(fmt, args)` | Returns a `String` | Building messages, logging lines |
| `System.out.printf(fmt, args)` | Prints immediately | Quick console output |
| `System.out.format(fmt, args)` | Same as printf | Same |
| `MessageFormat.format(fmt, args)` | `{0}` `{1}` placeholders, i18n | Localized user-facing text |

`MessageFormat` is different: placeholders look like `{0}`, `{1}` and it integrates with `ResourceBundle` for internationalization. `String.format` is the everyday workhorse.

## Date/Time Formatting (Bonus)

`%t` conversions format dates and times (need `java.time` types):

```java
import java.time.LocalDateTime;

LocalDateTime now = LocalDateTime.now();
System.out.printf("%tF %<tT%n", now);   // 2026-08-18 14:30:05
```

`%tF` = ISO date, `%<tT` = time; the `<` flag means "reuse the previous argument", so we don't pass `now` twice.

## Common Beginner Pitfalls

1. **`%` without `%%`** — `"50% off"` throws `UnknownFormatConversionException`; use `"50%% off"`.
2. **Wrong conversion for the type** — `%d` with a `double` throws at runtime. `%d` is for integers, `%f` for floats, `%s` for anything (calls `toString()`).
3. **Ignoring locale** — server code printing numbers with a comma decimal can break parsers downstream. Pass an explicit `Locale`.
4. **Using `\n`** — use `%n` for a portable newline inside formats.

## Key Takeaways

- Format specifiers put the *shape* of output in the template and values in the arguments.
- `%,.2f` — comma groups, 2 decimals; `%d` — integers; `%s` — anything; `%%` — literal percent.
- `width`/`flags` give column alignment and padding.
- Always pass an explicit `Locale` for locale-sensitive output.
- Use `MessageFormat` (`{0}` style) for user-facing internationalized text.
