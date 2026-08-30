---
title: Trees and Graphs — Hierarchies and Networks
module: data-structures-algorithms
order: 4
minutes: 28
topics: ["binary trees", "BST", "tree traversal", "graphs", "BFS", "DFS"]
summary: Lists and maps organize data linearly. Trees and graphs organize relationships — and they're everywhere in software: file systems (directories nest...
docs:
  - title: "Tree (data structure) — Wikipedia"
    url: "https://en.wikipedia.org/wiki/Tree_(data_structure)"
  - title: "Graph (abstract data type) — Wikipedia"
    url: "https://en.wikipedia.org/wiki/Graph_(abstract_data_type)"
---

# Trees and Graphs — Hierarchies and Networks

## The Concept: Two Shapes of Connection

Lists and maps organize data *linearly*. **Trees and graphs** organize *relationships* — and they're everywhere in software: file systems (directories nest), HTML (the DOM), databases (indexes are trees), social networks (friendship graphs), routing (pathfinding), and dependency resolution (which packages depend on which).

**The tree** is a hierarchy: one **root** node, and every other node has exactly one **parent**. No cycles, no loops — following parents always leads to the root. It's the org chart, the folder structure, the family tree.

**The graph** is a network: nodes (**vertices**) connected by **edges**, with no such restriction. Anything can connect to anything, cycles are allowed. It's the road map, the social network, the dependency graph. A tree is actually a *special case* of a graph (a connected, acyclic graph).

**The mental model:** a tree is one-way streets in a hierarchy — every node knows its parent, and there's exactly one path from root to any node. A graph is a road network — many routes, many loops, and you may need to *search* for a path. Trees let you navigate by following structure; graphs require you to explore.

## A Binary Tree in Java

A **binary tree** is a tree where each node has at most two children (left/right). The most important variant is the **binary search tree (BST)**: left child < parent < right child, at every node. That ordering is what makes searching O(log n) — at each node you discard half the remaining tree:

```java
class Node {
    int value;
    Node left, right;
    Node(int v) { value = v; }
}

public class BstDemo {
    // Insert following the BST invariant: smaller goes left, larger right.
    static Node insert(Node node, int value) {
        if (node == null) return new Node(value);       // found the spot
        if (value < node.value) node.left = insert(node.left, value);
        else if (value > node.value) node.right = insert(node.right, value);
        return node;                                    // duplicate: ignore
    }

    // Search: at each node, go left/right — halving the space each time.
    static boolean contains(Node node, int value) {
        if (node == null) return false;                 // not present
        if (value == node.value) return true;
        return value < node.value
                ? contains(node.left, value)
                : contains(node.right, value);
    }

    // In-order traversal: left, self, right -> yields SORTED order.
    static void inOrder(Node node) {
        if (node == null) return;
        inOrder(node.left);
        System.out.print(node.value + " ");
        inOrder(node.right);
    }

    public static void main(String[] args) {
        Node root = null;
        for (int v : new int[]{50, 30, 70, 20, 40, 60, 80}) {
            root = insert(root, v);
        }
        System.out.println(contains(root, 40));   // true
        System.out.println(contains(root, 41));   // false
        inOrder(root);                            // 20 30 40 50 60 70 80 — sorted!
    }
}
```

**Walking through it:** `insert` recurses down, choosing left or right by comparison, until it finds a null slot — the new node's home. `contains` mirrors it: at each node, three outcomes (found, go left, go right), so the search space halves each step → **O(log n)** for a *balanced* tree. The beautiful payoff is `inOrder`: because of the left < node < right invariant, visiting left-then-self-then-right prints the values **in sorted order** — a sorted output from an unordered insert sequence.

**The balance caveat:** if you insert sorted data (1, 2, 3, ...), the "tree" degenerates into a straight line — a linked list — and every operation becomes O(n). **Self-balancing trees** (red-black trees in `TreeMap`/`TreeSet`, AVL trees, B-trees in databases) rotate nodes after inserts to keep the height ~log n. This is why `TreeMap` guarantees O(log n) no matter the insertion order, and why database indexes use B-trees (a generalization with many children per node, optimized for disk blocks).

## Tree Traversals: The Four Flavors

