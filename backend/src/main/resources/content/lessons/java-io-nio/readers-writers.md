---
title: Readers and Writers — Text I/O and Encodings
module: java-io-nio
order: 2
minutes: 24
topics: ["Reader", "Writer", "charsets", "UTF-8", "text encoding", "line reading"]
docs:
  - title: "Charset (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/charset/Charset.html"
summary: Here is the single most important idea in this lesson: a file on disk is a sequence of bytes. Text is a convention for interpreting those bytes. Th...
---

# Readers and Writers — Text I/O and Encodings

## The Concept: Bytes Are Not Text

Here is the single most important idea in this lesson: **a file on disk is a sequence of bytes. Text is a convention for interpreting those bytes.** The same byte `0xC3 0xA9` means `é` in UTF-8, but means the two characters `Ã©` in Windows-1252. There is no such thing as "plain text" without an **encoding** (charset) agreement.

Characters → bytes is called **encoding**; bytes → characters is **decoding**. The charset decides the mapping:

- **UTF-8** — variable length (1–4 bytes per char), ASCII-compatible, the web standard. Use it everywhere by default.
- **UTF-16** — 2 or 4 bytes per char; what Java strings use internally.
- **ISO-8859-1 / Latin-1** — 1 byte per char, only Western European chars.
- **Windows-1252** — Microsoft's Latin-1 extension; the cause of countless `â€™` mojibake bugs.

The `Reader`/`Writer` hierarchy exists precisely to handle this conversion for you, using a charset you specify (or the platform default, which is the trap).

## The Code Walkthrough

```java
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

public class ReaderWriterDemo {

    public static void main(String[] args) throws IOException {
        // 1. Write text with an explicit charset — never rely on defaults
        Path file = Path.of("note.txt");
        String text = "café — naïve — 中文";
        Files.writeString(file, text, StandardCharsets.UTF_8);

        // 2. Read it back with the SAME charset
        String roundTrip = Files.readString(file, StandardCharsets.UTF_8);
        System.out.println(roundTrip.equals(text));   // true

        // 3. Decode with the WRONG charset — see the mojibake
        String wrong = Files.readString(file, StandardCharsets.ISO_8859_1);
        System.out.println(wrong);                    // cafÃ© â€” naÃ¯ve â€” ä¸æ–‡

        // 4. Streaming with an explicit charset + buffering
        try (BufferedWriter writer = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
            writer.write("line one\n");
            writer.write("line two\n");
        }

        // 5. Reading lines lazily (doesn't load the file into memory)
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println(">> " + line);
            }
        }
    }
}
```

### Walking Through Each Part

**Part 1 — `Files.writeString`.** The modern, preferred API. The charset argument makes the encoding decision *explicit*. If you omit it, Java uses the **platform default** — on Windows that's typically Windows-1252, on Linux UTF-8. Code that relies on the default produces different files on different machines. This is a classic "works on my machine" bug.

**Part 2 — round trip.** Encoding and decoding with the same charset restores the exact original text, including the accented characters and CJK.

**Part 3 — the wrong charset.** Decoding UTF-8 bytes as Latin-1 produces `cafÃ©` — each multi-byte UTF-8 sequence gets misread as multiple Latin-1 characters. This is precisely the mojibake you see in broken web pages, email subjects, and log files. The bytes are fine; the *interpretation* was wrong.

**Part 4 — streaming writes.** `Files.newBufferedWriter` gives a buffered writer for the file with the given charset. Each `write` appends to the internal buffer; closing (or `flush()`) pushes it out. Writing line by line like this is how you'd generate CSV, config files, or logs without building one giant string.

**Part 5 — lazy line reading.** `readLine()` returns one line at a time and returns `null` at EOF. Because each line is processed and discarded, a gigabyte log file never occupies more than a line's worth of memory. Contrast with `Files.readAllLines`, which loads every line into a `List`.

## The Bridge Classes

Sometimes you have bytes (e.g., from a socket or an `InputStream`) but want text APIs:

```java
// Wrap an InputStream, decode as UTF-8, buffer, read lines:
try (BufferedReader r = new BufferedReader(
        new InputStreamReader(in, StandardCharsets.UTF_8))) {
    String line;
    while ((line = r.readLine()) != null) { ... }
}
```

`InputStreamReader` is the *decoder bridge*: bytes in, chars out. `OutputStreamWriter` is the *encoder bridge*: chars in, bytes out. The charset argument is where you control the encoding — always pass it.

## The Golden Rules of Text I/O

1. **Always specify the charset** — in every constructor and every `Files.*` call. `StandardCharsets.UTF_8` should be your default.
2. **Use the same charset for write and read** — mismatched round trips are the #1 text bug.
3. **Never guess the charset of external data** — HTTP responses declare it in the `Content-Type` header; files should too (or you test). When unknown, try UTF-8 first (it's the web standard) and consider BOM detection.
4. **`getBytes()` without arguments uses the platform default** — always `text.getBytes(StandardCharsets.UTF_8)`.
5. **Prefer the `Files.*` convenience methods** (`readString`, `writeString`, `newBufferedReader`, `newBufferedWriter`) over raw `FileReader`/`FileWriter`, which hardcode the platform default charset and are effectively deprecated in spirit.

## Charset Quick Reference

| Charset | Bytes per char | Use it for |
|---|---|---|
| UTF-8 | 1–4, variable | Default for everything: web, files, APIs |
| UTF-16 | 2 or 4 | Java internals; rarely for exchange |
| ISO-8859-1 | 1 | Legacy Western European only |
| US-ASCII | 1 (7-bit) | English-only legacy formats |
| Windows-1252 | 1 | Only when reading old Windows files |

## Common Beginner Pitfalls

1. **Mojibake** (`â€™`, `Ã©`, `ï»¿`) — decoding with the wrong charset, usually because a default was used somewhere.
2. **The BOM surprise** — UTF-8 files from Windows tools may start with a BOM (`ï»¿` when misread). Strip it with `Files.readString` + `replaceFirst("\uFEFF", "")` or a `BufferedReader` that skips it.
3. **`FileReader`'s hidden default charset** — it looks innocent and is almost always wrong for real-world text. Use `Files.newBufferedReader` or an explicit `InputStreamReader`.
4. **Concatenating decoded strings assuming 1 byte = 1 char** — never slice by byte offsets on decoded text; multi-byte chars break it.

## Key Takeaways

- Bytes are data; text is an interpretation of bytes defined by a charset.
- Encoding writes chars as bytes; decoding reads bytes back as chars.
- Always pass `StandardCharsets.UTF_8` explicitly — never trust platform defaults.
- `Files.readString`/`writeString`/`newBufferedReader` are the modern text I/O APIs.
- Mojibake means an encoding mismatch — fix the charset, not the data.
