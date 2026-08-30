---
title: Java Serialization — Converting Objects to Bytes
summary: What serialization is, Serializable vs Externalizable, serialVersionUID, custom read/writeObject, serialization proxies, and when to avoid Java serialization entirely.
order: 1
minutes: 25
topics: [serialization, serializable, externalizable, serialVersionUID, java-io]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/io/serializing.html
---

## The Concept, From Zero

**Serialization** converts an object to a byte stream (for storage, network transfer, or caching). **Deserialization** converts it back:

```java
// Serialize: Object → byte[]
User user = new User("Alice", 30);
ByteArrayOutputStream bos = new ByteArrayOutputStream();
ObjectOutputStream oos = new ObjectOutputStream(bos);
oos.writeObject(user);
byte[] bytes = bos.toByteArray();

// Deserialize: byte[] → Object
ByteArrayInputStream bis = new ByteArrayInputStream(bytes);
ObjectInputStream ois = new ObjectInputStream(bis);
User restored = (User) ois.readObject();
```

**⚠️ Warning:** Java serialization has known security vulnerabilities. For new projects, use JSON, Protocol Buffers, or records instead.

---

## Serializable vs Externalizable

```java
// Serializable — marker interface, JVM handles everything
public class User implements Serializable {
    private static final long serialVersionUID = 1L;
    private String name;
    private int age;
    // No code needed — JVM serializes all non-transient fields
}

// Externalizable — you control exactly what's serialized
public class User implements Externalizable {
    private String name;
    private int age;

    @Override
    public void writeExternal(ObjectOutput out) throws IOException {
        out.writeUTF(name);
        out.writeInt(age);
    }

    @Override
    public void readExternal(ObjectInput in) throws IOException {
        name = in.readUTF();
        age = in.readInt();
    }
}
```

---

## Line-by-Line Walkthrough

```java
import java.io.*;
import java.util.*;

public class SerializationDemo {
    // Line 1: Basic Serializable class
    static class User implements Serializable {
        private static final long serialVersionUID = 1L;  // version control
        private String name;
        private int age;
        private transient String password;  // transient = not serialized

        User(String name, int age, String password) {
            this.name = name;
            this.age = age;
            this.password = password;
        }

        @Override
        public String toString() {
            return "User{name='" + name + "', age=" + age + ", password='" + password + "'}";
        }
    }

    // Line 2: Serialization with custom logic
    static class Order implements Serializable {
        private static final long serialVersionUID = 2L;
        private String orderId;
        private List<String> items;
        private double total;
        private transient String cachedSummary;  // not serialized

        // Custom serialization — called during writeObject
        private void writeObject(ObjectOutputStream oos) throws IOException {
            oos.defaultWriteObject();  // serialize normal fields
            oos.writeDouble(total);    // custom: write total explicitly
        }

        // Custom deserialization — called during readObject
        private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
            ois.defaultReadObject();  // deserialize normal fields
            total = ois.readDouble(); // custom: read total
            cachedSummary = items.size() + " items, $" + total;  // rebuild transient
        }
    }

    // Line 3: Serialization proxy pattern (recommended)
    static class Person {
        private final String name;
        private final int age;

        Person(String name, int age) {
            this.name = name;
            this.age = age;
        }

        // Write a proxy instead of the object itself
        private Object writeReplace() {
            return new SerializationProxy(this);
        }

        private static class SerializationProxy implements Serializable {
            private static final long serialVersionUID = 1L;
            private final String name;
            private final int age;

            SerializationProxy(Person person) {
                this.name = person.name;
                this.age = person.age;
            }

            private Object readResolve() {
                return new Person(name, age);  // reconstruct the real object
            }
        }
    }

    // Line 4: Utility methods
    static byte[] serialize(Object obj) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        ObjectOutputStream oos = new ObjectOutputStream(bos);
        oos.writeObject(obj);
        return bos.toByteArray();
    }

    static <T> T deserialize(byte[] bytes, Class<T> type) throws IOException, ClassNotFoundException {
        ByteArrayInputStream bis = new ByteArrayInputStream(bytes);
        ObjectInputStream ois = new ObjectInputStream(bis);
        return type.cast(ois.readObject());
    }

    public static void main(String[] args) throws Exception {
        // Line 5: Basic serialization
        User user = new User("Alice", 30, "secret123");
        System.out.println("Before: " + user);

        byte[] bytes = serialize(user);
        System.out.println("Serialized: " + bytes.length + " bytes");

        User restored = deserialize(bytes, User.class);
        System.out.println("After: " + restored);
        // Note: password is null (transient)

        // Line 6: Collection serialization
        List<User> users = List.of(
            new User("Bob", 25, "pass1"),
            new User("Carol", 35, "pass2")
        );
        byte[] userBytes = serialize(users);
        List<?> restoredUsers = deserialize(userBytes, List.class);
        System.out.println("Restored " + restoredUsers.size() + " users");

        // Line 7: Serialization proxy
        Person person = new Person("Dave", 40);
        byte[] personBytes = serialize(person);
        Person restoredPerson = deserialize(personBytes, Person.class);
        System.out.println("Person: " + restoredPerson.name + " " + restoredPerson.age);
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Session serialization in web apps

```java
// HttpSession serializes attributes — make them Serializable
public class UserSession implements Serializable {
    private static final long serialVersionUID = 1L;
    private final String userId;
    private final Instant loginTime;
    private final Set<String> permissions;

    // All fields must be Serializable or transient
}
```

### Scenario 2: Caching with Redis

```java
// Redis stores serialized objects — ensure Serializable
@Serializable
@RedisHash("users")
public class User implements Serializable {
    @Id
    private String id;
    private String name;
    // ...
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `serialVersionUID` | Version mismatch on deserialization | Always declare it explicitly |
| Not making fields `transient` | Sensitive data leaked | Mark passwords, tokens as transient |
| Serializing non-serializable fields | NotSerializableException | Make all fields Serializable or transient |
| Using Java serialization for APIs | Security vulnerabilities | Use JSON/Protobuf instead |
| Circular references | StackOverflow during serialization | Break cycles with transient |
