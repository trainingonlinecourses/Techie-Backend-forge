---
title: Serialization — Turning Objects into Bytes
module: java-io-nio
order: 5
minutes: 26
topics: ["Serializable", "ObjectOutputStream", "serialVersionUID", "transient", "security"]
docs:
  - title: "Serializable (Java SE API)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/io/Serializable.html"
---

# Serialization — Turning Objects into Bytes

## The Concept: Why Serialize at All?

Programs hold objects in memory: a `User`, a `List<Order>`, a `Map<String, Config>`. But memory is **volatile** — it dies with the process. To persist an object to a file, send it over a network, or put it in a cache, you must convert it to a **flat sequence of bytes** that can later be rebuilt into a live object. That conversion is **serialization**; the reverse is **deserialization**.

Think of it like packing a house into shipping containers: you carefully note every room's contents (the object graph), pack them in order (bytes), ship them (file/network), and unpack into an identical house (object). If a room references furniture in another container, you note the reference so it points correctly after unpacking (object identity is preserved).

Java's built-in mechanism — `java.io` serialization — does this automatically by reflecting over an object's fields. It's the simplest way to persist a graph of objects, and it's also the one with sharp edges (versioning, security), which this lesson digs into.

## How It Works

For a class to be serializable it must:

1. **Implement `java.io.Serializable`** — a *marker interface* (no methods; it's a flag saying "I permit serialization").
2. **Have all fields serializable** — primitives and most JDK types are; `Thread`, sockets, and streams are not (mark them `transient`).

Serialization walks the **entire object graph**: if your `User` references `Address`, both get serialized; if two fields point at the *same* object, that identity is preserved on deserialization (no duplication).

## The Code Walkthrough

```java
import java.io.*;
import java.util.List;

class User implements Serializable {
    private static final long serialVersionUID = 1L;   // version stamp (explained below)

    private String name;
    private int age;
    private transient String sessionToken;   // NOT serialized — sensitive or non-serializable

    public User(String name, int age, String sessionToken) {
        this.name = name; this.age = age; this.sessionToken = sessionToken;
    }

    @Override public String toString() {
        return "User{name='" + name + "', age=" + age + ", token='" + sessionToken + "'}";
    }
}

public class SerializationDemo {

    public static void main(String[] args) throws Exception {
        User alice = new User("Alice", 30, "secret-token-xyz");
        User bob   = new User("Bob", 25, "another-secret");

        // 1. Serialize a whole object graph to a file
        try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("users.dat"))) {
            oos.writeObject(alice);
            oos.writeObject(bob);
        }

        // 2. Deserialize back
        try (ObjectInputStream ois = new ObjectInputStream(new FileInputStream("users.dat"))) {
            User a = (User) ois.readObject();
            User b = (User) ois.readObject();
            System.out.println(a);   // User{name='Alice', age=30, token='null'}  <- token lost!
            System.out.println(b);   // User{name='Bob', age=25, token='null'}
        }
    }
}
```

### Walking Through Each Part

**`implements Serializable`** — the marker that opts the class into the mechanism.

**`serialVersionUID`** — a version stamp. On deserialization, the JVM compares the `serialVersionUID` of the bytes with the class on the classpath. If they differ, it throws `InvalidClassException`. This is your protection against reading old data after the class changed shape. If you don't declare it, the JVM *computes* one from the class structure — which means **any change to the class changes the computed UID**, and old data becomes unreadable even for trivial edits. Always declare it explicitly and bump it deliberately when you make incompatible changes.

**`transient`** — the field is skipped entirely. `sessionToken` comes back as `null`. Use `transient` for: secrets (never persist passwords/tokens), non-serializable fields (`Thread`, `Socket`, `Stream`), and derived/cache fields that should be recomputed.

**Part 1 — `writeObject`.** `ObjectOutputStream` handles primitives, strings, and objects, walking the graph. Multiple `writeObject` calls append sequentially — they're read back in the same order.

**Part 2 — `readObject`.** Returns `Object`; cast to the concrete type. The token is `null` — proving `transient` did its job.

## Versioning: What Happens When the Class Changes?

Say v1 serialized `{name, age}` and v2 adds `email`. The `serialVersionUID` is still `1L` (unchanged), and the class is *compatible*: deserialization fills `name`/`age` from the stream and gives `email` its default (`null`). That's the **compatible change** story.

If you *rename* a field or change its type, that's **incompatible** — you must bump the UID, and old data will throw rather than silently corrupt. The practical contract:

- Add fields → keep UID (defaults fill in).
- Remove/rename/rettype fields → bump UID and migrate data explicitly.

For anything long-lived, most teams prefer **JSON** (Jackson/Gson) over Java serialization for the versioning story and cross-language readability — Java serialization's format is opaque and Java-only.

## The Security Problem (Why You Should Be Careful)

Java deserialization has a notorious history: `readObject` will happily instantiate *any* class on the classpath and call its constructors/`readObject` methods. Crafted malicious byte streams have been used to execute arbitrary code (the gadget-chain attacks behind many CVEs). Guidelines:

1. **Never deserialize untrusted input.** Don't accept serialized Java objects from clients, users, or the network.
2. **Use a filter** (Java 9+): `ObjectInputFilter` limits which classes may be deserialized.
3. **Prefer safer formats** — JSON (`Jackson`), or a serialization framework with a strict schema (Protocol Buffers, Avro), for anything crossing a trust boundary.
4. If you must use Java serialization, at minimum set `ObjectInputFilter.Config.setSerialFilter(...)` allowing only your own DTO classes.

## Serializable vs Externalizable

- `Serializable` — automatic, reflection-based, handles the whole graph; you don't control the format.
- `Externalizable` — you implement `writeExternal`/`readExternal` and control exactly what's written. More work, more control, often smaller output. Rarely needed; reach for it only when size/format control matters.

## Common Beginner Pitfalls

1. **No `serialVersionUID`** — the JVM computes one; the first field you add breaks old data. Declare it always.
2. **Serializing a `Thread`, `Socket`, or `Stream`** — runtime `NotSerializableException`; mark such fields `transient`.
3. **`static` fields aren't serialized** (they belong to the class, not the instance) — a common confusion; also, `transient` on `static` is meaningless.
4. **Serializing singletons/`enum`s** — `enum`s serialize by name, not by fields; this is safe.
5. **Reading untrusted streams** — the #1 real-world Java serialization disaster. Filter or use JSON.
6. **Forgetting `readObject` order** — write order and read order must match.

## Key Takeaways

- Serialization flattens an object graph to bytes; deserialization rebuilds it.
- Implement `Serializable`, declare `serialVersionUID`, mark secrets/derived fields `transient`.
- `ObjectOutputStream.writeObject` / `ObjectInputStream.readObject` are the tools.
- Compatible field additions keep the UID; incompatible changes require a bump + migration.
- Never deserialize untrusted data without a filter — prefer JSON for cross-boundary data.
