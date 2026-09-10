---
title: Java Sockets & NIO — Network Programming in the JDK
summary: What sockets are, TCP communication with Socket and ServerSocket, NIO channels and buffers, and how organizations build networked applications.
order: 4
minutes: 28
topics: [socket, serversocket, tcp, nio, channel, buffer, selector, networking]
docs:
  - https://docs.oracle.com/javase/tutorial/networking/index.html
  - https://docs.oracle.com/javase/tutorial/essential/io/nio.html
---

## The Concept, From Zero

### What is a Socket?

A **socket** is one endpoint of a two-way communication link between two programs. Think of it like a phone call: one program "dials" (client), the other "answers" (server), and then they can talk.

// Server side — listens for connections
ServerSocket server = new ServerSocket(8080);
Socket client = server.accept();  // Waits for a client

// Client side — connects to server
Socket socket = new Socket("localhost", 8080);

### What is NIO?

**NIO (New I/O)** is Java's non-blocking I/O API. Instead of one thread per connection (blocking), NIO lets one thread manage thousands of connections using **selectors**.

```
Traditional I/O: Thread waits while reading/writing
NIO: Thread checks if data is ready, moves on if not
```

---

## TCP Sockets — The Basics


**What this code does — step by step:**

1. Line 1: Simple TCP Server
2. Create server socket on port 8080
3. Wait for client connection (blocking)
4. Create reader and writer
5. Read message from client
6. Send response
7. Close resources
8. Line 2: Simple TCP Client
9. Connect to server
10. Create reader and writer
11. Send message
12. Read response

The same code, clean:

```java
import java.io.*;
import java.net.*;

public class SimpleServer {
    public static void main(String[] args) throws IOException {
        ServerSocket serverSocket = new ServerSocket(8080);
        System.out.println("Server listening on port 8080");

        Socket clientSocket = serverSocket.accept();
        System.out.println("Client connected: " + clientSocket.getInetAddress());

        BufferedReader in = new BufferedReader(
            new InputStreamReader(clientSocket.getInputStream()));
        PrintWriter out = new PrintWriter(clientSocket.getOutputStream(), true);

        String message = in.readLine();
        System.out.println("Received: " + message);

        out.println("Echo: " + message);

        clientSocket.close();
        serverSocket.close();
    }
}

public class SimpleClient {
    public static void main(String[] args) throws IOException {
        Socket socket = new Socket("localhost", 8080);

        BufferedReader in = new BufferedReader(
            new InputStreamReader(socket.getInputStream()));
        PrintWriter out = new PrintWriter(socket.getOutputStream(), true);

        out.println("Hello, Server!");

        String response = in.readLine();
        System.out.println("Server said: " + response);

        socket.close();
    }
}
```

---

## Multi-Threaded Server

import java.io.*;
import java.net.*;
import java.util.concurrent.*;

public class MultiThreadedServer {
    private final int port;
    private final ExecutorService executor;
    
    public MultiThreadedServer(int port) {
        this.port = port;
        // Fixed thread pool — limits concurrent connections
        this.executor = Executors.newFixedThreadPool(10);
    }
    
    public void start() throws IOException {
        ServerSocket serverSocket = new ServerSocket(port);
        System.out.println("Server started on port " + port);
        
        while (true) {
            // Accept new connection
            Socket clientSocket = serverSocket.accept();
            
            // Handle in separate thread
            executor.submit(new ClientHandler(clientSocket));
        }
    }
    
    // Inner class to handle each client
    private static class ClientHandler implements Runnable {
        private final Socket socket;
        
        ClientHandler(Socket socket) {
            this.socket = socket;
        }
        
        @Override
        public void run() {
            try {
                BufferedReader in = new BufferedReader(
                    new InputStreamReader(socket.getInputStream()));
                PrintWriter out = new PrintWriter(socket.getOutputStream(), true);
                
                String line;
                while ((line = in.readLine()) != null) {
                    System.out.println("Client: " + line);
                    out.println("Echo: " + line);
                }
            } catch (IOException e) {
                System.err.println("Client error: " + e.getMessage());
            } finally {
                try { socket.close(); } catch (IOException e) { /* ignore */ }
            }
        }
    }
    
    public static void main(String[] args) throws IOException {
        new MultiThreadedServer(8080).start();
    }
}

---

## NIO — Non-Blocking I/O

### Channels and Buffers


**What this code does — step by step:**

1. Line 1: Reading a file with NIO
2. Create a buffer
3. Open a channel
4. Read into buffer
5. Flip buffer for reading
6. Convert to string
7. Line 2: Writing a file with NIO

The same code, clean:

```java
import java.nio.*;
import java.nio.channels.*;
import java.nio.file.*;

public class NioBasic {
    public static void main(String[] args) throws IOException {
        Path path = Paths.get("data.txt");

        ByteBuffer buffer = ByteBuffer.allocate(1024);

        try (FileChannel channel = FileChannel.open(path, StandardOpenOption.READ)) {
            int bytesRead = channel.read(buffer);

            buffer.flip();

            String content = new String(buffer.array(), 0, bytesRead);
            System.out.println(content);
        }

        Path outputPath = Paths.get("output.txt");
        ByteBuffer writeBuffer = ByteBuffer.wrap("Hello, NIO!".getBytes());

        try (FileChannel channel = FileChannel.open(outputPath, 
                StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            channel.write(writeBuffer);
        }
    }
}
```

### Selectors — Non-Blocking Network I/O


**What this code does — step by step:**

