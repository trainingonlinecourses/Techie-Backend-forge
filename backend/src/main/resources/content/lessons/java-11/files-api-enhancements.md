---
title: Files API Enhancements — Reading and Writing Made Simple
summary: readString(), writeString(), and how they replace verbose pre-Java 11 file I/O patterns.
order: 5
minutes: 12
topics: [files, readstring, writestring, file-io, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/nio/file/Files.html
---

## The Concept, From Zero

Before Java 11, reading a file into a String required 4-5 lines of boilerplate. Java 11 added `readString()` and `writeString()` to `Files`:

```java
// PRE-JAVA 11: Reading a file
String content = new String(Files.readAllBytes(Path.of("config.yml")));

// JAVA 11: One line
String content = Files.readString(Path.of("config.yml"));

// PRE-JAVA 11: Writing a file
Files.write(Path.of("output.txt"), "Hello".getBytes());

// JAVA 11: One line
Files.writeString(Path.of("output.txt"), "Hello");
```

---

## The New Methods

```java
// readString — read entire file as String
String content = Files.readString(Path.of("data.csv"));

// readString with charset
String content = Files.readString(Path.of("data.csv"), StandardCharsets.UTF_8);

// writeString — write a String to a file
Files.writeString(Path.of("output.txt"), "Hello, World!");

// writeString with options
Files.writeString(Path.of("log.txt"), "New log entry\n",
    StandardOpenOption.CREATE,      // create if doesn't exist
    StandardOpenOption.APPEND       // append to existing content
);
```

---

## Line-by-Line Walkthrough

```java
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.*;

public class FilesApiDemo {
    public static void main(String[] args) throws Exception {
        // Line 1: Write configuration file
        var config = """
            server.port=8080
            server.host=localhost
            database.url=jdbc:postgresql://localhost:5432/mydb
            database.pool.size=10
            """;
        Files.writeString(Path.of("application.properties"), config);
        System.out.println("Config written successfully");

        // Line 2: Read configuration file
        String configContent = Files.readString(Path.of("application.properties"));
        System.out.println("Config content:\n" + configContent);

        // Line 3: Parse configuration into a Map
        var properties = configContent.lines()
            .filter(line -> !line.isBlank() && !line.startsWith("#"))
            .collect(Collectors.toMap(
                line -> line.substring(0, line.indexOf("=")),
                line -> line.substring(line.indexOf("=") + 1)
            ));
        System.out.println("Parsed: " + properties);
        // {server.port=8080, server.host=localhost, ...}

        // Line 4: Append to a log file
        for (int i = 0; i < 3; i++) {
            var logEntry = java.time.Instant.now() + " - Log entry " + i + "\n";
            Files.writeString(
                Path.of("app.log"),
                logEntry,
                StandardOpenOption.CREATE,
                StandardOpenOption.APPEND
            );
        }

        // Line 5: Read and transform
        String transformed = Files.readString(Path.of("application.properties"))
            .lines()
            .filter(line -> line.startsWith("server."))
            .map(String::toUpperCase)
            .collect(Collectors.joining("\n"));
        System.out.println("Server config:\n" + transformed);

        // Line 6: Write with charset
        var utf8Content = "Hello, 世界";
        Files.writeString(Path.of("unicode.txt"), utf8Content, StandardCharsets.UTF_8);
        String readBack = Files.readString(Path.of("unicode.txt"), StandardCharsets.UTF_8);
        System.out.println("Unicode: " + readBack);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Template engine

```java
public class SimpleTemplateEngine {
    private final Path templateDir;

    public String render(String templateName, Map<String, String> variables) throws IOException {
        String template = Files.readString(templateDir.resolve(templateName));
        for (var entry : variables.entrySet()) {
            template = template.replace("{{" + entry.getKey() + "}}", entry.getValue());
        }
        return template;
    }
}
```

### Scenario 2: Configuration migration

```java
public void migrateConfig(Path oldConfig, Path newConfig) throws IOException {
    var content = Files.readString(oldConfig);
    var migrated = content
        .replace("db.url", "spring.datasource.url")
        .replace("db.user", "spring.datasource.username")
        .replace("db.pass", "spring.datasource.password");
    Files.writeString(newConfig, migrated);
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `readAllBytes()` + `new String()` | Verbose, no charset control | Use `Files.readString()` |
| Forgetting `StandardOpenOption.CREATE` | File must already exist | Add `CREATE` or `CREATE_NEW` |
| Reading huge files with `readString()` | Loads entire file into memory | Use `Files.lines()` for large files |
| Not handling `IOException` | Checked exception | Use `throws IOException` or try-catch |
