---
title: NIO Networking — Selectors and Non-Blocking I/O
module: java-networking
order: 4
minutes: 28
topics: ["NIO", "Selector", "non-blocking", "Channel", "reactor pattern", "scalability"]
summary: The classic server is one thread per client. It works until you have thousands of concurrent connections: each thread costs ~1MB of stack and sched...
docs:
  - title: "Selector (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/channels/Selector.html"
  - title: "Non-blocking I/O (Java Tutorials)"
    url: "https://docs.oracle.com/javase/tutorial/essential/io/nio.html"
---

# NIO Networking — Selectors and Non-Blocking I/O

## The Concept: Serving Thousands Without a Thread Each

The classic server is one thread per client. It works until you have thousands of concurrent connections: each thread costs ~1MB of stack and scheduling overhead, and at 10,000 clients you're out of memory long before you're out of work. **NIO (New I/O, since Java 1.4)** attacks the problem differently: **non-blocking channels + a single selector thread**.

**The mental model:** imagine a hotel concierge with a switchboard of blinking lights. The thread-per-client model assigns a dedicated operator to every guest — expensive. The NIO model has ONE operator watching the whole switchboard. When a line blinks (a client has data ready), the operator handles that line *then moves on*. Idle clients cost nothing — no thread is waiting on them. The switchboard is the **`Selector`**; the blinking lights are **readiness events** ("this channel has data to read", "this channel can accept writes").

This is the **reactor pattern** — the architecture behind Netty, Node.js, Redis's single-threaded server, and Spring WebFlux's Netty-based engine. When you hear "event loop" or "reactive," this is the mechanism underneath.

## The Core Pieces

```java
import java.nio.ByteBuffer;
import java.nio.channels.*;
import java.net.*;
import java.util.*;

public class NioServer {
    public static void main(String[] args) throws Exception {
        // 1. The selector — ONE operator watching all channels.
        Selector selector = Selector.open();

        // 2. Open a server channel and put it in NON-BLOCKING mode.
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(9091));
        server.configureBlocking(false);          // the key line!

        // 3. Register the server channel with the selector, saying:
        //    "tell me when a new connection is ready to accept."
        server.register(selector, SelectionKey.OP_ACCEPT);
        System.out.println("NIO server on port 9091");

        // 4. The event loop — keep watching until told to stop.
        while (true) {
            // BLOCK here until at least one channel has an event.
            selector.select();                    // blocks!
            // Now collect the events that are ready.
            Set<SelectionKey> ready = selector.selectedKeys();
            Iterator<SelectionKey> it = ready.iterator();

            while (it.hasNext()) {
                SelectionKey key = it.next();
                it.remove();   // MUST remove — else it reprocesses forever

                if (key.isAcceptable()) {
                    // A new client is connecting.
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    // Register the client for READ events.
                    client.register(selector, SelectionKey.OP_READ);
                    System.out.println("Client connected");
                } else if (key.isReadable()) {
                    // A client sent data — read it without blocking.
                    SocketChannel client = (SocketChannel) key.channel();
                    ByteBuffer buffer = ByteBuffer.allocate(1024);
                    int read = client.read(buffer);
                    if (read == -1) {
                        client.close();      // client closed the connection
                    } else {
                        buffer.flip();
                        String msg = new String(buffer.array(), 0, buffer.limit());
                        System.out.println("Received: " + msg);
                        // (Echo back: write a flipped buffer to the channel)
                        client.write(ByteBuffer.wrap(("echo: " + msg).getBytes()));
                    }
                }
            }
        }
    }
}
```

**Walking through it, line by line:**

- `Selector.open()` creates the operator. `ServerSocketChannel.open()` + `bind` creates the listening socket; `configureBlocking(false)` is what switches it to non-blocking mode — **without this, register() throws** `IllegalBlockingModeException`.