1. Line 1: Open selector
2. Line 2: Open server channel
3. `serverChannel.configureBlocking(false);` — Non-blocking!
4. Line 3: Register for accept events
5. Line 4: Event loop
6. Wait for events (blocks until something happens)
7. Get ready keys
8. Echo back

The same code, clean:

```java
import java.io.*;
import java.net.*;
import java.nio.*;
import java.nio.channels.*;
import java.util.*;

public class NioServer {
    private Selector selector;
    private ServerSocketChannel serverChannel;

    public void start(int port) throws IOException {
        selector = Selector.open();

        serverChannel = ServerSocketChannel.open();
        serverChannel.bind(new InetSocketAddress(port));
        serverChannel.configureBlocking(false);

        serverChannel.register(selector, SelectionKey.OP_ACCEPT);

        System.out.println("NIO server started on port " + port);

        while (true) {
            selector.select();

            Set<SelectionKey> keys = selector.selectedKeys();
            Iterator<SelectionKey> iter = keys.iterator();

            while (iter.hasNext()) {
                SelectionKey key = iter.next();
                iter.remove();

                if (key.isAcceptable()) {
                    handleAccept(key);
                } else if (key.isReadable()) {
                    handleRead(key);
                }
            }
        }
    }

    private void handleAccept(SelectionKey key) throws IOException {
        SocketChannel client = ((ServerSocketChannel) key.channel()).accept();
        client.configureBlocking(false);
        client.register(selector, SelectionKey.OP_READ);
        System.out.println("New connection: " + client.getRemoteAddress());
    }

    private void handleRead(SelectionKey key) throws IOException {
        SocketChannel client = (SocketChannel) key.channel();
        ByteBuffer buffer = ByteBuffer.allocate(1024);

        int bytesRead = client.read(buffer);
        if (bytesRead == -1) {
            client.close();
            return;
        }

        buffer.flip();
        String message = new String(buffer.array(), 0, bytesRead);
        System.out.println("Received: " + message);

        client.write(ByteBuffer.wrap(("Echo: " + message).getBytes()));
    }

    public static void main(String[] args) throws IOException {
        new NioServer().start(8080);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Chat server with NIO

public class ChatServer {
    private final Map<SocketChannel, String> users = new ConcurrentHashMap<>();
    
    public void start(int port) throws IOException {
        Selector selector = Selector.open();
        ServerSocketChannel server = ServerSocketChannel.open();
        server.bind(new InetSocketAddress(port));
        server.configureBlocking(false);
        server.register(selector, SelectionKey.OP_ACCEPT);
        
        while (true) {
            selector.select();
            Iterator<SelectionKey> keys = selector.selectedKeys().iterator();
            
            while (keys.hasNext()) {
                SelectionKey key = keys.next();
                keys.remove();
                
                if (key.isAcceptable()) {
                    SocketChannel client = server.accept();
                    client.configureBlocking(false);
                    client.register(selector, SelectionKey.OP_READ);
                } else if (key.isReadable()) {
                    SocketChannel client = (SocketChannel) key.channel();
                    ByteBuffer buffer = ByteBuffer.allocate(1024);
                    client.read(buffer);
                    buffer.flip();
                    String message = new String(buffer.array(), 0, buffer.remaining());
                    
                    // Broadcast to all connected clients
                    broadcast(message, client);
                }
            }
        }
    }
    
    private void broadcast(String message, SocketChannel sender) throws IOException {
        for (SocketChannel client : users.keySet()) {
            if (client != sender) {
                client.write(ByteBuffer.wrap(message.getBytes()));
            }
        }
    }
}

### Scenario 2: File transfer with NIO

public class FileTransfer {
    public static void sendFile(SocketChannel channel, Path file) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(8192);
        
        try (FileChannel fileChannel = FileChannel.open(file, StandardOpenOption.READ)) {
            while (fileChannel.read(buffer) > 0) {
                buffer.flip();
                while (buffer.hasRemaining()) {
                    channel.write(buffer);
                }
                buffer.clear();
            }
        }
    }
    
    public static void receiveFile(SocketChannel channel, Path destination) throws IOException {
        ByteBuffer buffer = ByteBuffer.allocate(8192);
        
        try (FileChannel fileChannel = FileChannel.open(destination, 
                StandardOpenOption.CREATE, StandardOpenOption.WRITE)) {
            while (channel.read(buffer) > 0) {
                buffer.flip();
                fileChannel.write(buffer);
                buffer.clear();
            }
        }
    }
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `configureBlocking(false)` | NIO blocks like traditional I/O | Set non-blocking before registering |
| Not flipping buffer | Data not readable | Always `flip()` before reading |
| Resource leak | File descriptors exhausted | Use try-with-resources |
| Thread starvation | Server becomes unresponsive | Use thread pool for blocking operations |
| Not handling `CLOSED` connection | Exception on read | Check `read()` return value for -1 |

---

## NIO vs Traditional I/O

```
Traditional I/O:          NIO:
┌─────────┐              ┌─────────┐
│ Thread 1 │─────────────│ Selector│
│ (blocks) │              └────┬────┘
└─────────┘                   │
┌─────────┐              ┌────┴────┐
│ Thread 2 │─────────────│ Channel │
│ (blocks) │              └─────────┘
└─────────┘
┌─────────┐              One thread manages
│ Thread 3 │              many connections
│ (blocks) │
└─────────┘
One thread per connection
```

**Use traditional I/O when:** You have few connections and simple requirements.

**Use NIO when:** You need to handle thousands of concurrent connections (chat servers, proxies, game servers).

