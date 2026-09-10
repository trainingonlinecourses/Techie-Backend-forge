---
title: Java 22 — Unnamed Variables & Patterns (JEP 456)
summary: Java 22 finalizes the underscore (_) as an unnamed variable. Use it wherever Java forces you to declare something you never read — exception variables, loop counters, switch patterns — for cleaner, intent-first code.
order: 1
minutes: 8
topics: [Java 22, JEP 456, Unnamed Variables, Syntax]
docs:
  - url: https://openjdk.org/jeps/456
    title: JEP 456 — Unnamed Variables & Patterns
capstone: false
---

## The idea in one sentence

Sometimes Java *forces* you to name a variable you never actually use — the exception in a `catch`, the index in a loop, a pattern variable in `switch`. Since **Java 22 (JEP 456)**, you can write a single underscore `_` instead: "yes, there is a value here, and I deliberately ignore it."

## What this code does — step by step

1. Before Java 22, you had to invent names like `e` or `ignored` for values you never touch.
2. Java 22 lets you replace those names with `_`.
3. The compiler knows `_` is never read — so it won't warn you about it, and you can't accidentally use it.
4. The code below compiles and runs on **Java 22+** (the simulator handles the classic form; run it on JDK 22+ to see the `_` forms for real).

```java
public class UnnamedDemo {
    public static void main(String[] args) {
        // 1. Unnamed exception variable — you just don't care WHY it failed.
        try {
            int n = Integer.parseInt("not-a-number");
        } catch (NumberFormatException _) {
            System.out.println("Step 1: parsing failed — and that was fine, we used _ in catch");
        }

        // 2. Unnamed loop variable — only the count matters, not the element.
        String[] names = {"Ada", "Grace", "Linus"};
        int i = 1;
        for (String _ : names) {
            System.out.println("Step 2: slot " + i++ + " is occupied (element ignored with _)");
        }

        // 3. Unnamed pattern in a switch — handle a type without binding it.
        Object payload = 42;
        String kind = switch (payload) {
            case Integer _ -> "a number";
            case String _  -> "text";
            default        -> "something else";
        };
        System.out.println("Step 3: payload is " + kind);

        // 4. Comparison: before Java 22 you had to write (NumberFormatException e)
        //    and live with the unused-variable warning. The intent is clearer now.
    }
}
```

## The three rules to remember

- `_` can only be a *declaration*: a `catch` parameter, a local, a for-each variable, a pattern.
- You cannot *read* `_` — writing `System.out.println(_)` is a compile error.
- Side effects still happen: `case Expression _` still evaluates the expression.

## Common mistakes

| Mistake | What happens | Fix |
|---|---|---|
| Reading `_` (`System.out.println(_)`) | Compile error | Bind it to a real name |
| Using `_` as a normal variable name (`int _ = 5; _++;`) | Compile error on Java 22+ | Name it or drop it |
| Expecting `_` in older code (pre-22) to compile | It was reserved in Java 9+ | Upgrade or name the variable |

## Try it yourself

Open the code editor below, remove the `catch` underscore experiment and add a `while` loop that counts 3→1 using `_`-free code, then run it with **Ctrl+Enter**.

## References

- [OpenJDK — JEP 456](https://openjdk.org/jeps/456)
- [dev.java — the official OpenJDK site](https://dev.java/)
- [inside.java — the Java team at Oracle](https://inside.java/)