- **Pre-order** (self, left, right): used to *copy* a tree or serialize structure — the root comes first.
- **In-order** (left, self, right): sorted order for BSTs.
- **Post-order** (left, right, self): children before parents — used for deleting trees and evaluating expression trees (compute children, then combine).
- **Level-order (BFS)**: root, then its children, then grandchildren — used for breadth-first tasks like finding the shallowest node.

## Graphs: The Two Searches

A graph is nodes + edges. The two fundamental explorations:

```java
import java.util.*;

public class GraphDemo {
    // Adjacency list: node -> list of neighbors.
    static Map<String, List<String>> graph = new HashMap<>();

    static {
        graph.put("A", List.of("B", "C"));
        graph.put("B", List.of("A", "D", "E"));
        graph.put("C", List.of("A", "F"));
        graph.put("D", List.of("B"));
        graph.put("E", List.of("B", "F"));
        graph.put("F", List.of("C", "E"));
    }

    // BFS: explore level by level using a QUEUE.
    // Finds the SHORTEST path (in unweighted graphs).
    static List<String> bfs(String start, String target) {
        Queue<String> queue = new ArrayDeque<>();
        Map<String, String> cameFrom = new HashMap<>();   // path reconstruction
        Set<String> visited = new HashSet<>();

        queue.add(start);
        visited.add(start);

        while (!queue.isEmpty()) {
            String node = queue.poll();
            if (node.equals(target)) break;

            for (String neighbor : graph.getOrDefault(node, List.of())) {
                if (visited.add(neighbor)) {        // not seen before?
                    cameFrom.put(neighbor, node);
                    queue.add(neighbor);
                }
            }
        }
        return reconstruct(start, target, cameFrom);
    }

    // DFS: explore one branch fully before backtracking, using a STACK
    // (or recursion). Good for "does a path exist", mazes, topology.
    static boolean dfs(String node, String target, Set<String> visited) {
        if (node.equals(target)) return true;
        visited.add(node);
        for (String n : graph.getOrDefault(node, List.of())) {
            if (!visited.contains(n) && dfs(n, target, visited)) return true;
        }
        return false;
    }

    static List<String> reconstruct(String start, String target,
                                    Map<String, String> cameFrom) {
        LinkedList<String> path = new LinkedList<>();
        String cur = target;
        while (cur != null && !cur.equals(start)) { path.addFirst(cur); cur = cameFrom.get(cur); }
        if (cur != null) path.addFirst(start);
        return path;
    }

    public static void main(String[] args) {
        System.out.println(bfs("A", "F"));        // [A, C, F] — shortest
        System.out.println(dfs("A", "F", new HashSet<>()));  // true
    }
}
```

**The two search strategies, and when each wins:**

- **BFS** uses a *queue*: it explores in expanding rings from the start, guaranteeing the **shortest path** in unweighted graphs (fewest edges). The `cameFrom` map records, for each visited node, the node that discovered it — walking it backward reconstructs the path. The `visited` set is essential: without it, cyclic graphs loop forever. Complexity: O(V + E) — every vertex and edge touched once.

- **DFS** uses a *stack* (here, recursion): it plunges down one branch to its end before backtracking. It's simpler, uses less memory on wide graphs, and is the natural fit for "does a path exist", detecting cycles, topological sorting, and exploring mazes. It does *not* guarantee shortest paths.

## The Two Representations

Graphs are stored two ways, and the choice matters:

- **Adjacency list** (used above): each node maps to its neighbors. Memory: O(V + E). Iterating a node's neighbors is cheap. **The default choice** for sparse graphs (most real ones).
- **Adjacency matrix**: a V×V boolean grid where `[i][j]` says "edge i→j". Lookup of *whether* an edge exists is O(1), but memory is O(V²) — wasteful for sparse graphs, ideal for dense ones or when edge-existence checks dominate.

## Recap

Trees are rooted hierarchies with one parent per node and no cycles; binary search trees impose ordering (left < node < right) to get O(log n) search and sorted in-order traversal — provided they stay balanced (that's what red-black trees and B-trees do). Graphs are unrestricted networks explored by BFS (queue, shortest paths, O(V+E)) or DFS (stack/recursion, path existence, cycles), represented as adjacency lists or matrices. Every "dependency", "route", and "hierarchy" problem in software is one of these two shapes — and choosing the right traversal and representation is most of the battle.
