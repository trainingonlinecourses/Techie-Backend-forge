---
title: The Process API — Running External Programs from Java
summary: ProcessBuilder launches any executable, captures stdout/stderr without deadlocking, waits with timeouts, and handles exit codes — plus the security questions to ask before you ever call it.
order: 6
minutes: 18
topics: [process, processbuilder, exec, streams, timeout, exit code, commands]
docs:
  - url: https://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html
    title: Oracle — java.lang.ProcessBuilder
  - url: https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Process.html
    title: Oracle — java.lang.Process (Java 17)
  - url: https://www.geeksforgeeks.org/java/processbuilder-in-java-to-create-a-basic-online-judge/
    title: GeeksforGeeks — ProcessBuilder in Java
  - url: https://dev.java/learn/api/processes/
    title: dev.java — Interacting with processes
  - url: https://www.w3schools.com/java/java_intro.asp
    title: W3Schools — Java reference
---

## The idea in one sentence

`ProcessBuilder` spawns an operating-system process from Java — a git command, an ffmpeg
conversion, a compiler — and hands you its input, output, error streams and exit code as
objects you can program against.

## Why ProcessBuilder and not Runtime.exec()

`Runtime.getRuntime().exec("...")` still works, but it is the legacy API: its single-string
form splits on spaces (so paths with spaces break), it hides the working directory, and it
gives you no environment control. `ProcessBuilder` takes an **argument list** (no quoting
headaches), exposes `directory()`, `environment()`, `redirectErrorStream()`, and timeouts
via `Process.waitFor`. New code should never call `exec` with a whole command string.

## The canonical five steps

```java
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

public class ProcessBasics {
    public static void main(String[] args) throws Exception {
        // 1. Build: program name + each argument as its OWN string (no quoting games)
        ProcessBuilder pb = new ProcessBuilder(
                "git", "log", "--oneline", "-3");

        // 2. Optional: control where it runs and what it inherits
        pb.directory(Path.of(".").toFile());       // working directory
        pb.environment().put("GIT_TERMINAL_PROMPT", "0"); // extra env vars

        // 3. Start: returns immediately — the process runs in parallel
        Process p = pb.start();

        // 4. Read its stdout (ALWAYS before waitFor: full OS pipes deadlock if
        //    the child writes more than the pipe buffer while you are waiting)
        StringBuilder out = new StringBuilder();
        try (BufferedReader r = new BufferedReader(
                new InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = r.readLine()) != null) out.append(line).append('\n');
        }

        // 5. Wait — with a timeout so a hung tool can't hang your service
        boolean finished = p.waitFor(30, TimeUnit.SECONDS);
        if (!finished) {
            p.destroyForcibly();        // SIGKILL the stubborn child
            throw new IllegalStateException("git log timed out");
        }

        System.out.println("exit code : " + p.exitValue());
        System.out.println("output    : " + out);
    }
}
```

**The #1 trap is step 4.** Every OS pipe has a small buffer (often 64 KB). If the child
fills the pipe and nobody is draining it, the child *blocks* — and if you are blocked in
`waitFor()` while the child is blocked writing, both freeze forever. Read stdout and
stderr **before or concurrently with** waiting, never after. If you don't care about the
output, redirect it instead:

```java
public class RedirectDemo {
    public static void main(String[] args) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("git", "status");

        // Merge stderr into stdout: one stream to read, no ordering surprises
        pb.redirectErrorStream(true);

        // Or send output straight to a file — then YOU don't drain anything
        // pb.redirectOutput(ProcessBuilder.Redirect.to(java.nio.file.Path.of("out.txt").toFile()));

        Process p = pb.start();
        String combined = new String(p.getInputStream().readAllBytes());
        p.waitFor();
        System.out.println(combined);
    }
}
```

## Reading both streams without deadlock

stdout and stderr are two separate pipes. Drain them on different threads, or merge them
with `redirectErrorStream(true)`:

```java
public class TwoStreams {
    public static void main(String[] args) throws Exception {
        ProcessBuilder pb = new ProcessBuilder("java", "-version"); // writes to STDERR!
        pb.redirectErrorStream(true);                               // merge → one pipe, zero deadlock
        Process p = pb.start();
        try (var r = new BufferedReader(new java.io.InputStreamReader(p.getInputStream()))) {
            String line;
            while ((line = r.readLine()) != null) System.out.println("child: " + line);
        }
        System.out.println("exit: " + p.waitFor());
    }
}
```

> The `java -version` example is the classic proof that stderr matters: it prints to
> **stderr**, and code that only reads stdout mysteriously "sees nothing".

## Exit codes are a contract

| Code | Meaning |
|---|---|
| 0 | success |
| non-zero | failure — and every tool documents which numbers mean what (grep: 1 = no match, 2 = error) |

Never treat "process ran" as "process succeeded". Check `exitValue()`:

```java
public class ExitContract {
    public static void main(String[] args) throws Exception {
        Process p = new ProcessBuilder("git", "rev-parse", "--verify", "HEAD").start();
        p.getInputStream().readAllBytes();   // drain (so no deadlock)
        int code = p.waitFor();
        if (code != 0) {
            System.out.println("not a git repository (or no commits) — exit " + code);
        } else {
            System.out.println("HEAD is valid");
        }
    }
}
```

## How this shows up in backends

- **Online judges / code runners** (the origin of this API's popularity): write submitted
  code to a temp file, invoke the compiler with a timeout, capture diagnostics, kill
  runaways with `destroyForcibly()`.
- **Media and document pipelines**: ffmpeg, LibreOffice headless, ImageMagick invoked per
  upload — with timeouts so a poisoned file can't wedge a worker.
- **DevOps tooling from Java**: git, docker, kubectl driven from admin endpoints.
- **Security rules that go with the territory**: never concatenate user input into a
  command string (command injection — pass it as its own argument or reject it); prefer
  absolute binary paths; run children with a minimal OS user; always set a timeout.
- **Process.destroy() vs destroyForcibly()**: the first is a polite SIGTERM the child can
  handle and clean up with; the second is SIGKILL. Use polite first, forced after a grace
  period.

## Pitfalls checklist

1. **Reading stdout after waitFor** → deadlock on large outputs. Drain first.
2. **Ignoring stderr** → you miss the error message that explains the failure.
3. **No timeout** → one hung tool takes down your thread pool. Always `waitFor(n, unit)`.
4. **Single-string commands** → spaces and shell metacharacters break or inject. Argument lists only.
5. **Assuming the child shares your directory** → set `pb.directory(...)` explicitly.
6. **Leaving children running at shutdown** → track them and destroy on context close.

## References

- [Oracle — ProcessBuilder](https://docs.oracle.com/javase/8/docs/api/java/lang/ProcessBuilder.html)
- [Oracle — Process (Java 17)](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Process.html)
- [GeeksforGeeks — ProcessBuilder](https://www.geeksforgeeks.org/java/processbuilder-in-java-to-create-a-basic-online-judge/)
- [dev.java — Interacting with processes](https://dev.java/learn/api/processes/)
- [W3Schools — Java](https://www.w3schools.com/java/java_intro.asp)
