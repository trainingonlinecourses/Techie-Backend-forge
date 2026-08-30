---
title: Spring Shell — Building Interactive CLI Applications
summary: How to build command-line tools with Spring Shell: defining commands, handling options and arguments, availability conditions, and building production CLIs for DevOps and data migration.
order: 1
minutes: 25
topics: ["spring shell", "shell command", "@ShellMethod", "@ShellOption", "availability", "CLI"]
docs:
  - url: "https://spring.io/projects/spring-shell"
    title: "Spring Shell"
---

## The Concept, From Zero

Spring Shell lets you build **interactive command-line applications** using the same Spring patterns you already know. Instead of writing raw `main(String[] args)` with argument parsing, you define commands as annotated methods — Spring Shell handles the parsing, help text, tab completion, and type conversion.

**Real examples of Spring Shell CLIs:**
- Database migration tools: `migrate --env staging --dry-run`
- Cache management: `cache clear --region users`
- User management: `user create --email alice@acme.com --role admin`
- Data import: `import csv --file users.csv --batch-size 1000`
- Health checks: `health check --all --format json`

**When organizations use this:**
- DevOps: Custom deployment and operations tools
- Data teams: ETL and data migration scripts
- Platform teams: Internal admin tools that run in terminals
- SRE: On-call runbooks as executable commands

---

## Setup

```xml
<dependency>
    <groupId>org.springframework.shell</groupId>
    <artifactId>spring-shell-starter</artifactId>
    <version>3.2.1</version>
</dependency>
```

```java
package com.example.cli;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class CliApplication {
    public static void main(String[] args) {
        SpringApplication.run(CliApplication.class, args);
    }
}
```

---

## Your First Command

```java
package com.example.cli.commands;

import org.springframework.shell.standard.ShellComponent;
import org.springframework.shell.standard.ShellMethod;
import org.springframework.shell.standard.ShellOption;

@ShellComponent  // Marks this class as a command provider
public class GreetingCommands {

    /**
     * A simple greeting command.
     * 
     * Usage:  greet --name Alice
     * 
     * @ShellOption defines the named parameter.
     * @ShellMethod defines the command name (method name by default).
     */
    @ShellMethod(value = "Greet a user", key = "greet")
    public String greet(
            @ShellOption(defaultValue = "World") String name) {
        return "Hello, " + name + "!";
    }
}
```

**Running it:**
```
shell:>greet --name Alice
Hello, Alice!

shell:>greet
Hello, World!

shell:>greet --help
greet - Greet a user
  --name: the name to greet (default: "World")
```

---

## Commands with Options and Arguments

```java
@ShellComponent
public class UserCommands {

    private final UserRepository users;

    public UserCommands(UserRepository users) {
        this.users = users;
    }

    /**
     * Create a new user.
     * 
     * Usage:  user create --email alice@acme.com --name "Alice Smith" --role admin
     * 
     * Multiple @ShellOption parameters become named options (flags).
     */
    @ShellMethod(value = "Create a new user", key = "user create")
    public String createUser(
            @ShellOption String email,
            @ShellOption String name,
            @ShellOption(defaultValue = "USER") String role) {

        if (users.existsByEmail(email)) {
            return "ERROR: User with email " + email + " already exists";
        }

        User user = new User(email, name, Role.valueOf(role));
        users.save(user);
        return "User created: " + user.getId();
    }

    /**
     * List all users with optional filtering.
     * 
     * Usage:  user list --role admin
     *         user list --active
     */
    @ShellMethod(value = "List users", key = "user list")
    public String listUsers(
            @ShellOption(required = false) String role,
            @ShellOption(defaultValue = "false") boolean active) {

        List<User> result = users.findAll();

        if (role != null) {
            result = result.stream()
                .filter(u -> u.getRole().name().equals(role))
                .toList();
        }

        if (active) {
            result = result.stream()
                .filter(User::isActive)
                .toList();
        }

        if (result.isEmpty()) {
            return "No users found.";
        }

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("%-5s %-30s %-20s %-10s%n",
            "ID", "Email", "Name", "Role"));
        sb.append("-".repeat(65)).append("\n");

        for (User u : result) {
            sb.append(String.format("%-5d %-30s %-20s %-10s%n",
                u.getId(), u.getEmail(), u.getName(), u.getRole()));
        }
        return sb.toString();
    }

    /**
     * Delete a user by ID.
     * 
     * Usage:  user delete 42
     * 
     * Positional argument (no -- prefix).
     */
    @ShellMethod(value = "Delete a user", key = "user delete")
    public String deleteUser(long id) {
        return users.findById(id)
            .map(user -> {
                users.delete(user);
                return "Deleted user: " + user.getEmail();
            })
            .orElse("User not found: " + id);
    }
}
```

---

## Availability Conditions

Commands can be conditionally available based on bean states:

```java
@ShellComponent
public class DatabaseCommands {

    private final DataSource dataSource;

    @ShellMethod(value = "Run SQL query", key = "db query",
                 availability = "isDatabaseAvailable")
    public String query(
            @ShellOption String sql) {
        // Only available when connected to database
        return jdbcTemplate.queryForList(sql).toString();
    }

    /**
     * Controls whether 'db' commands appear in help and tab-completion.
     * Return true = commands available, false = commands hidden.
     */
    private Availability isDatabaseAvailable() {
        try {
            dataSource.getConnection().close();
            return Availability.available();
        } catch (Exception e) {
            return Availability.unavailable("database not connected");
        }
    }
}
```

---

## Type Conversion

Spring Shell automatically converts string arguments to Java types:

```java
@ShellComponent
public class ConversionExamples {

    @ShellMethod(value = "Type conversion demo", key = "demo")
    public String demo(
            // String — no conversion needed
            @ShellOption String name,
            // Integer — auto-parsed from "42"
            @ShellOption Integer count,
            // Boolean — "true"/"false"/"yes"/"no"
            @ShellOption boolean verbose,
            // File — auto-parsed from file path
            @ShellOption File inputFile,
            // Enum — auto-matched by name
            @ShellOption LogLevel level,
            // List — comma-separated "a,b,c"
            @ShellOption List<String> tags,
            // Duration — ISO-8601 "PT30M" or "30m"
            @ShellOption Duration timeout) {
        return "Received: " + name + ", count=" + count;
    }

    public enum LogLevel { DEBUG, INFO, WARN, ERROR }
}
```

---

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Using `@Component` instead of `@ShellComponent` | Commands not discovered | Use `@ShellComponent` |
| No `--` prefix on options | Arguments treated as positional | Use `@ShellOption` for named params |
| Mutable state in commands | Race conditions in interactive mode | Use `@ShellMethod` without shared mutable state |
| Missing availability checks | Commands fail at runtime | Add `availability` parameter to `@ShellMethod` |
| Not implementing `toString()` | Output shows object reference | Override `toString()` in domain objects |
