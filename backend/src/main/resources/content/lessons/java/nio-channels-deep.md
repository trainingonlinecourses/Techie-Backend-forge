---
title: Java NIO Networking — Non-blocking I/O with Selectors
summary: NIO channels, buffers, selectors, non-blocking I/O, the reactor pattern, socket programming with NIO, and how high-performance servers handle thousands of connections without thousands of threads.
order: 52
minutes: 22
topics: [nio, channel, buffer, selector, non-blocking, reactor-pattern, socket-channel, bytebuffer]
docs:
  - https://docs.oracle.com/javase/tutorial/nio/index.html
---

# Java NIO Networking — Non-blocking I/O with Selectors

## The concept

**NIO (New I/O)** is Java's non-blocking I/O API. Unlike traditional I/O (which blocks a thread while waiting for data), NIO uses **channels** and **selectors** to handle many connections with few threads.

The core idea is the **Reactor pattern**: one thread monitors multiple channels using a selector. When data arrives on any channel, the selector notifies the reactor, which dispatches the work to a thread pool. This means thousands of connections can be managed by a handful of threads.

**Traditional I/O vs NIO:**

| Aspect | Traditional I/O | NIO |
|---|---|---|
| Data unit | Stream (byte stream) | Buffer (array of bytes) |
| Blocking | Blocks thread on read/write | Non-blocking — returns immediately |
| Multiplexing | One thread per connection | One thread monitors many connections |
| Scalability | ~10K threads max | ~100K+ connections with few threads |

## Core NIO components

**Channel** — A bidirectional connection to an I/O resource (file, socket). Unlike streams, channels can read AND write.

**Buffer** — A container for data. All reads and writes go through buffers. The key operations are `put()` (write to buffer), `flip()` (switch from write to read mode), `get()` (read from buffer), and `clear()`/`compact()` (reset).

**Selector** — Monitors multiple channels for events (data ready to read, ready to write, connection accepted). One thread can monitor hundreds of channels.

## How we use it in organizations

### Scenario 1: Non-blocking TCP server

A chat server handling thousands of connections with a single selector thread:

```java
public class ChatServer {
    private final Selector selector;
    private final ServerSocketChannel serverChannel;

    public ChatServer(int port) throws IOException {
        selector = Selector.open();
        serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(port));
        serverChannel.configureBlocking(false);  // non-blocking!
        serverChannel.register(selector, SelectionKey.OP_ACCEPT);
    }

    public void start() throws IOException {
        System.out.println("Chat server listening on port " +
            serverChannel.socket().getLocalPort());

        while (true) {
            selector.select();  // blocks until at least one channel is ready

            Set<SelectionKey> keys = selector.selectedKeys();
            Iterator<SelectionKey> iter = keys.iterator();

            while (iter.hasNext()) {
                SelectionKey key = iter.next();
                iter.remove();  // must remove — selector doesn't do it

                if (key.isAcceptable()) {
                    handleAccept(key);
                } else if (key.isReadable()) {
                    handleRead(key);
                } else if (key.isWritable()) {
                    handleWrite(key);
                }
            }
        }
    }

    private void handleAccept(SelectionKey key) throws IOException {
        SocketChannel client = ((ServerSocketChannel) key.channel()).accept();
        client.configureBlocking(false);
        client.register(selector, SelectionKey.OP_READ);
        System.out.println("Client connected: " + client.getRemoteAddress());
    }

    private void handleRead(SelectionKey key) throws IOException {
        SocketChannel channel = (SocketChannel) key.channel();
        ByteBuffer buffer = ByteBuffer.allocate(1024);

        int bytesRead = channel.read(buffer);
        if (bytesRead == -1) {
            channel.close();  // client disconnected
            return;
        }

        buffer.flip();
        String message = StandardCharsets.UTF_8.decode(buffer).toString();
        broadcast(message, channel);  // send to all other clients
    }

    private void broadcast(String message, SocketChannel sender) throws IOException {
        ByteBuffer buffer = ByteBuffer.wrap(
            (">>> " + message).getBytes(StandardCharsets.UTF_8));

        for (SelectionKey key : selector.keys()) {
            if (key.channel() instanceof SocketChannel client
                    && client != sender && key.isValid()) {
                client.write(buffer.duplicate());  // duplicate() because write is partial
                buffer.rewind();
            }
        }
    }
}
```

### Scenario 2: Buffer operations in depth

Understanding buffer states:

```java
// Writing to a buffer
ByteBuffer buffer = ByteBuffer.allocate(100);
buffer.put("Hello, NIO".getBytes());  // position=10, limit=100, capacity=100

// Prepare for reading
buffer.flip();  // position=0, limit=10 (data to read)
// Now get() reads from position 0 to limit 10

// After reading
buffer.hasRemaining();  // true if position < limit
buffer.get();           // reads one byte, advances position

// Reset for writing again
buffer.clear();         // position=0, limit=capacity (all space available)
// OR
buffer.compact();       // keeps unread data, moves it to beginning
```

### Scenario 3: Scatter/Gather I/O

Read multiple fields in one operation using scatter (read into multiple buffers):

```java
ByteBuffer header = ByteBuffer.allocate(128);
ByteBuffer body = ByteBuffer.allocate(1024);

ByteBuffer[] buffers = {header, body};

long bytesRead = channel.read(buffers);  // scatter read — fills header first, then body

header.flip();
body.flip();
```

Write multiple buffers in one operation using gather:

```java
ByteBuffer header = ByteBuffer.wrap("HTTP/1.1 200 OK\r\n".getBytes());
ByteBuffer body = ByteBuffer.wrap("Hello, world".getBytes());

channel.write(new ByteBuffer[]{header, body});  // gather write
```

## Selector key operations

```java
key.interestOps(SelectionKey.OP_READ | SelectionKey.OP_WRITE);  // watch for both
key.cancel();           // stop monitoring this channel
key.isValid();          // check if key is still valid
key.attachment();       // get the attached object (e.g., client state)
key.attach(clientState);// attach state to key
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Not calling `selector.select()` in a loop | Server stops processing after first batch |
| Not removing keys from `selectedKeys()` | Same event processed twice |
| Blocking operations inside selector thread | All connections stall |
| Not calling `buffer.flip()` before reading | Reads garbage data |
| Using `buffer.clear()` when you meant `compact()` | Unread data lost |
| Allocating buffers inside the selector loop | GC pressure, poor performance |
| Not handling partial writes | Data corruption or connection drops |
