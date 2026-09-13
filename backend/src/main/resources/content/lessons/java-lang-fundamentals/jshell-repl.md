---
title: JShell — Running Java Without a Project
summary: JShell is Java's REPL, shipped with the JDK since Java 9: type an expression, see the result immediately. The fastest way to test an API, check a regex, or learn a new class — no file, no class, no main method. This lesson gets you productive in ten minutes.
order: 8
minutes: 12
topics: [jshell, repl, tools, jdk, learning-workflow]
docs:
  - https://docs.oracle.com/en/java/javase/21/jshell/
capstone: false
---

## The Concept, From Zero

Every Java program you write needs a class, a `main` method, a compile step, a run step. That ceremony is right for applications and wrong for answering a question like "what does `LocalDate.plusDays` return again?" **JShell** (since Java 9) removes the ceremony: it's a **read–eval–print loop** — you type Java, it runs immediately and prints the result.

Start it from a terminal:

```text
$ jshell
|  Welcome to JShell -- Version 21
|  For an introduction type: /help intro

jshell> 1 + 1
$1 ==> 2
```

That's it — no `public class`, no `main`. JShell assigned your result to a variable it named `$1`. Any expression works:

```text
jshell> "backend-forge".toUpperCase()
$2 ==> "BACKEND-FORGE"

jshell> int x = 40
x ==> 40

jshell> x + 2
$3 ==> 42
```

### The two killer features: forward references and auto-imports

JShell is forgiving in ways the compiler is not, and that's what makes it a *learning* tool rather than a toy.

**You can define a method before the class it needs exists.** Normally Java refuses — "cannot find symbol." JShell lets you fix that later:

```text
jshell> int area(int w, int h) { return w * h; }
|  created method area(int,int)

jshell> area(3, 4)
$5 ==> 12
```

**Methods can be redefined on the spot.** Type a method again with a new body and JShell replaces it — the fastest possible edit-run loop:

```text
jshell> String greet(String name) { return "Hi " + name; }
|  created method greet(String)

jshell> greet("Ada")
$6 ==> "Hi Ada"

jshell> String greet(String name) { return "Hello, " + name + "!"; }
|  modified method greet(String)
```

`java.util` and a handful of common packages are auto-imported. For anything else, import directly:

```text
jshell> import java.time.LocalDate

jshell> LocalDate.now().plusDays(30)
$7 ==> 2026-10-14
```

Tab completion works for methods and even shows signatures — the quickest API browser you have.

### Commands vs. code

Slash-commands manage the session (they're not Java):

| Command | What it does |
|---|---|
| `/vars` | list every variable so far |
| `/methods` | list defined methods |
| `/types` | list defined classes/interfaces/enums |
| `/open SomeFile.java` | load a source file into the session |
| `/save session.txt` | save everything you typed |
| `/reset` | wipe the session (fresh state) |
| `/exit` | leave |

`/vars` + `/methods` after a long exploratory session is a great way to see the state you've built up.

### Where JShell fits in real work

- **Learning a new API** — before writing a test class, poke the API in JShell: create the object, call three methods, see the results. (This is exactly what this platform's in-browser editor emulates — with the same "no ceremony" idea.)
- **Checking a regex or format string** — `"2026-09-14".matches("\\d{4}-\\d{2}-\\d{2}")` — try it in JShell before it goes in code review.
- **Debugging arithmetic** — integer division, overflow, rounding: run the exact expression instead of reasoning about it.
- **Prototyping a Stream pipeline** — build it operation by operation, watching the intermediate results.

Note the boundary: JShell is a *development-time* tool. It's not on production servers, not in CI pipelines, and not a scripting substitute — code that survives lives in real files with real tests.

## Common Mistakes

- **Forgetting variables are auto-named** — `$1`, `$2`... are real variables; they can shadow or confuse. Name things you'll reuse: `var list = ...`.
- **Expecting files** — JShell has no packages, no access-modifier enforcement across "files", and no compiler-visible classes. Anything worth keeping belongs in a `.java` file.
- **Trusting state you can't see** — after many redefinitions, your session has old variables holding stale values. `/reset` and re-run when behavior seems impossible.
- **Semicolons optional, sometimes** — expressions don't need them, declarations do. When in doubt, type it.

## Quick Checklist

- [ ] I can start JShell, evaluate an expression, and see the result.
- [ ] I can define and redefine a method without leaving the session.
- [ ] I can import a package and use `/vars` and `/methods` to inspect state.
- [ ] I can name three debugging/learning tasks where JShell beats writing a test class.

## References

- [Oracle — JShell User Guide](https://docs.oracle.com/en/java/javase/21/jshell/introduction-jshell.html)
- [dev.java — jshell command](https://dev.java/learn/jshell/)
- [GeeksforGeeks — JShell in Java](https://www.geeksforgeeks.org/jshell-java-repl/)
- [W3Schools — Java Get Started](https://www.w3schools.com/java/java_getstarted.asp)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
