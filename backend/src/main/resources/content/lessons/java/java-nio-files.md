---
title: NIO.2: Files, Paths & Non-blocking I/O
summary: The modern file and I/O API — Path, Files, streams of lines, memory-mapped and asynchronous channels, and when NIO beats classic java.io.
order: 16
minutes: 17
topics: [nio, path, files, channels, async-io, memory-mapped]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/package-summary.html
  - https://docs.oracle.com/javase/tutorial/essential/io/fileio.html
---

# NIO.2: Files, Paths & Non-blocking I/O

## Two APIs, one mental model

| | `java.io` (classic) | `java.nio` (NIO.2) |
|---|---|---|
| Entry points | `File`, `FileInputStream`, `BufferedReader` | `Path`, `Files`, `BufferedReader` |
| File metadata/ops | `File.exists()`, `delete()` (methods on the file object) | `Files.exists(path)`, `Files.delete(path)` (static utility) |
| Errors | silent booleans | precise exceptions (`NoSuchFileException`, `AccessDeniedException`) |
| Bulk I/O | blocking byte streams | **channels**, `ByteBuffer`, memory-mapped files, `AsynchronousFileChannel` |

The rule of thumb: **`Files` + `Path` for everything file-system-shaped**, `java.io` streams still fine for simple text reading/writing, and channels only when you need non-blocking or zero-copy behavior.

## Path & the 10 Files methods you'll actually use

```java
Path data = Path.of("data", "academy", "report.csv");     // varargs, OS-correct separator
Path abs = data.toAbsolutePath().normalize();              // resolve "." and ".."

Files.exists(path);
Files.readString(path);                                    // small files, whole file
Files.writeString(path, "hello", StandardOpenOption.APPEND);
Files.readAllLines(path);
Files.copy(src, dst, StandardCopyOption.REPLACE_EXISTING);
Files.move(src, dst, AtomicMoveNotSupportedException.class); // atomic where possible
Files.deleteIfExists(path);
Files.createDirectories(Path.of("a", "b", "c"));           // missing parents too
Files.walk(root)                                           // Stream<Path> of the tree
```

## Streaming a large file without loading it

```java
try (Stream<String> lines = Files.lines(Path.of("big.csv"))) {
    long count = lines.filter(l -> l.startsWith("ERROR")).count();
} // try-with-resources closes the underlying reader — don't skip this!
```

`Files.lines` reads lazily — gigabytes can be scanned with constant memory.

## Channels & ByteBuffer (bulk/zero-copy I/O)

```java
// Copy with a channel — the OS does the heavy lifting (zero-copy transfer)
try (FileChannel in = FileChannel.open(Path.of("in.bin"));
     FileChannel out = FileChannel.open(Path.of("out.bin"), WRITE, CREATE)) {
    in.transferTo(0, in.size(), out);
}

// Memory-mapped file: read a big file as if it were a byte array
try (FileChannel ch = FileChannel.open(Path.of("db.bin"))) {
    MappedByteBuffer buf = ch.map(FileChannel.MapMode.READ_ONLY, 0, ch.size());
    byte b = buf.get(1000);
}
```

## Asynchronous file I/O

```java
AsynchronousFileChannel ch = AsynchronousFileChannel.open(
        Path.of("log.bin"), StandardOpenOption.READ);
ByteBuffer buf = ByteBuffer.allocate(4096);
ch.read(buf, 0, null, new CompletionHandler<Integer, Void>() {
    public void completed(Integer read, Void attach) { ... }
    public void failed(Throwable e, Void attach) { ... }
});
// Or the future style: Future<Integer> f = ch.read(buf, 0);
```

Use async channels when a **single thread** must juggle many I/O operations (high-concurrency gateways). For ordinary applications, blocking I/O on a bounded thread pool is simpler and often faster.

## Production notes

- Prefer **`Files.readString`/`writeString`** for config-sized files; streams for big data; channels for copies.
- Always close streams/channels — `try`-with-resources.
- Watch for **path traversal** when users supply paths: `path.normalize().startsWith(baseDir)` before reading.
- Symlinks: `Files.isSymbolicLink` and `NOFOLLOW_LINKS` where relevant.

## Key takeaways

- `Path` + `Files` replace 90% of what `java.io.File` did, with precise exceptions.
- Stream large files with `Files.lines`; copy efficiently with `FileChannel.transferTo`.
- Reach for async/memory-mapped I/O only when profiling says blocking I/O is the bottleneck.

Official docs: [java.nio.file package](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/package-summary.html) · [File I/O tutorial](https://docs.oracle.com/javase/tutorial/essential/io/fileio.html)
