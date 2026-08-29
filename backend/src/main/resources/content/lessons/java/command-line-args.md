---
title: Command-Line Arguments — Configuring Programs Without Recompiling
summary: How the String[] args array in main works, parsing and validating arguments safely, flag-style arguments, and how organizations use flags to switch behavior without code changes.
order: 73
minutes: 14
topics: [command-line-arguments, main-method, string-args, cli-flags, configuration]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/environment/index.html
---

## The Concept, From Zero

Look at the main method you've typed a hundred times:

```java
public static void main(String[] args) { }
```

That `String[] args` is not decoration. When you launch:

```bash
java ReportTool report.csv --format=pdf --verbose
```

…the JVM collects everything after the class name into an array and hands it to `main`:

```
args[0] = "report.csv"
args[1] = "--format=pdf"
args[2] = "--verbose"
args.length == 3
```

Key facts beginners miss:

- **Everything arrives as a String.** If you type `java Calc 5`, `args[0]` is the *string* `"5"` — you must convert with `Integer.parseInt(...)` yourself.
- **Spaces separate arguments** unless quoted: `java Tool "hello world"` is ONE argument.
- **args is never null** when launched normally — it's just an empty array if no arguments were passed.

## A Safe Parsing Pattern

```java
public static void main(String[] args) {
    if (args.length < 1) {                          // guard: required input missing
        System.err.println("Usage: java ReportTool <file> [--format=pdf|csv] [--verbose]");
        System.exit(1);                             // non-zero exit code signals failure to scripts
    }

    String file = args[0];                          // positional argument #1

    String format = "csv";                          // sensible default for optional flag
    boolean verbose = false;                        // default off

    for (int i = 1; i < args.length; i++) {         // loop remaining arguments
        String arg = args[i];
        if (arg.equals("--verbose")) {
            verbose = true;                         // boolean flag needs no value
        } else if (arg.startsWith("--format=")) {
            format = arg.substring("--format=".length()); // slice off everything after '='
        } else {
            System.err.println("Unknown option: " + arg);
            System.exit(2);                         // distinct exit code for bad options
        }
    }

    System.out.println("file=" + file + " format=" + format + " verbose=" + verbose);
}
```

Line-by-line highlights:

| Line | Why |
|---|---|
| `if (args.length < 1)` | Fail fast with usage text instead of an ArrayIndexOutOfBoundsException |
| `System.exit(1)` | Shell scripts and CI pipelines branch on exit codes — 0 means success, non-zero means failure |
| `arg.startsWith("--format=")` + `substring` | Classic key=value parsing without any library |
| Unknown option → error | Silent tolerance of typos (`--verbos`) hides bugs; reject them loudly |

## Flags With Values vs Boolean Flags

Two conventions dominate:

```bash
# style 1: key=value
--port=8080

# style 2: space-separated
--port 8080
```

Style 2 requires lookahead logic (`if (arg.equals("--port")) port = Integer.parseInt(args[++i]);`) plus a bounds check — one more place to slip.

## Real Organizational Scenarios

**Scenario 1 — Spring Boot does this for you.** Ever run `java -jar app.jar --server.port=9090`? Spring Boot's `main` receives that exact `String[] args` and passes it into `SpringApplication.run(app, args)`. Command-line arguments become the **highest-priority property source**, overriding application.yml. You've been using this lesson every time you overrode a port!

**Scenario 2 — Batch jobs in cron.** A nightly reconciliation job takes its date as an argument so operators can re-run any historical day: `java -jar recon.jar --date=2026-08-25`. No rebuilds, no config edits, full audit trail in the crontab.

**Scenario 3 — Real libraries exist.** For anything beyond ~3 flags, teams use Picocli or JCommander which handle parsing, validation, `--help` generation, and tab-completion:

```java
@Command(name = "recon")
class ReconCommand implements Runnable {
    @Parameters(index = "0") String file;          // annotated field auto-populated from args
    @Option(names = "--verbose") boolean verbose;

    public void run() { /* ... */ }
}
```

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Reading `args[1]` without length check | ArrayIndexOutOfBoundsException on bare invocation | Validate `args.length` first, print usage |
| Forgetting parseInt/parseDouble | `"=="` comparisons on strings, or compile errors | Convert explicitly, catch NumberFormatException |
| Treating args as null-checkable | Dead code / wrong assumption | It's empty array, never null, under normal launches |
| Silently ignoring unknown flags | Typos activate defaults mysteriously | Reject unknown options with clear errors |
