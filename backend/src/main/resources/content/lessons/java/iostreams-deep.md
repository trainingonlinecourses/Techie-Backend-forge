---
title: Java IO Streams — Byte Streams, Character Streams, and NIO Channels
summary: The InputStream/OutputStream vs Reader/Writer split, buffered I/O, try-with-resources, NIO channels and buffers, and when to pick NIO over classic IO for high-throughput file and network operations.
order: 42
minutes: 22
topics: [inputstream, outputstream, reader, writer, buffered-io, try-with-resources, nio-channel, nio-buffer, memory-mapped]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/io/
  - https://docs.oracle.com/javase/tutorial/essential/io/streams.html
---

# Java IO Streams — Byte Streams, Character Streams, and NIO Channels

## The concept

Java I/O has two parallel hierarchies:

1. **Byte streams** (`InputStream` / `OutputStream`) — operate on raw bytes. Used for binary data (images, serialized objects, network packets).
2. **Character streams** (`Reader` / `Writer`) — operate on characters, handling encoding/decoding. Used for text (CSV, JSON, log files).

The key mistake teams make: using byte streams for text. When you read text with `InputStream`, you get raw bytes. You must decode them to characters yourself. `Reader` does this automatically using a `Charset` (UTF-8 by default).

**NIO** (New I/O, Java 1.4+) adds **channels and buffers** — a buffer-oriented approach that is faster for large file operations and network I/O because it can use OS-level operations like memory-mapped files and zero-copy transfers.

## Classic IO: the decorator pattern

Java IO is built on the **decorator pattern**: you wrap a base stream in progressively more capable wrappers.

```java
// Base: a raw byte stream from a file
InputStream raw = new FileInputStream("data.bin");

// Decorator: buffered (reduces system calls by reading chunks)
InputStream buffered = new BufferedInputStream(raw);

// Decorator: GZip decompression
InputStream decompressed = new GZIPInputStream(buffered);

// Now read — every read() goes through GZip → Buffered → File
byte[] data = decompressed.readAllBytes();
```

Each wrapper adds a capability without the others knowing. This is elegant but verbose — Java 7's try-with-resources simplifies cleanup:

```java
try (InputStream in = new GZIPInputStream(new BufferedInputStream(new FileInputStream("data.bin")))) {
    byte[] data = in.readAllBytes();
    // process data
}  // automatically closed in reverse order, even on exception
```

## Character streams: Reader/Writer

```java
// Reading text — Reader handles encoding
try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(new FileInputStream("orders.csv"), StandardCharsets.UTF_8))) {

    String line;
    while ((line = reader.readLine()) != null) {
        String[] fields = line.split(",");
        processOrder(fields);
    }
}

// Writing text — Writer handles encoding
try (BufferedWriter writer = new BufferedWriter(
        new OutputStreamWriter(new FileOutputStream("output.txt"), StandardCharsets.UTF_8))) {
    writer.write("Order processed");
    writer.newLine();
}
```

**Java 8+ simplification:** `Files.newBufferedReader()` and `Files.newBufferedWriter()` eliminate the decorator chain:

```java
try (BufferedReader reader = Files.newBufferedReader(Path.of("orders.csv"), StandardCharsets.UTF_8)) {
    reader.lines().forEach(this::processOrder);
}
```

**Java 11+ further simplification:** `readString()` and `writeString()`:

```java
String content = Files.readString(Path.of("config.yml"));
Files.writeString(Path.of("output.txt"), "Order processed\n");
```

## NIO: channels and buffers

NIO flips the model. Instead of reading bytes one at a time into a variable, you read into a **buffer** and then process the buffer's contents in bulk.

```java
try (FileChannel channel = FileChannel.open(Path.of("large-data.bin"), StandardOpenOption.READ)) {

    ByteBuffer buffer = ByteBuffer.allocate(8192);  // 8KB buffer

    while (channel.read(buffer) > 0) {  // read into buffer
        buffer.flip();                   // switch from write-mode to read-mode
        while (buffer.hasRemaining()) {
            processByte(buffer.get());   // read from buffer
        }
        buffer.clear();                  // reset for next read
    }
}
```

