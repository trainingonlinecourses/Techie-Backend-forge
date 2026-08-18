---
title: Sockets — The Foundation of Network Programming
module: java-networking
order: 1
minutes: 28
topics: ["sockets", "TCP", "ServerSocket", "client-server", "streams"]
docs:
  - title: "Socket (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html"
  - title: "Networking Basics (Oracle)"
    url: "https://docs.oracle.com/javase/tutorial/networking/sockets/index.html"
---

# Sockets — The Foundation of Network Programming

## The Concept: Two Ends of a Conversation

Every network conversation in Java — HTTP requests, database connections, message queues — ultimately runs over **sockets**. A socket is the endpoint of a two-way communication link between two programs, possibly on different machines. One program opens a *server* socket and waits; the other opens a *client* socket and connects; once connected, both sides send and receive bytes.

**The mental model:** think of a phone call. The server is the business that publishes its phone number (IP address + port) and has someone waiting by the phone (`ServerSocket.accept()` — blocking until someone calls). The client dials the number (`new Socket(host, port)`). When the call connects, both people can talk at once — that's full-duplex communication over two streams. The call stays open until either side hangs up; the bytes flowing are whatever the protocol defines (HTTP text, JSON, binary data).

**Key distinction — TCP vs UDP.** TCP (the default `Socket`) is the *reliable, ordered* channel: bytes arrive in order, missing data is retransmitted, and the connection is established with a three-way handshake. UDP (`DatagramSocket`) is *fire-and-forget*: faster, no guarantees — packets can arrive out of order or not at all. HTTP, databases, and almost everything you build use TCP. DNS, video streaming, and gaming use UDP where speed beats reliability. This module focuses on TCP.

## A Complete Server, Line by Line

```java
import java.io.*;
import java.net.*;

public class EchoServer {
    public static void main(String[] args) throws IOException {
        // 1. Listen on port 9090. The server socket just WAITS for callers.
        try (ServerSocket server = new ServerSocket(9090)) {
            System.out.println("Echo server listening on port 9090");

            // 2. accept() BLOCKS until a client connects.
            //    Each accepted socket is a separate conversation.
            while (true) {
                Socket client = server.accept();
                System.out.println("Client connected: " +
                                   client.getInetAddress().getHostAddress());

                // 3. Handle this client (we'll do it inline for simplicity).
                handleClient(client);
            }
        }
    }

    private static void handleClient(Socket client) throws IOException {
        // 4. Wrap the socket's byte streams in reader/writer for text.
        try (BufferedReader in = new BufferedReader(
                     new InputStreamReader(client.getInputStream()));
             PrintWriter out = new PrintWriter(client.getOutputStream(), true)) {

            String line;
            // 5. Read lines until the client closes the connection
            //    (readLine returns null on EOF).
            while ((line = in.readLine()) != null) {
                System.out.println("Received: " + line);
                out.println("echo: " + line);   // send it back
            }
        }
        System.out.println("Client disconnected");
        client.close();  // clean up the conversation socket
    }
}
```

**Walking through it, piece by piece:**

- `new ServerSocket(9090)` binds to port 9090 on all interfaces. **Ports** are how one machine hosts many services: the IP finds the machine, the port finds the program (80 = HTTP, 443 = HTTPS, 5432 = Postgres, 8080 = typical Spring Boot dev).

- The `while (true)` loop with `server.accept()` is the classic server shape: **accept → handle → repeat**. `accept()` blocks the thread until a client arrives — that's why servers are multithreaded: while one thread handles a slow client, the main loop must keep accepting new connections.

- `client.getInputStream()` / `getOutputStream()` give raw *byte* streams. We wrap them: `InputStreamReader` (bytes → chars using a charset) and `BufferedReader` (chars → lines), and `PrintWriter` (chars → bytes with auto-flush). This is the Java I/O pattern — layered streams.

- `in.readLine()` blocks until a full line arrives or the peer closes (returns `null`). The loop `while ((line = in.readLine()) != null)` is the standard "read until EOF" idiom. When the client closes, the loop exits and we clean up.

## The Client Side

```java
import java.io.*;
import java.net.*;

public class EchoClient {
    public static void main(String[] args) throws IOException {
        // 1. Connect to the server — this performs the TCP handshake.
        try (Socket socket = new Socket("localhost", 9090)) {

            // 2. Same stream setup, opposite direction.
            BufferedReader in = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
            PrintWriter out = new PrintWriter(socket.getOutputStream(), true);

            // 3. Send a message.
            out.println("Hello from the client!");
            // 4. Block until the server replies.
            String reply = in.readLine();
            System.out.println("Server said: " + reply);   // echo: Hello...
        }
        // try-with-resources closes the socket — clean disconnect.
    }
}
```

**Walking through it:** `new Socket("localhost", 9090)` resolves the host, connects, and performs the TCP three-way handshake (SYN, SYN-ACK, ACK) under the hood. The client then mirrors the server's stream setup and exchanges messages. When the client exits, the socket closes, the server's `readLine()` sees EOF (`null`), and the server logs "Client disconnected." The whole exchange is plain text — the simplest possible protocol.

## The One-Thread-Per-Client Problem

The server above handles one client at a time: while `handleClient` runs (blocked on `readLine`), the main loop can't `accept()` anyone else. For a real server, that's fatal — one slow client blocks everyone. The classic fix: **a thread per client**:

```java
try (ServerSocket server = new ServerSocket(9090)) {
    while (true) {
        Socket client = server.accept();
        // Hand the client to a dedicated thread; the loop returns to
        // accepting new connections immediately.
        new Thread(() -> {
            try { handleClient(client); }
            catch (IOException e) { /* log */ }
        }).start();
    }
}
```

Now the accept loop never blocks on a conversation. This is exactly how the first generation of web servers worked — and it's the problem **virtual threads** (Java 21) and **NIO** solve with far better scalability: virtual threads let you write this same blocking style with thousands of concurrent clients, and NIO/reactor models (Netty, Spring WebFlux) avoid threads per connection entirely. You'll see both in the later lessons of this module.

## Common Failure Modes

- **Connection refused** (`ConnectException`): nothing is listening on that host/port. The classic "server not started" symptom.
- **Connection reset / broken pipe**: the peer closed abruptly (crashed, timed out, or the OS killed the connection). Write to a closed socket → `SocketException: Connection reset`.
- **Address already in use**: your server socket is still bound (often from a previous run that didn't shut down cleanly). Wait for the OS timeout or use a different port.
- **Blocking forever**: `readLine()` blocks indefinitely if the peer never sends data and never closes. Real servers add read **timeouts**: `socket.setSoTimeout(5000)` makes reads throw `SocketTimeoutException` after 5s.

## Recap

Sockets are the two endpoints of a network conversation — the server listens (`ServerSocket.accept()` blocks for callers), the client dials (`new Socket(host, port)`), and once connected both sides exchange bytes through layered streams. TCP gives reliability and ordering; UDP trades them for speed. The `accept → handle → repeat` loop with a thread per client is the classic server architecture, and its scalability limits drive the virtual-thread and NIO approaches in the next lessons. Master this foundation and everything above it — HTTP, databases, messaging — becomes a protocol layered on the same mechanism you just built.
