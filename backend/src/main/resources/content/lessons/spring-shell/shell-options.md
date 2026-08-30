---
title: Shell Options — Parameters, Defaults, and Validation
summary: How to define shell command options, default values, required vs optional parameters, value providers, and tab completion.
order: 3
minutes: 15
topics: [options, parameters, defaults, completion, value-providers, validation]
docs:
  - https://docs.spring.io/spring-shell/reference/
---

## The Concept, From Zero

Shell options are the parameters your commands accept. Spring Shell handles parsing `--flag value` syntax, tab completion, and help generation automatically.

```java
@ShellMethod(value = "Search", key = "search")
public String search(
    @ShellOption String query,              // required
    @ShellOption(defaultValue = "10") int limit,  // optional with default
    @ShellOption(defaultValue = ShellOption.NULL) String format  // nullable
) {
    return "Found results for: " + query;
}
```

---

## Option Types

### Required (no defaultValue)

```java
@ShellMethod(value = "Delete", key = "rm")
public String rm(@ShellOption String filename) { ... }
// Usage: rm --filename file.txt
```

### Optional with Default

```java
@ShellMethod(value = "List", key = "ls")
public String ls(@ShellOption(defaultValue = ".") String path) { ... }
// Usage: ls  OR  ls --path /tmp
```

### Nullable (can be explicitly null)

```java
@ShellMethod(value = "Greet", key = "greet")
public String greet(@ShellOption(defaultValue = ShellOption.NULL) String name) {
    return name != null ? "Hello " + name : "Hello stranger";
}
```

### Multiple Values

```java
@ShellMethod(value = "Process files", key = "process")
public String process(@ShellOption String... files) { ... }
// Usage: process --files a.txt b.txt c.txt
```

---

## Line-by-Line Walkthrough

```java
import org.springframework.shell.standard.*;
import org.springframework.stereotype.Component;

@Component
public class AdvancedCommands {

    // 1. Value provider for tab completion
    @ShellMethod(value = "Set environment", key = "env-set")
    public String setEnv(
            @ShellOption(valueProvider = EnvironmentProvider.class) String env,
            @ShellOption String key,
            @ShellOption String value) {
        return "Set " + env + "." + key + " = " + value;
    }

    // 2. Validation via custom converter
    @ShellMethod(value = "Scale replicas", key = "scale")
    public String scale(
            @ShellOption int count,
            @ShellOption(defaultValue = "1") int minAvailable) {
        if (count < 0) throw new IllegalArgumentException("Count must be non-negative");
        return "Scaling to " + count + " replicas";
    }

    // 3. Availability based on option values
    @ShellMethod(value = "Deploy", key = "deploy")
    public String deploy(
            @ShellOption String env,
            @ShellOption(defaultValue = "false") boolean force) {
        if ("prod".equals(env) && !force) {
            return "Use --force to deploy to production";
        }
        return "Deployed to " + env;
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| All options required | Unusable command | Provide sensible defaults |
| No tab completion | Poor UX | Implement ValueProvider |
| Naming conflicts between commands | Ambiguous parsing | Use unique option names per command |
| Not validating input | Runtime errors | Check constraints before processing |
