---
title: Byte Array ↔ Char Array Conversion — Text and Binary Are Not the Same
summary: How byte arrays (binary data) and char arrays (text) differ in Java, the encodings that connect them, and how to convert safely in both directions without losing data or silently corrupting strings.
order: 1
minutes: 18
topics: [byte-array, char-array, charset, encoding, getBytes, new String, UTF-8, binary-vs-text]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/charset/Charset.html
---

## The Concept, From Zero

A `byte` is an 8-bit number. A `char` is a 16-bit Unicode code unit. They are not interchangeable, and confusing them is one of the most common sources of corrupted text in Java applications.

**Bytes** are how data is stored on disk, sent over a network, or written into a file. A byte has no meaning by itself — it is just 8 bits. When you read a file, you get bytes. When you receive an HTTP request body, you get bytes.

**Chars** are how Java represents text internally. A `char` holds one UTF-16 code unit, which is enough for most characters (ASCII, Latin, CJK, etc.) but not for all of them (some emoji and rare characters require two `char`s, a surrogate pair).

The conversion between bytes and chars is not a cast — it is an **encoding translation**. You must tell Java which character set (charset) to use. `UTF-8`, `ISO-8859-1`, `UTF-16` — each maps bytes to characters differently. If you pick the wrong charset, you get mojibake (garbage characters).


**What this code does — step by step:**

1. The text "hello" in UTF-8
2. 1. String → byte[] (text to bytes, for disk/network)
3. `System.out.println("UTF-8 bytes length: " + bytesUtf8.length);` — 5
4. `System.out.println("bytes as hex: " + bytesToHex(bytesUtf8));` — 68 65 6c 6c 6f
5. 2. byte[] → String (bytes back to text, using the SAME charset)
6. `System.out.println("decoded: " + decoded);` — hello
7. 3. String → char[] (text to code units, for in-memory processing)
8. `System.out.println("char count: " + chars.length);` — 5
9. `System.out.println("first char: " + chars[0]);` — h (U+0068)
10. 4. char[] → String
11. `System.out.println("from chars: " + fromChars);` — hello
12. --- The danger: wrong charset ---
13. `byte[] utf8Bytes = "café".getBytes(StandardCharsets.UTF_8);` — café → 5 bytes: 63 61 66 c3 a9
14. `String wrong = new String(utf8Bytes, StandardCharsets.ISO_8859_1);` — reads c3 a9 as two Latin chars
15. `System.out.println("wrong charset: " + wrong);` — cafÃ© ← corrupted
16. `System.out.println("right charset: " + right);` — café ← correct

The same code, clean:

```java
import java.nio.charset.StandardCharsets;

public class ByteCharConversion {
    public static void main(String[] args) {
        String text = "hello";

        byte[] bytesUtf8 = text.getBytes(StandardCharsets.UTF_8);
        System.out.println("UTF-8 bytes length: " + bytesUtf8.length);
        System.out.println("bytes as hex: " + bytesToHex(bytesUtf8));

        String decoded = new String(bytesUtf8, StandardCharsets.UTF_8);
        System.out.println("decoded: " + decoded);

        char[] chars = text.toCharArray();
        System.out.println("char count: " + chars.length);
        System.out.println("first char: " + chars[0]);

        String fromChars = new String(chars);
        System.out.println("from chars: " + fromChars);

        byte[] utf8Bytes = "café".getBytes(StandardCharsets.UTF_8);
        String wrong = new String(utf8Bytes, StandardCharsets.ISO_8859_1);
        System.out.println("wrong charset: " + wrong);

        String right = new String(utf8Bytes, StandardCharsets.UTF_8);
        System.out.println("right charset: " + right);
    }

    static String bytesToHex(byte[] bytes) {
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x ", b));
        }
        return sb.toString();
    }
}
```

Line by line:

