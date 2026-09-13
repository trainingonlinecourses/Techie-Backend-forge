---
title: Comments & Javadoc — Writing Notes the Tools Can Read
summary: Java has three comment forms — //, /* */ and /** */ — and the third one is machine-readable: javadoc turns it into HTML documentation, and the IDE renders it on every hover. This lesson covers the syntax, when each form is right, and the tags worth knowing.
order: 7
minutes: 14
topics: [comments, javadoc, documentation, syntax, ide]
docs:
  - https://docs.oracle.com/javase/specs/jls/se21/html/jls-3.html#jls-3.7
capstone: false
---

## The Concept, From Zero

Comments come in three forms, each with a distinct job:

```java
// A single-line comment — for a note that fits on one line.

/* A multi-line (block) comment — for longer prose
   that should not reach the compiler. */

/**
 * A documentation comment — a structured contract read by tools.
 */
```

All three are stripped before compilation: the compiler sees none of them, and neither does the JVM. That has a practical consequence this platform's own editor demonstrates: **comments can't explain behavior at runtime** — the code itself has to be readable. Comments are for the *why* that code can't express.

### Javadoc is different: it's an API

A `/** */` comment on a class, method, or field is **documentation the toolchain consumes**:

- `javadoc` generates the HTML API docs you see at docs.oracle.com.
- Your IDE renders it on hover, in completion popups, and in parameter hints.
- Tools like Checkstyle can enforce that public APIs carry it.

The structure has a convention: a short one-sentence summary first (it becomes the entry in index pages), then detail, then **block tags**:

```java
/**
 * Transfers money between two accounts atomically.
 * <p>
 * Either both legs commit, or neither does. Throws rather than
 * leaving a partial transfer behind.
 *
 * @param from   the account to debit; must not be closed
 * @param to     the account to credit; must not be closed
 * @param amount a positive amount, in minor units (cents)
 * @return the new balance of {@code from}
 * @throws InsufficientFundsException if {@code from} cannot cover {@code amount}
 */
public long transfer(Account from, Account to, long amount) {
    ...
}
```

The tags worth knowing by heart:

| Tag | Purpose |
|---|---|
| `@param` | one per parameter, name then description |
| `@return` | what the method gives back (omit for `void`) |
| `@throws` | one per checked/notable runtime exception, **and when** |
| `{@code ...}` | inline code font — prevents HTML mangling of `<`, `&` |
| `@see` | pointer to a related class or method |
| `@since` | the version the API appeared — vital for public APIs |

Two of these are load-bearing in real code. `@throws` documents the **contract**: what makes the method fail, so callers can handle it without reading the source. `@since` is how API authors communicate compatibility — when a method says `@since 21`, every consumer knows it will not compile on Java 17.

### Writing comments that earn their place

Good comments answer **why**, because the code already says **what**:

```java
// Retry exactly 3 times: the upstream cache propagates updates with up
// to 2s lag, so earlier retries see stale reads (see BACK-4471).
```

That comment encodes a decision, a reason, and a pointer — none of which any amount of clean code can express. Compare it with noise:

```java
i++;   // increment i          ← restates the code; delete it
```

Warn about consequences, explain workarounds, link to the ticket — skip the narration. A useful smell test: if deleting the comment loses information, it earns its line; if not, it was paraphrasing the compiler.

### The tags in the wild

You've already read Javadoc without noticing: every hover tooltip that says "Throws: IOException if ..." is a rendered `@throws`. Since Java 23, Javadoc comments can even be written in **Markdown** (JEP 467) — but the classic `@param`/`@return`/`@throws` tags remain the vocabulary every Java codebase speaks.

## Common Mistakes

- **Narrating the obvious** — `// loop over users` above a `for` loop adds nothing. Comment decisions, not mechanics.
- **Stale comments** — a comment that contradicts the code is worse than none. When you change behavior, hunt down its comments first.
- **Commenting out dead code** — that's what version control is for. Delete it; Git remembers.
- **Javadoc without `@throws` on a checked exception** — callers must handle it; make the condition explicit or they'll wrap it in a blanket `catch`.
- **HTML characters in Javadoc** — writing `a < b` raw breaks the generated HTML. Use `{@code a < b}`.

## Quick Checklist

- [ ] I can name the three comment forms and when each is appropriate.
- [ ] I can write Javadoc with `@param`, `@return`, `@throws`, and `{@code}`.
- [ ] I can explain why `@throws` documentation is part of a method's contract.
- [ ] I can tell a "why" comment (keep) from a "what" comment (delete).

## References

- [Oracle — Writing Javadoc (javadoc tool)](https://docs.oracle.com/en/java/javase/21/javadoc/javadoc.html)
- [dev.java — Documenting your code](https://dev.java/learn/javadoc/)
- [W3Schools — Java Comments](https://www.w3schools.com/java/java_comments.asp)
- [GeeksforGeeks — Comments in Java](https://www.geeksforgeeks.org/comments-in-java/)
- [Learn Java Online — Interactive exercises](https://www.learnjavaonline.org/)
