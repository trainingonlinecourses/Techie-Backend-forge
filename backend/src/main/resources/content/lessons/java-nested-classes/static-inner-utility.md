---
title: Static Nested vs Inner Classes — When to Use Which
summary: The difference between static nested classes, inner classes, anonymous classes, and local classes, with guidance on memory implications and when each type is appropriate.
order: 4
minutes: 18
topics: [static-nested, inner-class, anonymous-class, local-class, memory-leak]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/nested.html
---

## The Concept, From Zero

Java lets you define classes inside other classes. There are four types, and the key difference is whether they hold a reference to the outer class instance:

- **Static nested class**: Like a top-level class that happens to live inside another for packaging. No reference to outer instance.
- **Inner class**: Holds a hidden reference to the outer class instance. Can access outer fields directly.
- **Local class**: Defined inside a method. Used once.
- **Anonymous class**: An unnamed local class created inline.

The critical distinction: inner classes keep the outer class alive in memory. If you accidentally create an inner class in an Activity (Android), the Activity can never be garbage collected.

## The Code

```java
public class LinkedList<T> {

    private Node<T> head;

    // Static nested class — no reference to LinkedList instance
    // This is what you should use by default
    static class Node<T> {
        T data;
        Node<T> next;

        Node(T data) {
            this.data = data;
        }
    }

    // Inner class — holds reference to LinkedList instance
    // Use only when you need access to outer fields
    private class Iterator {
        private Node<T> current = head;

        boolean hasNext() {
            return current != null;
        }

        T next() {
            T data = current.data;
            current = current.next;
            return data;
        }
    }

    public Iterator iterator() {
        return new Iterator();
    }

    // Local class inside a method
    public void forEach(java.util.function.Consumer<T> action) {
        class NodeWalker {
            void walk(Node<T> node) {
                if (node != null) {
                    action.accept(node.data);
                    walk(node.next);
                }
            }
        }
        new NodeWalker().walk(head);
    }
}
```

## Line-by-Line Explanation

| Line | What It Does | Why It Matters |
|------|-------------|----------------|
| `static class Node<T>` | Static nested class | No hidden reference — saves memory |
| `private class Iterator` | Inner class | Has hidden reference to `this` (LinkedList) |
| `class NodeWalker` | Local class | Defined inside method, visible only there |
| `current = head` | Access outer field | Inner classes can access outer private fields |

## Key Takeaways

1. **Prefer static nested** — no hidden reference = no memory leak risk
2. **Inner classes** access outer fields via hidden `Outer.this` reference
3. **Local and anonymous classes** are rarely used — lambdas replaced them
4. **Builder pattern** uses static nested class to avoid holding outer reference
5. **Enum constants** are implicitly static nested classes
