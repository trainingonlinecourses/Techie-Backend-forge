---
title: Recursion with Trees — Where Recursion Earns Its Keep
summary: File systems, JSON, and organizational charts are all trees — data defined in terms of itself. This lesson shows why the recursive solution mirrors the data shape, builds a directory-tree walker and a size calculator, and covers depth-first vs. breadth-first traversal.
order: 3
minutes: 24
topics: [recursion, trees, file-system, traversal, dfs, bfs, files-walk]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/io/walk.html
capstone: false
---

## The Concept, From Zero

A **tree** is any data shape where each thing contains more of the same kind of thing: a folder contains folders and files; a JSON object contains nested JSON objects; a company department contains sub-departments. The definition refers to itself — so the cleanest way to process it also refers to itself. This is the case where recursion isn't a puzzle, it's the natural fit.

The core pattern has the same two parts as always:

- **Base case**: a leaf — a file with no children, a JSON scalar, an employee with no reports.
- **Recursive case**: for each child, do the same thing you're doing right now.

```java
import java.nio.file.Files;
import java.nio.file.Path;
import java.io.IOException;
import java.util.stream.Stream;

public class TreeWalker {
    public static void main(String[] args) throws IOException {
        printTree(Path.of("project"), 0);
    }

    static void printTree(Path dir, int depth) throws IOException {
        String indent = "  ".repeat(depth);              // depth shows the nesting level
        System.out.println(indent + dir.getFileName());
        try (Stream<Path> children = Files.list(dir)) {
            for (Path child : children.toList()) {
                if (Files.isDirectory(child)) {
                    printTree(child, depth + 1);          // recursive case: a folder → recurse deeper
                } else {
                    System.out.println(indent + "  " + child.getFileName());  // base case: a file
                }
            }
        }
    }
}
```

<!-- why -->
**What this code shows:**

- Defines `TreeWalker` with methods `main()`, `printTree()`.
- Uses the Streams API to process data declaratively.
- Uses file I/O with the NIO API.
- Uses loops.

Notice how the code *reads like the problem*: "print this folder, then for each child — if it's a folder, print it the same way one level deeper; if it's a file, print it." Try expressing the same thing with nested loops and you'll quickly drown in loop variables for "which level am I on now?" The recursion carries that state for free: `depth` is a parameter, one per stack frame, exactly matching one folder level.

### Doing something with the result: total size

Actions are the simple case. The more interesting one computes a value **up the tree** — like the `du` command: total size of a folder is the sum of its children's sizes, where folders are themselves summed recursively:

```java
static long totalSize(Path path) throws IOException {
    if (Files.isRegularFile(path)) {
        return Files.size(path);                       // base case: a file's own size
    }
    long sum = 0;
    try (Stream<Path> children = Files.list(path)) {
        for (Path child : children.toList()) {
            sum += totalSize(child);                   // combine children's totals
        }
    }
    return sum;
}
```

<!-- why -->
**What this code shows:**

- Uses the Streams API to process data declaratively.
- Uses file I/O with the NIO API.
- Uses loops.
- Uses conditionals.

This is exactly the factorial shape from earlier, generalized: the combine step (`sum += ...`) happens on the way back up the recursion. Each folder's frame waits for all its children's totals, adds them, and returns the result to *its* parent.

### Depth-first vs. breadth-first

The walker above is **depth-first** (DFS): it dives into the first subfolder completely before looking at the second. The alternative is **breadth-first** (BFS): visit everything at level 1, then everything at level 2, and so on — using a **queue** (`ArrayDeque` used as a FIFO) instead of recursion:

```java
import java.util.ArrayDeque;
import java.util.Deque;

static void printByLevel(Path root) throws IOException {
    Deque<Path> queue = new ArrayDeque<>();
    queue.addLast(root);
    while (!queue.isEmpty()) {
        Path dir = queue.pollFirst();                  // take the OLDEST pending folder
        System.out.println(dir);
        try (Stream<Path> children = Files.list(dir)) {
            for (Path child : children.toList()) {
                if (Files.isDirectory(child)) {
                    queue.addLast(child);              // schedule it for later
                }
            }
        }
    }
}
```

Choosing between them is a real decision, not a style point:

- **DFS (recursion)** matches the data's nesting; needs no extra collection; but stack depth grows with tree depth. Great when answers live *near the leaves* (total size, finding a file by name).
- **BFS (queue)** visits level by level; memory grows with the tree's *width*. Right for "closest match first" — nearest ancestor, shallowest matching node — or when depth is unbounded/deep.

For production file walking, note that the JDK already ships this machinery: `Files.walk(...)` (DFS) and `Files.walkFileTree(...)` (with visitor hooks for pre/post visits and error handling). Learn the pattern by hand once, then reach for the built-ins.

## Common Mistakes

- **Forgetting the leaf case** — a `Files.list` loop that recurses on *every* child crashes with a `FileSystemException` (or spins forever on symlinks) because files aren't folders.
- **Cycles** — if "children" can point back at an ancestor (symlink loops, cyclic JSON), plain recursion never terminates. Track visited nodes in a `Set` and skip repeats.
- **Building with `Files.list` outside try-with-resources** — the returned `Stream` holds an open directory handle; leaks pile up across a deep walk. Always close it (or use `Files.walk` which closes internally).
- **Using recursion where width explodes** — a folder with 100,000 direct children is fine for DFS, but a BFS queue at that level holds 100,000 paths. Match the traversal to the shape.

## Quick Checklist

- [ ] I can identify the base case (leaf) and recursive case (children) of any tree-shaped data.
- [ ] I can write a recursive tree walker that carries state (like `depth`) per level.
- [ ] I can compute a value up the tree (sizes, counts) and explain which work happens on the way back up.
- [ ] I can name one situation each where DFS beats BFS and BFS beats DFS.

## References

- [GeeksforGeeks — Tree Traversals](https://www.geeksforgeeks.org/tree-traversals-inorder-preorder-and-postorder/)
- [Oracle — Walking the File Tree (NIO.2)](https://docs.oracle.com/javase/tutorial/essential/io/walk.html)
- [dev.java — Files and Directories](https://dev.java/learn/java-io/files/)
- [W3Schools — Java Recursion](https://www.w3schools.com/java/java_recursion.asp)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
