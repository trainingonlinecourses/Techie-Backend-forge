---
title: Shell Testing — Unit and Integration Tests for CLI
summary: How to test Spring Shell commands, using CommandRunner for integration tests, mocking dependencies, and testing availability conditions.
order: 4
minutes: 15
topics: [shell-testing, command-runner, integration-test, mock, availability]
docs:
  - https://docs.spring.io/spring-shell/reference/
---

## The Concept, From Zero

Spring Shell provides `CommandRunner` to test commands in integration tests. You simulate user input and verify the output.

```java
@SpringBootTest
class GreetingCommandsTest {

    @Autowired
    private CommandRunner runner;

    @Test
    void testHello() {
        String output = runner.call("hello", "--name", "Alice");
        assertThat(output).contains("Hello, Alice!");
    }
}
```

---

## Line-by-Line Walkthrough

```java
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.shell.CommandRunner;
import org.springframework.shell.test.Out;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class FileCommandsTest {

    @Autowired
    private CommandRunner runner;

    @Out
    private Out terminal;  // captures output

    @Test
    void testListFiles() {
        String output = runner.call("ls", "--path", ".");
        assertThat(output).contains("Files in .");
    }

    @Test
    void testCopy() {
        String output = runner.call("cp",
            "--source", "a.txt",
            "--destination", "b.txt");
        assertThat(output).contains("Copied a.txt to b.txt");
    }

    @Test
    void testCreateUserValidation() {
        // Should fail validation
        String output = runner.call("create-user",
            "--username", "",
            "--email", "test@example.com");
        assertThat(output).contains("Username required");
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Test with mocked dependencies

```java
@SpringBootTest
class DeployCommandsTest {

    @Autowired
    private CommandRunner runner;

    @MockBean
    private DeployService deployService;

    @Test
    void testDeployDryRun() {
        String output = runner.call("deploy", "--env", "staging", "--dry-run", "true");
        assertThat(output).contains("Dry run");
        verifyNoInteractions(deployService);  // dry run shouldn't call service
    }
}
```

### Scenario 2: Test availability

```java
@Test
void testAdminCommandUnavailable() {
    // When user is not admin
    String output = runner.call("admin-reset");
    assertThat(output).contains("admin role required");
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not using @SpringBootTest | Context not loaded | Always use full context |
| Forgetting @Out | Can't capture output | Inject Out for verification |
| Not testing edge cases | Missing validation | Test empty inputs, invalid values |
| Mocking everything | Tests don't catch real bugs | Use real dependencies where possible |
