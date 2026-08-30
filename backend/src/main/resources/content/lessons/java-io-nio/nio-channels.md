---
title: NIO Channels and Buffers — Non-Blocking I/O
module: java-io-nio
order: 3
minutes: 27
topics: ["NIO", "ByteBuffer", "Channels", "non-blocking", "Selector", "FileChannel"]
summary: The classic java.io streams are blocking: when you call in.read(), your thread sits and waits until bytes actually arrive. For a simple file copy t...
docs:
  - title: "java.nio package summary"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/package-summary.html"
---

# NIO Channels and Buffers — Non-Blocking I/O

## The Concept: Why Java Needed a Second I/O Model

The classic `java.io` streams are **blocking**: when you call `in.read()`, your thread sits and waits until bytes actually arrive. For a simple file copy that's fine. But think about a chat server with 10,000 connected clients. The naive blocking design needs **one thread per client** — and each thread costs about 1 MB of stack. 10,000 clients = 10 GB of thread stacks and brutal context switching. Servers that scale need a different idea.

**NIO** (New I/O, `java.nio`, Java 1.4) introduced:

- **Channels** — the connection to the I/O source (file, socket), roughly like streams but more capable.
- **Buffers** — the memory area data is read into / written from.
- **Selectors** — the killer feature: one thread monitors *many* channels and gets told which ones are ready to read/write. This is how you serve thousands of connections with a handful of threads.

The modern practical note: for *application* code, `java.io` with `Buffered*` and the `Files.*` helpers is usually enough, and **Java 21's virtual threads** (see the concurrency module) let you write blocking-style code that scales like NIO. But NIO remains the foundation underneath most high-performance Java servers (Netty, Tomcat's connector, gRPC, reactive stacks), so understanding buffers/channels/selectors matters.

## The Heart of NIO: The Buffer's Position Model

A `ByteBuffer` is a fixed-size byte array with **four pointers** describing where you are:

- **capacity** — total size (never changes).
- **position** — where the next read/write happens.
- **limit** — where reading/writing must stop.
- **mark** — a bookmark you can return to (optional).

The critical mental model: **flip() and compact()**.

- After **writing** into the buffer, `position` is at the end. To **read** what you wrote, call `flip()`: it sets `limit = position`, `position = 0`. Now reads walk from 0 to the limit.
- After **reading** everything, `clear()` resets for fresh writing (`position = 0, limit = capacity`).
- `compact()` keeps the *unread* data, shifts it to the front, and prepares for more writing — used in partial-read scenarios (the classic "read leftover, then keep going" pattern).

## The Code Walkthrough

```java
import java.io.*;
import java.nio.*;
import java.nio.channels.*;
import java.nio.charset.StandardCharsets;

public class NioDemo {

    public static void main(String[] args) throws IOException {
        // ---- 1. A tiny ByteBuffer lifecycle ----
        ByteBuffer buf = ByteBuffer.allocate(32);
        System.out.println("after allocate: pos=" + buf.position()
                + " limit=" + buf.limit() + " cap=" + buf.capacity());

        // Write "hi" into it (2 bytes)
        buf.put((byte) 'h');
        buf.put((byte) 'i');
        System.out.println("after put x2:   pos=" + buf.position());  // 2

        // Switch to read mode
        buf.flip();
        System.out.println("after flip:     pos=" + buf.position()
                + " limit=" + buf.limit());                            // 0 / 2

        // Read both bytes back
        while (buf.hasRemaining()) {
            System.out.print((char) buf.get());
        }
        System.out.println();

        // ---- 2. Channel + Buffer: write a file, read it back ----
        Path file = Path.of("nio-demo.txt");
        String content = "NIO channels are fast.";

        try (FileChannel channel = FileChannel.open(file,
                StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            ByteBuffer out = ByteBuffer.wrap(content.getBytes(StandardCharsets.UTF_8));
            while (out.hasRemaining()) {
                channel.write(out);   // may write partially — loop until done
            }
        }

        try (FileChannel channel = FileChannel.open(file, StandardOpenOption.READ)) {
            ByteBuffer in = ByteBuffer.allocate(128);
            int n = channel.read(in);       // reads into the buffer, returns count
            System.out.println("read " + n + " bytes");
            in.flip();
            System.out.println(StandardCharsets.UTF_8.decode(in));
        }
    }
}
```

