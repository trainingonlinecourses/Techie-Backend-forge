---
title: Java File I/O — Reading, Writing, Copying, and Compressing Files
summary: NIO.2 Path/Files API vs legacy File, reading/writing text and binary, directory traversal, file copy/move, try-with-resources for streams, and when to use each approach in production.
order: 64
minutes: 24
topics: [file-io, nio2, path, files-api, readwrite, directory-walk, try-with-resources, file-copy, zip-compress]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/io/fileio.html
  - https://docs.oracle.com/javase/8/docs/api/java/nio/file/Files.html
---

# Java File I/O — Reading, Writing, Copying, and Compressing Files

## The concept — why are there TWO file APIs?

Java has two file APIs:

1. **Legacy `java.io.File`** (Java 1.0) — old, inconsistent error handling, no symbolic link support, can't watch directory changes.
2. **NIO.2 `java.nio.file.Path` + `Files`** (Java 7+) — modern, fluent, exception-safe, handles millions of files efficiently.

**Beginner mental model:** `File` is like a paper map — it works but is clunky. `Path` + `Files` is like GPS — faster, more features, and handles edge cases automatically.

**The rule:** Always use NIO.2 (`Path` + `Files`) in new code. Use `File` only when a library API requires it (convert with `path.toFile()`).

## Core concepts: Path and Files

**Path** represents a file or directory location:
```java
Path path = Path.of("/home/user/documents/report.pdf");  // create a path
Path current = Path.of(".");                               // current directory
Path resolved = current.resolve("data/file.txt");          // join paths: ./data/file.txt
Path parent = path.getParent();                            // /home/user/documents
String filename = path.getFileName().toString();           // report.pdf
```

**Files** is a utility class with static methods for all file operations. No need to create instances — just call `Files.method(path)`.

## Reading files — text and binary

```java
// Way 1: read entire file as a String (small files only — loads into memory)
String content = Files.readString(Path.of("config.yml"));
System.out.println(content);

// Way 2: read all lines into a List (for line-by-line processing)
List<String> lines = Files.readAllLines(Path.of("data.csv"));
for (String line : lines) {
    System.out.println(line);    // process each line
}

// Way 3: streaming (for large files — doesn't load everything into memory)
try (Stream<String> stream = Files.lines(Path.of("huge-log.txt"))) {
    stream.filter(line -> line.contains("ERROR"))    // keep only error lines
          .forEach(System.out::println);              // print each error
}
// try-with-resources auto-closes the stream when done

// Way 4: read binary data (images, PDFs, etc.)
byte[] imageBytes = Files.readAllBytes(Path.of("logo.png"));
```

**Line by line for Way 3:**
- `Files.lines()` returns a `Stream<String>` — a lazy pipeline that reads lines one at a time.
- `filter()` is lazy — it doesn't read the next line until `forEach` asks for it.
- `try-with-resources` ensures the file handle is closed even if an exception occurs.
- For a 10GB log file, this uses ~1MB of memory instead of 10GB.

## Writing files — text and binary

```java
// Write a string to a file (overwrites existing content)
Files.writeString(Path.of("output.txt"), "Hello, World!\n");

// Write multiple lines
Files.write(Path.of("data.csv"),
    List.of("Name,Age,City",        // line 1
            "Alice,30,NYC",          // line 2
            "Bob,25,SF"));           // line 3

// Append to a file (CREATE + APPEND)
Files.writeString(Path.of("audit.log"), "User login: alice\n",
    StandardOpenOption.CREATE,       // create file if it doesn't exist
    StandardOpenOption.APPEND);      // add to end, don't overwrite

// Write binary data
byte[] imageBytes = fetchImageFromAPI();
Files.write(Path.of("downloaded.png"), imageBytes);
```

## Copying, moving, and deleting files

```java
// Copy a file
Files.copy(
    Path.of("source/report.pdf"),                     // source path
    Path.of("backup/2024/report.pdf"),                // destination path
    StandardCopyOption.REPLACE_EXISTING               // overwrite if destination exists
);

// Move/rename a file
Files.move(
    Path.of("temp/upload.tmp"),                       // source
    Path.of("uploads/final.pdf"),                     // destination
    StandardCopyOption.REPLACE_EXISTING               // overwrite if exists
);

// Delete a file
Files.delete(Path.of("temp/upload.tmp"));             // throws exception if not found
Files.deleteIfExists(Path.of("maybe-exists.txt"));    // returns false if not found, no exception

// Create directories (mkdir -p equivalent)
Files.createDirectories(Path.of("data/2024/january"));  // creates all parent dirs too
```

## Directory traversal — walking the file tree

```java
// List all files in a directory
try (Stream<Path> paths = Files.list(Path.of("src/main/java"))) {
    paths.filter(Files::isRegularFile)               // skip directories
         .forEach(System.out::println);               // print each file path
}

// Walk a directory tree (recursive — all subdirectories)
try (Stream<Path> paths = Files.walk(Path.of("src"))) {
    List<Path> javaFiles = paths
        .filter(p -> p.toString().endsWith(".java"))  // only .java files
        .toList();
    System.out.println("Found " + javaFiles.size() + " Java files");
}

// Walk with depth limit (don't recurse deeper than 3 levels)
try (Stream<Path> paths = Files.walk(Path.of("src"), 3)) {
    paths.forEach(System.out::println);  // max 3 levels deep
}

// Find files by glob pattern
try (Stream<Path> paths = Files.newDirectoryStream(
        Path.of("src"), "**/*.java")) {               // glob pattern
    paths.forEach(System.out::println);
}
```

