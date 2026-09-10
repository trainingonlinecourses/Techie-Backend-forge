---
title: Files API Enhancements — Reading and Writing Made Simple
summary: readString(), writeString(), and how they replace verbose pre-Java 11 file I/O patterns.
order: 1
minutes: 12
topics: [files, readstring, writestring, file-io, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/nio/file/Files.html
---

## The Concept, From Zero

Before Java 11, reading a file into a String required 4-5 lines of boilerplate. Java 11 added `readString()` and `writeString()` to `Files`:

// PRE-JAVA 11: Reading a file
String content = new String(Files.readAllBytes(Path.of("config.yml")));

// JAVA 11: One line
String content = Files.readString(Path.of("config.yml"));

// PRE-JAVA 11: Writing a file
Files.write(Path.of("output.txt"), "Hello".getBytes());

// JAVA 11: One line
Files.writeString(Path.of("output.txt"), "Hello");

---

## The New Methods


**What this code does — step by step:**

1. readString — read entire file as String
2. readString with charset
3. writeString — write a String to a file
4. writeString with options
5. `StandardOpenOption.CREATE,` — create if doesn't exist
6. `StandardOpenOption.APPEND` — append to existing content

The same code, clean:

```java
String content = Files.readString(Path.of("data.csv"));

String content = Files.readString(Path.of("data.csv"), StandardCharsets.UTF_8);

Files.writeString(Path.of("output.txt"), "Hello, World!");

Files.writeString(Path.of("log.txt"), "New log entry\n",
    StandardOpenOption.CREATE,
    StandardOpenOption.APPEND
);
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: Write configuration file
2. `database.url=jdbc:postgresql:` — localhost:5432/mydb
3. Line 2: Read configuration file
4. Line 3: Parse configuration into a Map
5. {server.port=8080, server.host=localhost, ...}
6. Line 4: Append to a log file
7. Line 5: Read and transform
8. Line 6: Write with charset

The same code, clean:

```java
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.*;

public class FilesApiDemo {
    public static void main(String[] args) throws Exception {
        var config = """
            server.port=8080
            server.host=localhost
            database.url=jdbc:postgresql:
            database.pool.size=10
            """;
        Files.writeString(Path.of("application.properties"), config);
        System.out.println("Config written successfully");

        String configContent = Files.readString(Path.of("application.properties"));
        System.out.println("Config content:\n" + configContent);

        var properties = configContent.lines()
            .filter(line -> !line.isBlank() && !line.startsWith("#"))
            .collect(Collectors.toMap(
                line -> line.substring(0, line.indexOf("=")),
                line -> line.substring(line.indexOf("=") + 1)
            ));
        System.out.println("Parsed: " + properties);

        for (int i = 0; i < 3; i++) {
            var logEntry = java.time.Instant.now() + " - Log entry " + i + "\n";
            Files.writeString(
                Path.of("app.log"),
                logEntry,
                StandardOpenOption.CREATE,
                StandardOpenOption.APPEND
            );
        }

        String transformed = Files.readString(Path.of("application.properties"))
            .lines()
            .filter(line -> line.startsWith("server."))
            .map(String::toUpperCase)
            .collect(Collectors.joining("\n"));
        System.out.println("Server config:\n" + transformed);

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

### Scenario 2: Configuration migration

public void migrateConfig(Path oldConfig, Path newConfig) throws IOException {
    var content = Files.readString(oldConfig);
    var migrated = content
        .replace("db.url", "spring.datasource.url")
        .replace("db.user", "spring.datasource.username")
        .replace("db.pass", "spring.datasource.password");
    Files.writeString(newConfig, migrated);
}

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `readAllBytes()` + `new String()` | Verbose, no charset control | Use `Files.readString()` |
| Forgetting `StandardOpenOption.CREATE` | File must already exist | Add `CREATE` or `CREATE_NEW` |
| Reading huge files with `readString()` | Loads entire file into memory | Use `Files.lines()` for large files |
| Not handling `IOException` | Checked exception | Use `throws IOException` or try-catch |

