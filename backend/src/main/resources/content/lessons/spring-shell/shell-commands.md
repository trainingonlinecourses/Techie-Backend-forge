---
title: Shell Commands — Building CLI Interfaces
summary: Defining @ShellMethod commands, parameter types, availability conditions, and building interactive CLI tools with Spring Shell.
order: 2
minutes: 20
topics: [@ShellMethod, cli, commands, availability, options, interactive]
docs:
  - https://docs.spring.io/spring-shell/reference/
---

## The Concept, From Zero

Spring Shell lets you build interactive command-line tools. You define commands with `@ShellMethod`, and Spring Shell handles parsing, help generation, and tab completion.

```java
@Component
public class GreetingCommands {

    @ShellMethod(value = "Say hello", key = "hello")
    public String hello(@ShellOption String name) {
        return "Hello, " + name + "!";
    }
}
```

User types: `hello --name Alice` → Output: `Hello, Alice!`

---

## Line-by-Line Walkthrough

```java
import org.springframework.shell.standard.*;
import org.springframework.stereotype.Component;

@Component
public class FileCommands {

    // 1. Basic command
    @ShellMethod(value = "List files in directory", key = "ls")
    public String listFiles(
            @ShellOption(defaultValue = ".") String path,
            @ShellOption(defaultValue = "false") boolean hidden) {
        // ... list files
        return "Files in " + path;
    }

    // 2. Command with multiple options
    @ShellMethod(value = "Copy files", key = "cp")
    public String copy(
            @ShellOption String source,
            @ShellOption String destination,
            @ShellOption(defaultValue = "false") boolean recursive) {
        // ... copy files
        return "Copied " + source + " to " + destination;
    }

    // 3. Command with validation
    @ShellMethod(value = "Create user", key = "create-user")
    public String createUser(
            @ShellOption String username,
            @ShellOption String email) {
        if (username.isBlank()) throw new IllegalArgumentException("Username required");
        if (!email.contains("@")) throw new IllegalArgumentException("Invalid email");
        return "User created: " + username;
    }

    // 4. Availability conditions
    @ShellMethod(value = "Admin command", key = "admin-reset")
    @ShellMethodAvailability("isAdminAvailable")
    public String adminReset() {
        return "System reset";
    }

    public Availability isAdminAvailable() {
        boolean isAdmin = currentUser.hasRole("ADMIN");
        return isAdmin ? Availability.available() : Availability.unavailable("admin role required");
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Database management CLI

```java
@Component
public class DbCommands {

    private final JdbcTemplate jdbc;

    @ShellMethod(value = "Show table stats", key = "db-stats")
    public String dbStats() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class);
        return "Users: " + count;
    }

    @ShellMethod(value = "Run migration", key = "db-migrate")
    public String migrate(@ShellOption String version) {
        // ... run Flyway migration
        return "Migrated to version: " + version;
    }
}
```

### Scenario 2: Deployment CLI

```java
@Component
public class DeployCommands {

    @ShellMethod(value = "Deploy to environment", key = "deploy")
    public String deploy(
            @ShellOption String env,
            @ShellOption(defaultValue = "false") boolean dryRun) {
        if (dryRun) return "Dry run: would deploy to " + env;
        // ... deploy
        return "Deployed to " + env;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Conflicting key bindings | Command not found | Check `help` for existing keys |
| Not using @ShellOption defaultValue | Command fails without args | Provide defaults or make required |
| Forgetting availability checks | Unauthorized commands exposed | Always check permissions |
| Using interactive input | Breaks scripting | Use @ShellOption for all params |