- **`text.getBytes(StandardCharsets.UTF_8)`** — converts the String's internal UTF-16 chars into a byte array using the UTF-8 encoding. Each char is written as one or more bytes. ASCII chars like 'h' become one byte (0x68); the 'é' in "café" becomes two bytes (0xc3 0xa9) in UTF-8. This is what you write to a file or send over a socket.
- **`bytesToHex(bytesUtf8)`** — a helper that prints each byte as a two-digit hex number. This is the debugging tool you use when text looks wrong — you look at the actual bytes, not the String.
- **`new String(bytesUtf8, StandardCharsets.UTF_8)`** — reconstructs a String from the bytes using UTF-8. This is the inverse of `getBytes`. If you use the same charset on both sides, the text comes back intact.
- **`text.toCharArray()`** — copies the String's internal chars into a new `char[]` array. This gives you direct access to the UTF-16 code units. Useful for low-level text processing, but most of the time you just iterate the String with enhanced for or `charAt`.
- **`new String(chars)`** — default charset builds a String from the char array. Since `char` is already Unicode, the conversion is lossless (no encoding translation needed).
- **`"café".getBytes(UTF_8)`** — the 'é' (U+00E9) in UTF-8 is two bytes: 0xc3 0xa9. This is correct.
- **`new String(utf8Bytes, ISO_8859_1)`** — disaster. ISO-8859-1 reads each byte as one Latin character. 0xc3 becomes 'Ã' (U+00C3), 0xa9 becomes '©' (U+00A9). The two-byte UTF-8 sequence for 'é' is read as two wrong characters. This is exactly how mojibake happens in production when a UTF-8 file is read as Latin-1.
- **`new String(utf8Bytes, UTF_8)`** — correct. The two bytes are recognized as one 'é'.

The golden rule: **always specify the charset explicitly**. Never use the no-arg `getBytes()` or `new String(bytes)` — they use the platform default charset, which differs between Windows (often UTF-8 or Windows-1252), Linux (often UTF-8), and macOS (UTF-8). A JAR that works on your laptop can corrupt data in production because the default charset differs.

### Why byte[] and char[] Are Fundamentally Different

| Aspect | `byte[]` | `char[]` |
|---|---|---|
| Size | 1 byte per element (8 bits) | 2 bytes per element (16 bits, UTF-16 code unit) |
| Meaning | Raw binary — no inherent text meaning | Unicode text code units |
| Use | Files, network, cryptography, images, any binary | In-memory text manipulation |
| Encoding | N/A (it is the raw data) | N/A (it is already Unicode) |
| Conversion | Requires a Charset | Requires a Charset (to go to/from bytes) |

A `byte[]` might be a UTF-8-encoded text, a PNG image, an encrypted message, or a protocol frame. You cannot tell from the bytes alone. A `char[]` is always text — but only part of the Unicode story (it cannot hold a full supplementary character in one `char`; for that you need a `String` with a surrogate pair).


**What this code does — step by step:**

1. The emoji "😊" is U+1F60A — beyond the BMP, requires two char surrogates
2. `System.out.println("string length: " + emoji.length());` — 2 (two char code units, not one character)
3. `System.out.println("code point count: " + emoji.codePointCount(0, emoji.length()));` — 1
4. `System.out.println("char[0]: " + Integer.toHexString(chars[0]));` — d83d (high surrogate)
5. `System.out.println("char[1]: " + Integer.toHexString(chars[1]));` — de0a (low surrogate)
6. The correct way to iterate real characters, not UTF-16 code units

The same code, clean:

```java
public class CharSurrogateDemo {
    public static void main(String[] args) {
        String emoji = "😊";
        System.out.println("string length: " + emoji.length());
        System.out.println("code point count: " + emoji.codePointCount(0, emoji.length()));

        char[] chars = emoji.toCharArray();
        System.out.println("char[0]: " + Integer.toHexString(chars[0]));
        System.out.println("char[1]: " + Integer.toHexString(chars[1]));

        System.out.println("--- real characters ---");
        emoji.codePoints().forEach(cp ->
            System.out.println("code point: U+" + Integer.toHexString(cp) + " = " + new String(Character.toChars(cp))));
    }
}
```

Line by line:

- **`emoji.length()`** returns 2, not 1, because "😊" is stored as two `char` code units (a surrogate pair) in the String's internal UTF-16 array. The `length()` method counts code units, not characters.
- **`emoji.codePointCount(0, emoji.length())`** returns 1 — the actual number of Unicode characters (code points) in the string. This is what most people mean by "length."
- **`toCharArray()`** gives the two surrogate `char` values. The first is the high surrogate (0xD83D), the second is the low surrogate (0xDE0A). Together they represent U+1F60A.
- **`codePoints().forEach(...)`** — the modern, correct way to iterate Unicode characters. `codePoints()` returns an `IntStream` of Unicode code points (not `char` code units), so emoji, rare CJK characters, and other supplementary characters are handled correctly as single items.

