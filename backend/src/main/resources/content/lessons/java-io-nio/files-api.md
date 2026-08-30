---
title: The Files API — Modern File Handling
module: java-io-nio
order: 4
minutes: 25
topics: ["java.nio.file", "Path", "Files", "walk", "globs", "watch service"]
docs:
  - title: "Files (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/file/Files.html"
summary: Before Java 7, file code was java.io.File — a class that bundled a name with operations, and couldn't express many realworld paths (symbolic links,...
---

# The Files API — Modern File Handling

## The Concept: Path Instead of File

Before Java 7, file code was `java.io.File` — a class that bundled a *name* with *operations*, and couldn't express many real-world paths (symbolic links, UNC paths, filesystems other than the default).

**NIO.2** (`java.nio.file`, Java 7+) redesigned this around three ideas:

1. **`Path`** — a *location*, nothing more. `Path.of("a", "b", "c.txt")` describes where something is, portable across OSes (it uses the right separator for you).
2. **`Files`** — a *static utility class* of operations on paths: read, write, copy, move, delete, list, walk, watch. Everything is one method call.
3. **`FileSystem` / `FileSystems`** — pluggable filesystems: the default OS filesystem, zip files, in-memory filesystems. Same API for all.

The result: file handling that used to take 20 lines of boilerplate is now one or two lines, and it works identically on Windows, Linux, and inside a zip.

## The Code Walkthrough

```java
import java.io.IOException;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Stream;

public class FilesApiDemo {

    public static void main(String[] args) throws IOException {
        // 1. Build a path, inspect it
        Path dir = Path.of("data", "logs");                 // data/logs (or data\logs on Windows)
        Path file = dir.resolve("app.log");                 // data/logs/app.log
        System.out.println(file.getFileName());             // app.log
        System.out.println(file.getParent());               // data/logs

        // 2. Create directories if needed
        Files.createDirectories(dir);                       // no-op if they exist

        // 3. Write and read text
        Files.writeString(file, "line1\nline2\nline3\n", StandardCharsets.UTF_8);
        String all = Files.readString(file, StandardCharsets.UTF_8);
        System.out.println(all.contains("line2"));          // true

        // 4. Copy and move
        Path copy = dir.resolve("app.copy.log");
        Files.copy(file, copy, StandardCopyOption.REPLACE_EXISTING);
        Path moved = dir.resolve("app.moved.log");
        Files.move(copy, moved, StandardCopyOption.REPLACE_EXISTING);

        // 5. List and walk
        System.out.println("files in " + dir + ":");
        try (Stream<Path> entries = Files.list(dir)) {
            entries.forEach(System.out::println);
        }

        // 6. Delete
        Files.deleteIfExists(moved);
        Files.deleteIfExists(file);
    }
}
```

### Walking Through Each Part

**Part 1 — paths.** `Path.of(...)` builds a path from components; `resolve` appends a child; `getFileName`/`getParent` navigate. Nothing touches the disk yet — paths are just descriptions. This is a big improvement over `File` string-fiddling: no manual separator handling.

**Part 2 — `createDirectories`.** Creates `data` and `data/logs` if needed — unlike the old `mkdirs`-style semantics, `createDirectories` creates the *whole chain* and is a no-op if everything already exists.

**Part 3 — read/write text.** `Files.writeString` and `readString` (Java 11+) are the one-liner replacements for the whole `FileWriter`+`BufferedWriter`+close ceremony. Explicit charset = no encoding surprises.

**Part 4 — copy/move.** `Files.copy` and `Files.move` with `REPLACE_EXISTING` handle the whole operation atomically where the OS allows. Note: `Files.move` uses an atomic move when possible — readers never observe a half-written file.

**Part 5 — listing with streams.** `Files.list(dir)` returns a `Stream<Path>` that must be **closed** (it holds a directory handle) — hence try-with-resources. The stream is lazy: entries are read as you consume them. `Files.walk(dir)` does the same recursively, which makes "find all `.log` files under a tree" a one-liner:

```java
try (Stream<Path> s = Files.walk(dir)) {
    s.filter(p -> p.toString().endsWith(".log")).forEach(System.out::println);
}
```

**Part 6 — deletion.** `deleteIfExists` deletes or silently does nothing. Always prefer the `IfExists` variants to avoid `NoSuchFileException` races.

## Matching Files with Glob Patterns

`Files.newDirectoryStream(dir, "*.log")` takes a **glob** — the shell-style pattern language (`*`, `?`, `{a,b}`, `**`):

```java
try (DirectoryStream<Path> logs = Files.newDirectoryStream(dir, "*.log")) {
    for (Path p : logs) System.out.println(p);
}
```

This is much simpler than regex for the common "all files with this extension" case, and unlike `Files.list` it filters *inside* the directory read (more efficient, no `Stream` filter pass).

## Watching Directories for Changes

The **WatchService** lets you react to file events (created, modified, deleted) — the mechanism behind file-sync tools, hot-reload dev servers, and log tailers:

```java
WatchService watcher = FileSystems.getDefault().newWatchService();
Path dirToWatch = Path.of("data");
dirToWatch.register(watcher,
        StandardWatchEventKinds.ENTRY_CREATE,
        StandardWatchEventKinds.ENTRY_MODIFY,
        StandardWatchEventKinds.ENTRY_DELETE);

// In a background thread:
WatchKey key = watcher.take();                 // blocks until an event
for (WatchEvent<?> event : key.pollEvents()) {
    System.out.println(event.kind() + ": " + event.context());
}
key.reset();                                    // must reset to keep watching
```

This uses the OS's native file-watch facility (inotify on Linux, ReadDirectoryChangesW on Windows) rather than polling — efficient and near-real-time.

## Practical Patterns

| Task | One-liner |
|---|---|
| Read whole file | `Files.readString(p)` |
| Write whole file | `Files.writeString(p, text)` |
| Read lines | `Files.readAllLines(p)` or `Files.lines(p)` (lazy) |
| Copy | `Files.copy(from, to, REPLACE_EXISTING)` |
| Move/rename | `Files.move(from, to, REPLACE_EXISTING)` |
| Delete | `Files.deleteIfExists(p)` |
| Create dirs | `Files.createDirectories(p)` |
| Check existence | `Files.exists(p)` |
| List dir | `Files.list(p)` |
| Walk tree | `Files.walk(p)` |
| Temp file | `Files.createTempFile("prefix", ".tmp")` |

## Common Beginner Pitfalls

1. **Not closing stream-returning methods** (`Files.list`, `walk`, `lines`) — they hold OS handles. Always try-with-resources.
2. **`delete` vs `deleteIfExists`** — plain `delete` throws if missing; use `IfExists` for idempotent code.
3. **Manual separator concatenation** — `"data" + "\\" + "logs"` breaks on Linux; use `Path.of` / `resolve`.
4. **Forgetting the charset** — `readString(p)` without charset uses the platform default; pass `StandardCharsets.UTF_8`.
5. **Reading huge files with `readAllLines`** — loads everything; use `Files.lines` lazily.
6. **WatchService without `key.reset()`** — the watch silently stops after the first batch of events.

## Key Takeaways

- `Path` is a location; `Files` is the toolbox; both are cross-platform.
- `Files.readString`/`writeString`/`copy`/`move`/`deleteIfExists` replace piles of boilerplate.
- Streams from `Files.list`/`walk`/`lines` must be closed.
- Globs (`*.log`) beat regex for filename filtering.
- WatchService gives native, event-driven directory watching.
