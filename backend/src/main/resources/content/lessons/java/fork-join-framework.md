---
title: The Fork/Join Framework — Divide-and-Conquer Parallelism
summary: RecursiveTask and RecursiveAction, work-stealing queues, when ForkJoinPool beats ExecutorService, and the parallel stream trap.
order: 23
minutes: 20
topics: [fork-join, RecursiveTask, RecursiveAction, work-stealing, parallel streams, divide-and-conquer]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/util/concurrent/ForkJoinPool.html
  - https://docs.oracle.com/javase/tutorial/essential/concurrency/forkjoin.html
---

# The Fork/Join Framework — Divide-and-Conquer Parallelism

## The concept: split work, solve subproblems, combine results

The Fork/Join framework is Java's answer to divide-and-conquer algorithms. You split a big task into smaller subtasks (fork), solve each independently, and merge the results (join). Under the hood, a **work-stealing** thread pool keeps all cores busy — idle threads steal tasks from busy ones, eliminating the bottlenecks that plague traditional thread pools.

## RecursiveTask vs RecursiveAction

`RecursiveTask<V>` returns a value; `RecursiveAction` does not:


**What this code does — step by step:**

1. RecursiveTask: fork/join with a result
2. Base case: solve directly
3. Recursive case: split and fork
4. `left.fork();` — run left in another thread
5. `long rightResult = right.compute();` — compute right in this thread
6. `long leftResult = left.join();` — wait for left
7. Usage:

The same code, clean:

```java
public class SumTask extends RecursiveTask<Long> {
    private static final int THRESHOLD = 10_000;
    private final long[] array;
    private final int start, end;

    public SumTask(long[] array, int start, int end) {
        this.array = array;
        this.start = start;
        this.end = end;
    }

    @Override
    protected Long compute() {
        if (end - start <= THRESHOLD) {
            long sum = 0;
            for (int i = start; i < end; i++) sum += array[i];
            return sum;
        }
        int mid = (start + end) / 2;
        SumTask left = new SumTask(array, start, mid);
        SumTask right = new SumTask(array, mid, end);
        left.fork();
        long rightResult = right.compute();
        long leftResult = left.join();
        return leftResult + rightResult;
    }
}

ForkJoinPool pool = new ForkJoinPool();
long sum = pool.invoke(new SumTask(hugeArray, 0, hugeArray.length));
```

## Work-stealing — why ForkJoinPool is different

In a regular `ExecutorService`, threads pull from a shared queue. If one task is slow, other threads sit idle. ForkJoinPool gives each thread its own **deque** — when a thread finishes its work, it **steals** from the busiest thread's deque. This eliminates contention and keeps all cores busy.

```java
// CommonPool: the default ForkJoinPool (Runtime.getRuntime().availableProcessors() threads)
ForkJoinPool.commonPool().submit(() -> {
    // Uses the shared pool — don't block or do I/O here
});

// Custom pool for CPU-bound work
ForkJoinPool customPool = new ForkJoinPool(8);  // 8 worker threads

**When to use ForkJoinPool:** CPU-bound recursive tasks (sorting, image processing, tree traversal, matrix multiplication). **When NOT to use it:** I/O-bound tasks (HTTP calls, database queries), blocking operations, or tasks that don't split naturally.
```

## Common pitfalls — the parallel stream trap

Parallel streams use `ForkJoinPool.commonPool()` by default. Sharing the pool across the application means one slow operation blocks everything:

// BAD: parallel stream uses commonPool — blocks all parallel streams in the app
list.parallelStream()
    .map(id -> httpClient.get("/users/" + id))  // I/O — blocks a pool thread
```java
    .toList();

// BETTER: use a dedicated pool for I/O-bound parallel work
ForkJoinPool ioPool = new ForkJoinPool(20);
```
ioPool.submit(() ->
    list.parallelStream()
        .map(id -> httpClient.get("/users/" + id))
        .toList()
```java
).get();
```

**The fork/join performance rule:** never block inside `compute()` — it starves the thread of work to steal. If you need I/O, use `CompletableFuture` or a regular `ExecutorService` instead.

## RecursiveAction — when you don't need a result

public class MatrixZeroTask extends RecursiveAction {
    private static final int THRESHOLD = 256;
    private final int[][] matrix;
    private final int rowStart, rowEnd;

    public MatrixZeroTask(int[][] matrix, int rowStart, int rowEnd) {
        this.matrix = matrix;
        this.rowStart = rowStart;
        this.rowEnd = rowEnd;
    }

    @Override
    protected void compute() {
        if (rowEnd - rowStart <= THRESHOLD) {
            for (int r = rowStart; r < rowEnd; r++) {
                Arrays.fill(matrix[r], 0);
            }
        } else {
            int mid = (rowStart + rowEnd) / 2;
            invokeAll(
                new MatrixZeroTask(matrix, rowStart, mid),
                new MatrixZeroTask(matrix, mid, rowEnd)
            );
        }
    }
}

## org patterns

**Bulk data processing:** split a large CSV/JSON file into chunks, parse each chunk in parallel, merge results.

public class ChunkedParser extends RecursiveTask<List<Order>> {
```java
    // Split file into 10MB chunks, parse each in parallel
    // Each chunk is independent — perfect for fork/join
}

**Tree processing:** when you have a tree structure (organizational chart, file system, AST), fork at each node:

protected NodeCount compute() {
    if (node.children().isEmpty()) return new NodeCount(1, 0);
```
    List<NodeCount> childCounts = node.children().stream()
        .map(child -> new NodeCount(child).fork())
        .map(forked -> forked.join())
        .toList();
    // combine counts...
}

## Key takeaways

- `RecursiveTask<V>` returns a value; `RecursiveAction` does not. Override `compute()` to implement the divide-and-conquer logic.
- ForkJoinPool uses work-stealing — idle threads steal from busy ones, keeping all cores busy.
- The common pool (`ForkJoinPool.commonPool()`) is shared across the JVM — don't block in it.
- Never do I/O inside `compute()` — it starves the work-stealing mechanism. Use `CompletableFuture` for I/O.
- `invokeAll()` forks both children and waits — cleaner than manual `fork()` + `join()`.

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