### Walking Through Each Part

**Part 1 — the buffer lifecycle.** Watch the pointers:

- `allocate(32)` → position 0, limit 32, capacity 32. Fresh, ready to write.
- Two `put`s → position 2. The buffer now holds `h`, `i` at indices 0 and 1.
- `flip()` → position 0, limit 2. The buffer is now in **read mode**: reading walks from index 0 up to index 2, which is exactly the data we wrote.
- `hasRemaining()`/`get()` → prints `hi`.

If we had called `get()` without flipping, we'd read zeros from index 2 onward — a classic NIO bug. **Always flip after writing before reading.**

**Part 2 — channel file I/O.** Two details matter:

- `channel.write(out)` can write **partially** (especially on sockets): it writes some bytes and returns how many. The loop `while (out.hasRemaining()) channel.write(out)` guarantees everything is written. For `FileChannel` writes are usually complete, but the loop is the safe universal pattern.
- `channel.read(in)` reads into the buffer and returns the byte count. We then `flip()` and decode. `StandardCharsets.UTF_8.decode(in)` converts the buffer's bytes to a `String` — the buffer's remaining region (`position`..`limit`) is what's decoded.

## Selectors — Many Connections, Few Threads

The pattern that powers high-concurrency servers:

```java
Selector selector = Selector.open();
SocketChannel ch = SocketChannel.open();
ch.configureBlocking(false);                    // non-blocking mode
ch.register(selector, SelectionKey.OP_READ);    // "tell me when readable"

while (true) {
    selector.select();                          // BLOCKS until some channel is ready
    for (SelectionKey key : selector.selectedKeys()) {
        if (key.isReadable()) {
            // read from the ready channel without blocking
        }
    }
}
```

The concept: instead of one thread per connection waiting on a read, one thread calls `select()`, which sleeps until *any* of the thousands of registered channels has data ready. The OS tells the selector which keys are ready; the thread processes just those, then loops. This is the **event loop / reactor** model — one thread serving thousands of connections.

The channels must be in **non-blocking mode** (`configureBlocking(false)`) for this to work, and file channels can't be non-blocking (they're always ready) — selectors are for sockets, pipes, and network channels.

## When to Use What (Practical Guidance)

| Situation | Use |
|---|---|
| Reading/writing small files | `Files.readString` / `writeString` / `readAllBytes` |
| Copying a large file | `Files.copy(from, to)` — one line, done |
| Streaming large text | `BufferedReader` / `Files.lines()` |
| High-concurrency servers (thousands of sockets) | NIO channels + selector, or Netty/WebFlux on top |
| Virtual-thread-friendly blocking I/O (Java 21+) | Plain `java.io` — virtual threads make blocking cheap |

Rule of thumb: **write your app code with blocking I/O**; let the frameworks (Tomcat, Netty, WebFlux) do NIO underneath. Only hand-roll selectors when you're building a networking library.

## Common Beginner Pitfalls

1. **Forgetting `flip()` after writing** — you read zeros / stale data.
2. **`read`/`write` partial transfers** — always loop until `hasRemaining()` is false or `read` returns -1.
3. **Blocking mode confusion** — a blocking channel in a selector loop freezes the loop; `configureBlocking(false)` first.
4. **Buffer size assumptions** — a `read` may fill only part of the buffer; the returned count tells you how many bytes are valid.
5. **Reaching for NIO for a config file** — overkill. Use the `Files.*` helpers.

## Key Takeaways

- NIO = Channels (connections) + Buffers (memory) + Selectors (many-to-one readiness).
- The buffer pointer model: write → `flip()` → read → `clear()`/`compact()`.
- `flip()` sets `limit = position; position = 0` — the read/write mode switch.
- `write`/`read` may transfer partially — loop until done.
- Selectors let one thread serve thousands of sockets (the reactor pattern).
- For everyday app code, prefer `java.io` + `Files.*`; NIO is the substrate under high-performance frameworks.