### Real-World Scenarios

**Scenario 1: Reading a file with the wrong encoding (the most common bug).** You receive a CSV file from a legacy system that was saved in Windows-1252. Your code uses `new String(bytes)` (platform default = UTF-8) and the names come back corrupted — "José" becomes "JosÃ©". The fix: find out the actual encoding and pass it explicitly: `new String(bytes, StandardCharsets.ISO_8859_1)` or `new InputStreamReader(fileStream, Charset.forName("windows-1252"))`.

**Scenario 2: Storing text in a database or cache that only accepts bytes.** You convert a String to `byte[]` with `UTF-8` and store it. When you read it back, you convert with `new String(bytes, UTF_8)`. The round-trip is lossless as long as the same charset is used both times. This is how text is stored in many binary protocols and key-value stores.

**Scenario 3: Receiving HTTP request bodies.** The HTTP headers may declare `Content-Type: text/html; charset=ISO-8859-1`. Your code must read the body as bytes and decode with the declared charset, not assume UTF-8. If you ignore the declared charset and use UTF-8, pages with Latin-1 characters break. Spring's `HttpInputMessage` and `@RequestBody` handle this for you when configured correctly — but if you read the raw bytes yourself, you must honor the charset.

**Scenario 4: Encryption and hashing.** You hash a password or encrypt a message. The input must be bytes. You convert the String to bytes with UTF-8 (consistent, predictable) before feeding it to the cryptographic function. Never use the platform default — a password hashed on Windows with default charset Windows-1252 will not match the same password hashed on Linux with UTF-8 if you used the no-arg `getBytes()`.

### Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|---|
| Using `new String(bytes)` without a charset | Convenience — the no-arg constructor exists | Always pass `StandardCharsets.UTF_8` or the actual charset |
| Using `String.getBytes()` without a charset | Same convenience trap | Always pass `StandardCharsets.UTF_8` or the actual charset |
| Assuming `char` = one visible character | `char` is a UTF-16 code unit, not a code point | Use `codePointCount()`, `codePoints()`, and `new String(Character.toChars(cp))` for real character handling |
| Converting bytes to String with the wrong charset | Not checking what encoding the bytes are really in | Track the charset as part of the data contract — files, HTTP headers, DB columns all declare their encoding |
| Mixing char[] and byte[] in the same operation | Thinking "text is bytes" or "bytes are text" | Decide at the boundary: bytes for I/O, chars for in-memory text. Convert only at the boundary with an explicit charset |
| Using `ISO_8859_1` as a "universal" fallback | It reads any byte without error (all 256 byte values map to a char) | It silently corrupts non-Latin data. UTF-8 is the default for new systems; legacy systems use their actual encoding |

## For the Practice Lab

In the lab, you will start with a byte array that encodes "cafétière" in UTF-8. You will convert it to a String with the correct charset, print the result, then deliberately convert it with the wrong charset and see the corruption. Then you will fix it. Next, you will write a program that reads a list of strings, converts each to a UTF-8 byte array, writes them to a file, reads the file back as bytes, and decodes them — a complete round-trip. You will verify the bytes on disk match what you expect using a hex dump. Finally, you will write a utility that detects whether a byte array is valid UTF-8 by attempting to decode it and catching `MalformedInputException` (when using `CharsetDecoder`), learning that some byte sequences are simply not valid UTF-8.

## Summary

Bytes and chars are different types with different purposes — bytes are binary data (files, network, crypto), chars are UTF-16 text code units for in-memory manipulation. Converting between them requires an explicit charset; `UTF-8` is the modern default. Always pass the charset to `getBytes(charset)` and `new String(bytes, charset)` — never use the platform-default versions, because the default differs between machines. A `char` is not one visible character; supplementary characters (emoji, rare CJK) take two `char`s (a surrogate pair). Use `codePoints()` to iterate real Unicode characters. The wrong charset turns "café" into "cafÃ©" — and that bug is entirely preventable by always naming the charset.

## References

- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html)