**Buffer modes:**
- **Write mode** (after `allocate` or `clear`): `put()` writes data into the buffer.
- **Read mode** (after `flip`): `get()` reads data from the buffer.
- `flip()` sets the limit to the current position and resets position to 0 — making only the written data readable.

**Memory-mapped files** — map a file directly into the JVM's address space. The OS handles paging; no explicit `read()` needed:

```java
try (FileChannel channel = FileChannel.open(Path.of("huge-database.db"), StandardOpenOption.READ)) {

    MappedByteBuffer mapped = channel.map(
        FileChannel.MapMode.READ_ONLY, 0, channel.size());

    // Access file contents as if they were a byte array
    // The OS pages data in/out as needed — no explicit read calls
    byte first = mapped.get(0);
    byte last = mapped.get((int) (channel.size() - 1));
}
```

Memory-mapped files are ideal for random-access databases, large configuration files, and IPC.

## How we use it in organizations

### Scenario 1: streaming CSV processing — avoid loading the entire file

```java
@Service
public class CsvOrderProcessor {

    public void processOrders(Path csvFile) {
        try (BufferedReader reader = Files.newBufferedReader(csvFile, StandardCharsets.UTF_8)) {
            String header = reader.readLine();  // skip header

            reader.lines()
                .filter(line -> !line.isBlank())
                .map(this::parseOrder)
                .forEach(this::saveOrder);  // each line processed as it's read
        }
    }

    private Order parseOrder(String line) {
        String[] fields = line.split(",");
        return new Order(fields[0], new BigDecimal(fields[1]), fields[2]);
    }
}
```

A 2GB CSV file is processed line by line — memory usage stays constant at ~8KB regardless of file size.

### Scenario 2: file upload with NIO transfer

```java
@RestController
@RequestMapping("/api/uploads")
public class UploadController {

    @PostMapping
    public ResponseEntity<Void> upload(MultipartFile file) throws IOException {
        Path target = Path.of("/data/uploads", UUID.randomUUID() + getExtension(file));

        // NIO transfer — efficient for large files
        try (InputStream in = file.getInputStream();
             OutputStream out = Files.newOutputStream(target)) {
            in.transferTo(out);  // uses sendfile(2) on Linux — zero-copy
        }

        return ResponseEntity.ok().build();
    }
}
```

`InputStream.transferTo()` uses OS-level zero-copy when available (Linux `sendfile`), avoiding a user-space buffer copy.

### Scenario 3: writing audit logs with NIO

```java
@Component
public class AuditLogWriter {

    private final Path logDir = Path.of("/var/log/audit");

    public void writeEntry(AuditEntry entry) {
        String line = Instant.now() + "|" + entry.userId() + "|" + entry.action() + "\n";

        // Atomic append — each write is a single system call
        try (FileChannel ch = FileChannel.open(
                logDir.resolve("audit.log"),
                StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {

            ByteBuffer buf = ByteBuffer.wrap(line.getBytes(StandardCharsets.UTF_8));
            while (buf.hasRemaining()) {
                ch.write(buf);  // guaranteed atomic for buffers < PIPE_BUF (4KB on Linux)
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
```

## When to use what

| Scenario | Use |
|---|---|
| Reading small text files (< 1MB) | `Files.readString()` |
| Reading large text files line by line | `Files.newBufferedReader()` + `lines()` |
| Binary data (images, serialization) | `InputStream` / `OutputStream` |
| Large files (> 100MB) | NIO `FileChannel` + `ByteBuffer` |
| Random access into large files | Memory-mapped `MappedByteBuffer` |
| Network sockets | NIO `SocketChannel` (for high concurrency) |

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `FileInputStream` for text | Wrong encoding, corrupted characters |
| Not using try-with-resources | Resource leaks — file handles exhausted |
| Small buffer size (1024 bytes) | Excessive system calls — slow |
| Memory-mapping a file larger than 2GB (32-bit JVM) | `OutOfMemoryError` — use FileChannel instead |
| Forgetting `buffer.flip()` after write | Reads garbage or nothing from buffer |