## try-with-resources — why it matters

```java
// BAD: manual close — if readLine() throws, the reader is never closed (resource leak!)
BufferedReader reader = new BufferedReader(new FileReader("data.txt"));
String line = reader.readLine();  // if this throws... reader is leaked!
reader.close();

// GOOD: try-with-resources — auto-closes even on exception
try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}  // reader.close() is called automatically, even if an exception occurred
```

**How it works:** The variable in `try(...)` must implement `AutoCloseable`. When the try block exits (normally or exceptionally), Java calls `close()` on each resource in reverse order.

## How we use it in organizations

### Scenario 1: CSV data import pipeline

A company needs to import 100K rows from a CSV file into their database:

```java
public class CsvImporter {
    public int importUsers(Path csvFile) throws IOException {
        int imported = 0;

        try (Stream<String> lines = Files.lines(csvFile)) {   // stream — memory efficient
            List<String> header = null;                        // first line = column names

            for (Iterator<String> it = lines.iterator(); it.hasNext(); ) {
                String line = it.next();

                if (header == null) {
                    header = List.of(line.split(","));         // parse header row
                    continue;                                  // skip to next line
                }

                String[] fields = line.split(",");             // split CSV row
                if (fields.length < 3) {
                    log.warn("Skipping malformed line: {}", line);
                    continue;                                  // skip bad data
                }

                User user = new User(fields[0], fields[1], fields[2]);
                userRepository.save(user);                     // save to database
                imported++;
            }
        }
        log.info("Imported {} users from {}", imported, csvFile);
        return imported;
    }
}
```

### Scenario 2: Log file rotation and compression

A service writes logs that need to be archived weekly:

```java
public class LogArchiver {
    private final Path logDir = Path.of("logs");
    private final Path archiveDir = Path.of("logs/archive");

    public void archiveOldLogs() throws IOException {
        Files.createDirectories(archiveDir);  // ensure archive dir exists

        try (Stream<Path> logFiles = Files.list(logDir)) {
            logFiles.filter(p -> p.toString().endsWith(".log"))
                    .filter(p -> isOlderThan(p, Duration.ofDays(7)))  // only old logs
                    .forEach(this::compressAndDelete);
        }
    }

    private void compressAndDelete(Path logFile) {
        try {
            Path zipPath = archiveDir.resolve(logFile.getFileName() + ".gz");

            // GZIPOutputStream wraps FileOutputStream — compresses as it writes
            try (GZIPOutputStream gzout = new GZIPOutputStream(
                    Files.newOutputStream(zipFile))) {
                Files.copy(logFile, gzout);   // compress and write in one step
            }

            Files.delete(logFile);  // remove original after successful compression
            log.info("Archived {} → {}", logFile, zipPath);
        } catch (IOException e) {
            log.error("Failed to archive {}", logFile, e);
        }
    }
}
```

### Scenario 3: File upload validation service

When users upload files, validate type, size, and content:

```java
public class FileUploadValidator {
    private static final long MAX_SIZE = 10 * 1024 * 1024;  // 10MB
    private static final Set<String> ALLOWED_TYPES = Set.of("image/png", "image/jpeg", "application/pdf");

    public ValidationResult validate(Path uploadedFile) throws IOException {
        // Check file size
        long size = Files.size(uploadedFile);
        if (size > MAX_SIZE) {
            return ValidationResult.rejected("File too large: " + size + " bytes (max " + MAX_SIZE + ")");
        }
        if (size == 0) {
            return ValidationResult.rejected("File is empty");
        }

        // Check file extension
        String filename = uploadedFile.getFileName().toString();
        String ext = filename.substring(filename.lastIndexOf('.') + 1).toLowerCase();
        if (!Set.of("png", "jpg", "jpeg", "pdf").contains(ext)) {
            return ValidationResult.rejected("Unsupported file type: ." + ext);
        }

        // Check magic bytes (verify actual content matches extension)
        byte[] header = new byte[8];
        try (var is = Files.newInputStream(uploadedFile)) {
            is.read(header, 0, 8);  // read first 8 bytes
        }

        if (ext.equals("png") && !startsWith(header, (byte)0x89, (byte)0x50)) {
            return ValidationResult.rejected("File claims to be PNG but content doesn't match");
        }

        return ValidationResult.accepted();
    }
}
```

## Performance comparison

| Operation | `java.io.File` | `NIO.2 Files` |
|---|---|---|
| Read small file | `new File(path)` + `FileInputStream` | `Files.readString(path)` |
| Read large file | Manual `BufferedReader` | `Files.lines(path)` — streaming |
| Write file | `FileWriter` + manual flush | `Files.writeString(path, content)` |
| Copy file | Manual read/write loop | `Files.copy(src, dest)` — one line |
| Walk directory | `File.listFiles()` (not recursive) | `Files.walk(path)` — recursive, lazy |
| Watch changes | Not supported | `FileWatcher` API |

## Common mistakes

| Mistake | Consequence |
|---|---|
| Using `Files.readAllBytes()` on a 2GB file | OutOfMemoryError — loads entire file into heap |
| Not using try-with-resources | Resource leak — file handles accumulate, eventually crashes |
| Using `File.listFiles()` without null check | NPE when directory doesn't exist or permission denied |
| Hardcoding paths with `/` or `\\` | Breaks on other OS — use `Path.of("a", "b")` instead |
| Not checking `Files.exists()` before operations | Unnecessary exceptions — check first or use `deleteIfExists()` |
