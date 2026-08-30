---
title: I/O Streams — Bytes and the Stream Model
module: java-io-nio
order: 1
minutes: 26
topics: ["InputStream", "OutputStream", "byte streams", "buffering", "try-with-resources"]
summary: Think of water flowing through a pipe. You don't load the entire ocean into the pipe at once — water arrives continuously, in whatever amount the p...
docs:
  - title: "java.io package summary"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/package-summary.html"
---

# I/O Streams — Bytes and the Stream Model

## The Concept: What Is a Stream?

Think of water flowing through a pipe. You don't load the entire ocean into the pipe at once — water arrives continuously, in whatever amount the pipe delivers at each moment, and you take what you need as it flows.

Java's **streams** (the `java.io` ones — completely different from the *collection streams* of the Stream API) work the same way. An `InputStream` is a *source* of bytes you read one chunk at a time; an `OutputStream` is a *sink* you push bytes into. Both are **unidirectional** (one direction only) and **sequential** (you consume in order; you can't jump around like in an array).

The crucial property: **you never have the whole data in memory**. Whether the source is a 10-byte string or a 10 GB file, you process it in the same way — read a chunk, process it, read the next chunk. This is why streams are the universal model for files, sockets, HTTP bodies, and pipes.

## The Two Families

### Byte streams — read/write raw bytes

- `InputStream` (abstract) → `FileInputStream`, `ByteArrayInputStream`, `BufferedInputStream`, `ObjectInputStream`, ...
- `OutputStream` (abstract) → `FileOutputStream`, `ByteArrayOutputStream`, `BufferedOutputStream`, `ObjectOutputStream`, ...

### Character streams — read/write text (chars, handles encodings)

- `Reader` (abstract) → `FileReader`, `BufferedReader`, `StringReader`, `InputStreamReader`, ...
- `Writer` (abstract) → `FileWriter`, `BufferedWriter`, `StringWriter`, `OutputStreamWriter`, ...

The `InputStreamReader`/`OutputStreamWriter` adapters bridge the two: they convert bytes ↔ chars using a charset (UTF-8 by default).

## The Code Walkthrough

```java
import java.io.*;

public class StreamDemo {

    public static void main(String[] args) throws IOException {
        // 1. WRITE bytes to a file
        byte[] data = "hello streams".getBytes(java.nio.charset.StandardCharsets.UTF_8);
        try (OutputStream out = new BufferedOutputStream(new FileOutputStream("out.bin"))) {
            out.write(data);
        }   // <- try-with-resources closes the stream (and flushes) automatically

        // 2. READ bytes back, chunk by chunk
        try (InputStream in = new BufferedInputStream(new FileInputStream("out.bin"))) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = in.read(buffer)) != -1) {
                // process the chunk: bytesRead tells us how many bytes are valid
                System.out.println("read " + bytesRead + " bytes");
            }
        }

        // 3. READ TEXT line by line (character stream)
        try (BufferedReader reader = new BufferedReader(new FileReader("out.bin"))) {
            String line;
            while ((line = reader.readLine()) != null) {
                System.out.println("line: " + line);
            }
        }
    }
}
```

### Walking Through Each Part

**Part 1 — writing with decoration.** `new FileOutputStream("out.bin")` is the raw byte sink to the file. Wrapping it in `BufferedOutputStream` adds an internal buffer (8 KB by default): the `write` calls land in the buffer, and the buffer is flushed to disk in bigger, fewer system calls. **Decorating** — wrapping one stream in another to add behavior — is the core design pattern of `java.io` (it's the Decorator pattern).

**Part 2 — reading in a loop.** The universal read idiom:

```java
byte[] buffer = new byte[4096];
int bytesRead;
while ((bytesRead = in.read(buffer)) != -1) { ... }
```

`read(buffer)` fills up to `buffer.length` bytes and returns how many it actually got — which can be **less than requested** (a stream delivers whatever is available). `-1` means end of stream. Always loop on the *returned count*, never assume the buffer is full. This pattern handles files, sockets, and pipes identically.

**Part 3 — character reading.** `FileReader` reads chars; `BufferedReader.readLine()` gives whole lines, which is what you want for text files, logs, CSV rows. `BufferedReader` also lets you `readLine()` lazily — you never load the whole file into memory.

## Why try-with-resources Is Non-Negotiable

```java
try (OutputStream out = ...) {
    ...
}   // out.close() called automatically, even if an exception is thrown
```

Streams hold **OS resources** (file handles, sockets). If you forget to close, you leak handles until the process runs out. `try-with-resources` (Java 7+) guarantees `close()` runs on every exit path — normal or exceptional. Closing also **flushes** buffered writers, so data you wrote actually reaches the file.

Never do the old-style manual close in `finally` unless you're on truly ancient Java:

```java
// DON'T write this in modern Java:
OutputStream out = null;
try { out = ...; ... } finally { if (out != null) out.close(); }
```

## The Decorator Pattern in Practice

Streams compose, and the composition is the feature:

```java
// Reading a compressed text file with an explicit charset:
try (BufferedReader r = new BufferedReader(
        new InputStreamReader(
            new GZIPInputStream(
                new FileInputStream("log.txt.gz")),
            StandardCharsets.UTF_8))) {
    String line;
    while ((line = r.readLine()) != null) System.out.println(line);
}
```

Reading the chain **from the inside out**: `FileInputStream` gets bytes from the file → `GZIPInputStream` decompresses them → `InputStreamReader` decodes bytes to chars (UTF-8) → `BufferedReader` groups chars into lines. Each layer adds one behavior. This is why stream-based code is so flexible — and why it looks nested.

## InputStream vs Files.readAllBytes — When Is the Loop Worth It?

For **small** files, Java 11+ gives a one-liner:

```java
String content = Files.readString(Path.of("out.bin"));   // loads whole file
```

This is clean for config files and templates. But it loads everything into memory — for a 2 GB log you'd die. Rule of thumb:

- **Small, known-size files** (configs, templates, JSON bodies): `Files.readString` / `readAllBytes`.
- **Large or unknown-size data** (logs, uploads, sockets, streaming APIs): the chunked read loop, or `Files.lines()` / `BufferedReader`.

## Common Beginner Pitfalls

1. **Not closing streams** → leaked file handles. Always `try-with-resources`.
2. **Assuming `read(buffer)` fills the buffer** — it returns how many bytes it got; loop on the return value.
3. **Mixing byte and char streams** — reading a text file as bytes then calling `toString()` gives mojibake; use `Reader`/`Writer` (or specify the charset).
4. **Forgetting `flush()`** — buffered writers may hold data; closing flushes, but if you must see it before closing, call `flush()`.
5. **`FileReader`/`FileWriter` use the platform default charset** — on a server that's often not UTF-8; prefer `Files.readString`/`writeString` or explicit charset constructors.

## Key Takeaways

- Streams deliver data in chunks — you never hold the whole payload in memory.
- Byte streams (`InputStream`/`OutputStream`) for raw data; character streams (`Reader`/`Writer`) for text.
- Decorate to add behavior: `Buffered*`, `GZIP*`, charset adapters.
- The `while ((n = read(buf)) != -1)` loop is the universal read idiom.
- Always close with try-with-resources — it flushes and frees OS handles.