- `server.register(selector, SelectionKey.OP_ACCEPT)` subscribes to the "ready to accept" event. `SelectionKey` is the *registration token* — it pairs a channel with the selector and carries which operations you're interested in (`OP_ACCEPT`, `OP_READ`, `OP_WRITE`, `OP_CONNECT`).

- `selector.select()` **blocks the single thread** until *some* registered channel has a ready event. This is the beauty: one thread, blocked on one call, wakes only when there's actual work. When it returns, `selectedKeys()` contains the events.

- The loop must call `it.remove()` after handling each key — a classic NIO bug: if you forget, the same event is reprocessed on the next `select()` and you get infinite loops or duplicate handling.

- For `OP_ACCEPT`: `server.accept()` returns a `SocketChannel` — the conversation. It too must be `configureBlocking(false)` and registered for `OP_READ`.

- For `OP_READ`: `client.read(buffer)` returns the byte count, or `-1` meaning EOF (client closed). Note the non-blocking semantics: if no data were available, we wouldn't *be* here — the selector only woke us because data arrived. The `ByteBuffer` is read with `flip()` (limit = position, position = 0) before extracting the string.

## Why This Scales: The Numbers

Thread-per-client with 10,000 connections = 10,000 threads ≈ 10GB of stacks + brutal context switching. The selector model with 10,000 connections = **1 thread + 10,000 channels** registered as events. Memory per idle connection drops to kilobytes. This is why high-concurrency servers (Redis, Netty, modern web servers) use it — and why the JVM added two more layers on top:

- **NIO.2 (Java 7)** — `AsynchronousSocketChannel` / `AsynchronousServerSocketChannel`, which push the *event notification* into the OS (IOCP on Windows, epoll on Linux) and call your completion handlers on pool threads. Same philosophy, less manual loop code.
- **Virtual threads (Java 21)** — a different answer to the same problem: make threads so cheap you can go back to the *simple* blocking style. The JVM parks a virtual thread on blocking I/O and unmounts it from the carrier thread, achieving comparable scalability with ordinary code.

## The Trade-Off: Power vs Complexity

NIO is powerful but *harder to write correctly* than blocking I/O. The event loop forces you to manage state across callbacks ("this client is halfway through sending a multi-part message — where did I leave off?"), handle partial reads (a message may arrive in several chunks), and think about backpressure (what if the client reads slower than you write?). **This is why production code rarely uses raw NIO** — it uses Netty or Spring WebFlux, which encapsulate all of it. Your practical takeaway: understand the selector model (it's the theory behind every modern server), but use the frameworks rather than hand-rolling event loops.

## Buffers: The NIO Data Type

NIO replaces streams with **`ByteBuffer`** — a positioned view over a byte array with four key properties: `position` (where you're reading/writing), `limit` (end of valid data), `capacity` (total size), and `flip()` (prepare for reading after writing). The classic choreography:

```java
ByteBuffer buf = ByteBuffer.allocate(1024);
channel.read(buf);      // channel writes INTO the buffer; position advances
buf.flip();             // flip: limit = position; position = 0  -> ready to read
byte[] data = new byte[buf.remaining()];
buf.get(data);          // read the data out
buf.clear();            // reset for reuse
```

Mastering `flip`/`clear` is the NIO rite of passage — get them backwards and you read stale data or nothing at all.

## Recap

NIO networking replaces "a thread per client" with a single selector thread watching many non-blocking channels: register channels for interest (`OP_ACCEPT`, `OP_READ`), call `select()` to block until events arrive, and handle each ready channel without blocking. It's the reactor pattern behind Netty, Node.js, and WebFlux, and it scales to tens of thousands of connections on one thread. The cost is complexity — partial reads, state across callbacks, buffer management — which is why you should *understand* NIO but *use* the frameworks built on it. And remember the alternatives: NIO.2's async channels and Java 21's virtual threads solve the same scaling problem in different ways, each with its own sweet spot.
