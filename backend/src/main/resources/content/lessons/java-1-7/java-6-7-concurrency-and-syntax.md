---
title: Java 6–7 (2006–2011) — Fork/Join, try-with-resources, Diamond and NIO.2
summary: Java 7 closed a decade of paperwork: the fork/join framework that powers parallel streams, automatic resource management, the diamond operator, strings in switch, and a modern file API. The quiet release that made Java pleasant again before Java 8 rewrote everything.
order: 4
minutes: 13
topics: [Java 6, Java 7, Fork Join, try-with-resources, Diamond Operator, NIO.2]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html
  - https://docs.oracle.com/javase/7/docs/technotes/guides/lang/enhancements.html
capstone: false
---

## The idea in one sentence

Java 6 tuned the JVM, and Java 7 (2011, the first post-Sun release under Oracle) paid down a decade of syntax debt — with the fork/join framework quietly laying the groundwork for everything parallel you'll use later.

## The release in one table

| Feature | Pain it killed |
|---|---|
| `switch` over `String` | Chains of `if (s.equals("A")) else if (s.equals("B"))...` |
| Diamond operator `<>` | `Map<String, List<Integer>> m = new HashMap<String, List<Integer>>();` |
| try-with-resources | Manual `finally { stream.close(); }` — forgotten closes, leaked file handles |
| NIO.2 (`java.nio.file`) | `File`'s error-swallowing API; recursive directory walks by hand |
| Fork/Join (`ForkJoinPool`) | Hand-rolled thread pools with no work-stealing |
| Underscores in literals (`1_000_000`) | Counting zeros in payment amounts |

## Java 7 in action (runnable)

```java
import java.util.*;

public class JavaSeven {
    public static void main(String[] args) {
        Map<String, Integer> stock = new HashMap<>();
        stock.put("CPU", 5);
        stock.put("GPU", 2);

        Integer gpus = stock.get("GPU");
        System.out.println("GPUs left: " + gpus);

        String cmd = "status";
        switch (cmd) {
            case "start":
                System.out.println("starting...");
                break;
            case "status":
                System.out.println("all systems nominal");
                break;
            default:
                System.out.println("unknown command");
        }
    }
}
```

**What this code does — step by step:**

1. `new HashMap<>()` — the **diamond**: the compiler infers `String, Integer` from the variable's declared type. Before 7, you repeated the full generic type twice; every repetition was a chance to mistype it.
2. `stock.get("GPU")` — the O(1) map read you met in lesson 2, now with cleaner syntax.
3. `switch (cmd)` on a **String** — legal since Java 7. The compiler compiles this to a hash-based jump, so it's also *faster* than an equals-chain.
4. `break` after each case prevents fall-through — the default handles everything else.

> 🔧 **Try it:** change `"status"` to `"start"` and run again — one variable, three behaviors. Then try removing `break` and observe fall-through (a real, historical source of bugs).

## Try-with-resources: closing files correctly, forever

Before 7, correct file handling was a boilerplate trap:

```java
// The pre-7 way (display only — do not write this):
BufferedReader r = null;
try {
    r = new BufferedReader(new FileReader(path));
    return r.readLine();
} finally {
    if (r != null) r.close();   // forgot this? handle leak. close() throws? masks the real error
}
```

Java 7 made the JVM do it:

```java
// The Java 7 way (display only — needs a real filesystem):
try (BufferedReader r = new BufferedReader(new FileReader(path))) {
    return r.readLine();
}   // close() is guaranteed here, even on exception — and nested failures are suppressed, not lost
```

**Why it's better, precisely:** any class implementing `AutoCloseable` qualifies. The close happens in reverse declaration order, exceptions from the body win over exceptions from `close()`, and the latter are attached as *suppressed* — nothing is silently lost. In backend code you'll use it for JDBC `Connection`s, HTTP clients, and file channels; every Spring data-access wrapper is built on this guarantee.

## Fork/Join: divide, conquer, steal

Fork/join is the recursive parallelism engine — split a big task until pieces are tiny, run pieces in parallel, join the results. Its trick is **work-stealing**: idle threads take queued subtasks from busy threads' queues, so no core sits idle while another drowns.

```
sum(array of 100M)                    (display only)
├── sum(left 50M)  → forks into 25M+25M → ...
└── sum(right 50M) → ...
final = left.join() + right.join();
```

```java
// Shape of a fork/join task (display only):
class SumTask extends RecursiveTask<Long> {
    protected Long compute() {
        if (smallEnough) return sumDirectly();
        SumTask left = new SumTask(lowHalf), right = new SumTask(highHalf);
        left.fork();                      // queue for stealing
        return right.compute() + left.join();
    }
}
new ForkJoinPool().invoke(new SumTask(array));
```

**Why you should care *now*:** `Collection.parallelStream()` (Java 8) runs **on the common ForkJoinPool** — when you meet parallel streams in the Streams module, this is the machinery underneath, and "don't block inside a parallel stream" makes instant sense: a blocked task starves the shared pool every fork/join consumer on the JVM uses.

## NIO.2: files without the regret

`java.io.File` returned `false` from `delete()` on failure instead of explaining why. `java.nio.file.Files` (Java 7) throws exceptions that say what actually went wrong, and `Path` + `Files` + `DirectoryStream` made walking trees, copying, and atomic moves one-liners. You'll meet it properly in the I/O module — for now, know the name and that `File` is the legacy twin.

## Why this era still matters

- **Fork/join** → parallel streams → your data-processing pipelines.
- **try-with-resources** → every JDBC block and HTTP client call you'll write in this course.
- **The diamond** → you typed it a hundred times already; now you know it was Java 7 making collections pleasant.
- Java 6, meanwhile, is mostly invisible today — its lasting gifts were JVM performance (escape analysis, lock optimizations) that made the platform fast enough to take over the server world.

## Common mistakes

| Mistake | Problem | Fix |
|---|---|---|
| Forgetting `break` in a switch | Fall-through executes later cases | One `break` per case, or use switch *expressions* (Java 14) |
| Declaring `new HashMap<String, Integer>()` in new code | Pointless repetition since 2011 | `new HashMap<>()` |
| Doing blocking I/O inside fork/join tasks | Starves the shared pool all parallel streams share | Keep fork/join CPU-bound; use virtual threads for I/O |
| Catching around try-with-resources *instead of* using it | Recreates the leak | Put the resource in the `try(...)` header |

## Quick check

1. What does `new HashMap<>()` save you from, and what does the compiler do with the missing types?
2. Name two guarantees try-with-resources gives that a manual `finally` block doesn't.
3. What runs a `parallelStream()` under the hood?

<!-- answers: repeating the generic types and mistyping them; inferred from the target type; guaranteed close in reverse order, suppressed exceptions preserved; the common ForkJoinPool -->

## References

- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/7/docs/technotes/guides/lang/enhancements.html)
- [W3Schools — Java Tutorial](https://www.w3schools.com/java/)
- [Oracle — official JDK documentation](https://docs.oracle.com/javase/8/docs/technotes/guides/lang/enhancements.html)
