---
title: Scanner & User Input — Reading Data the Safe Way
summary: How Scanner tokenizes input, the notorious nextInt-vs-nextLine newline trap, validation loops, and why server-side Java reads configuration instead of keyboards.
order: 72
minutes: 16
topics: [scanner, user-input, nextline-trap, console, input-validation]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Scanner.html
---

## The Concept, From Zero

Every program eventually needs data from outside itself. In desktop tools and coding exercises that data comes from **standard input** (the keyboard). Java's most beginner-friendly tool for it is `java.util.Scanner` — a text parser that breaks an incoming stream into **tokens** (words, numbers, lines) and converts them to typed values.

```java
import java.util.Scanner;                       // bring in the class

public class Greeter {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);   // System.in = raw keyboard byte stream
        System.out.print("What's your name? ");
        String name = scanner.nextLine();           // read everything up to Enter
        System.out.println("Hello, " + name + "!");
    }
}
```

Line by line:

| Line | What it does |
|---|---|
| `new Scanner(System.in)` | Wraps the raw `InputStream` (bytes) in a parser that understands text |
| `scanner.nextLine()` | Blocks (waits) until the user presses Enter, then returns the whole line without `\n` |

## The Famous nextLine Trap

This trips up virtually every beginner. Watch:

```java
Scanner sc = new Scanner(System.in);

System.out.print("Age: ");
int age = sc.nextInt();          // reads digits "25" but leaves the trailing '\n' in the stream!

System.out.print("Name: ");
String name = sc.nextLine();     // returns "" instantly — it consumed the leftover '\n'!
```

Why: `nextInt()` stops as soon as it has a valid number. The **newline you typed is still sitting in the buffer**, and the very next `nextLine()` sees it as "user pressed Enter on an empty line."

The standard fix — clear the leftovers:

```java
int age = sc.nextInt();
sc.nextLine();                   // consume the dangling '\n' — throw the empty token away
String name = sc.nextLine();     // now this genuinely waits for a name
```

## Reading Different Types

| Method | Reads | Throws if not parseable |
|---|---|---|
| `nextLine()` | Whole line as String | never |
| `next()` / `nextWord()` | One whitespace-separated token | never |
| `nextInt()` / `nextLong()` | Integer types | `InputMismatchException` |
| `nextDouble()` | Decimal number | `InputMismatchException` |
| `hasNextInt()` etc. | Just *checks* without consuming | never — use before reading |

### A robust validation loop

```java
Scanner sc = new Scanner(System.in);
int age;
while (true) {                          // loop until we get valid data
    System.out.print("Enter your age: ");
    if (sc.hasNextInt()) {              // peek: is the next token really an integer?
        age = sc.nextInt();             // safe to read now
        if (age >= 0 && age <= 130) break;  // domain check too, not just type check
    } else {
        String bad = sc.next();         // MUST consume the bad token or we loop forever on it
        System.out.println("'" + bad + "' isn't a number.");
    }
}
```

The `else` branch matters: `hasNextInt()` only *peeks*. If you don't consume the invalid token with `sc.next()`, the loop spins endlessly staring at the same garbage.

## Scanner Beyond Keyboards

`Scanner` parses **any** text source — that's its real power:

```java
// Parse a CSV-ish string instead of user input
Scanner rowParser = new Scanner("42,true,hello");
rowParser.useDelimiter(",");            // split on commas rather than whitespace
int id = rowParser.nextInt();           // 42
boolean flag = rowParser.nextBoolean(); // true

// Read a file token by token
try (Scanner fileScanner = new Scanner(new File("data.txt"))) {
    while (fileScanner.hasNextLine()) {
        process(fileScanner.nextLine());
    }
}
```

- `useDelimiter(...)` redefines what separates tokens.
- For files prefer `Files.readAllLines`/NIO (see File I/O lesson) — Scanner swallows `IOException`s internally.

## Real Organizational Scenarios

**Scenario 1 — CLI admin tools.** Ops teams build small console utilities (reset a user, trigger a migration). They wrap Scanner reads in validation loops exactly like above, because an operator typo must be rejected, not crash the tool.

**Scenario 2 — Interactive installers.** Database migration wizards prompt for host/port/password. The nextLine trap bites here constantly — the team standard is "always `sc.nextLine()` after any numeric read."

**Scenario 3 — Why servers don't use it.** A Spring Boot backend has no keyboard — requests arrive over HTTP. Server-side input handling uses `@RequestParam`, DTO binding, and Bean Validation; Scanner-style console input belongs mainly to tools, tests, and learning exercises.

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `nextInt()` followed directly by `nextLine()` | Second read returns empty string | Insert a bare `sc.nextLine()` between them |
| Validation loop without consuming bad tokens | Infinite loop printing same error | Call `sc.next()` in the else branch |
| Never closing Scanner wrapping System.in | Warning; closing can also kill stdin for the JVM | Fine to leave open for System.in; close file-based scanners |
| Assuming `hasNextInt()` consumed anything | Double-read bugs | It only peeks — pair with an actual read |
