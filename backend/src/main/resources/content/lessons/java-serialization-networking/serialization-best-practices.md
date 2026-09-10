---
title: Java Serialization Best Practices — When and How to Serialize Safely
summary: The serialization contract, serialVersionUID, Externalizable for performance, serialization proxies for safety, and when to avoid Java serialization entirely.
order: 2
minutes: 22
topics: [serializable, externalizable, serialversionuid, proxy-pattern, security, best-practices]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/io/serializing.html
---

## The Concept, From Zero

**Serialization** is converting an object to a byte stream so it can be saved to a file, sent over a network, or stored in a database. **Deserialization** is converting it back.

// Serializable — marker interface (no methods to implement)
public class User implements Serializable {
    private String name;
    private String email;
}

// Serialize
ObjectOutputStream out = new ObjectOutputStream(new FileOutputStream("user.dat"));
out.writeObject(user);
out.close();

// Deserialize
ObjectInputStream in = new ObjectInputStream(new FileInputStream("user.dat"));
User restored = (User) in.readObject();
in.close();

---

## The Serialization Contract


**What this code does — step by step:**

1. Line 1: Basic serializable class
2. Line 2: Version ID — MUST declare for stable serialization
3. `private transient String password;` — Line 3: transient = not serialized
4. Line 4: Custom serialization logic
5. `out.defaultWriteObject();` — Serialize non-transient fields. Encrypt password before serializing
6. Line 5: Custom deserialization logic
7. `in.defaultReadObject();` — Deserialize non-transient fields. Decrypt password after deserializing

The same code, clean:

```java
import java.io.Serializable;

public class Employee implements Serializable {

    private static final long serialVersionUID = 1L;

    private String name;
    private String email;
    private double salary;
    private transient String password;

    public Employee(String name, String email, double salary, String password) {
        this.name = name;
        this.email = email;
        this.salary = salary;
        this.password = password;
    }

    private void writeObject(java.io.ObjectOutputStream out) throws java.io.IOException {
        out.defaultWriteObject();
        out.writeObject(encrypt(password));
    }

    private void readObject(java.io.ObjectInputStream in) throws java.io.IOException, ClassNotFoundException {
        in.defaultReadObject();
        this.password = decrypt((String) in.readObject());
    }

    private String encrypt(String data) {
        return Base64.getEncoder().encodeToString(data.getBytes());
    }

    private String decrypt(String data) {
        return new String(Base64.getDecoder().decode(data));
    }
}
```

---

## Externalizable — Better Performance


**What this code does — step by step:**

1. Line 1: Externalizable gives you full control
2. Line 2: Must have no-arg constructor
3. Line 3: Write only what you need
4. Line 4: Read in same order
5. Line 5: Performance comparison. Serializable: 1000 objects ≈ 45ms. Externalizable: 1000 objects ≈ 12ms. Externalizable is 3-4x faster!

The same code, clean:

```java
import java.io.*;

public class Product implements Externalizable {
    private long id;
    private String name;
    private double price;
    private int stock;

    public Product() {}

    public Product(long id, String name, double price, int stock) {
        this.id = id;
        this.name = name;
        this.price = price;
        this.stock = stock;
    }

    @Override
    public void writeExternal(ObjectOutput out) throws IOException {
        out.writeLong(id);
        out.writeUTF(name);
        out.writeDouble(price);
        out.writeInt(stock);
    }

    @Override
    public void readExternal(ObjectInput in) throws IOException {
        id = in.readLong();
        name = in.readUTF();
        price = in.readDouble();
        stock = in.readInt();
    }

}
```

---

## Serialization Proxy Pattern — The Safe Way


**What this code does — step by step:**

1. Line 1: Proxy class
2. Line 2: readResolve returns the real object
3. `return new Money(amount, currency);` — Always safe!
4. Line 3: writeReplace returns the proxy
5. Line 4: Prevent direct deserialization

The same code, clean:

```java
import java.io.Serializable;

public final class Money implements Serializable {
    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        this.amount = amount;
        this.currency = currency;
    }

    private static class SerializationProxy implements Serializable {
        private final BigDecimal amount;
        private final Currency currency;

        SerializationProxy(Money money) {
            this.amount = money.amount;
            this.currency = money.currency;
        }

        private Object readResolve() {
            return new Money(amount, currency);
        }
    }

    private Object writeReplace() {
        return new SerializationProxy(this);
    }

    private void readObject(ObjectInputStream stream) throws InvalidObjectException {
        throw new InvalidObjectException("Proxy required");
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Caching with serialization

import java.io.*;

public class CacheEntry<T> implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private final T value;
    private final long createdAt;
    private final long ttlMillis;
    
    public CacheEntry(T value, long ttlMillis) {
        this.value = value;
        this.createdAt = System.currentTimeMillis();
        this.ttlMillis = ttlMillis;
    }
    
    public boolean isExpired() {
        return System.currentTimeMillis() - createdAt > ttlMillis;
    }
    
    public T getValue() {
        if (isExpired()) return null;
        return value;
    }
}

// Usage
CacheEntry<User> cachedUser = new CacheEntry<>(user, 30 * 60 * 1000);  // 30 min TTL
ObjectOutputStream out = new ObjectOutputStream(new FileOutputStream("cache.dat"));
out.writeObject(cachedUser);

### Scenario 2: Session persistence

import java.io.*;

public class SessionManager {
    private static final String SESSION_FILE = "session.dat";
    
    public void saveSession(UserSession session) throws IOException {
        try (ObjectOutputStream out = new ObjectOutputStream(
                new FileOutputStream(SESSION_FILE))) {
            out.writeObject(session);
        }
    }
    
    public UserSession loadSession() throws IOException, ClassNotFoundException {
        File file = new File(SESSION_FILE);
        if (!file.exists()) return null;
        
        try (ObjectInputStream in = new ObjectInputStream(
                new FileInputStream(SESSION_FILE))) {
            return (UserSession) in.readObject();
        }
    }
}

public class UserSession implements Serializable {
    private static final long serialVersionUID = 1L;
    
    private String userId;
    private Map<String, Object> attributes;
    private long lastAccessed;
    
    // getters and setters
}

---

## When to Avoid Java Serialization

| Problem | Why | Alternative |
|---------|-----|-------------|
| Security vulnerabilities | Deserialization attacks | JSON/Protocol Buffers |
| Version compatibility | Breaking changes between versions | Schema-based formats |
| Performance | Slow and verbose | Protobuf, Avro |
| Cross-language | Java-only | JSON, gRPC |
| Debugging | Binary format | JSON (human-readable) |


**What this code does — step by step:**

1. Instead of Java serialization: ❌ ObjectOutputStream out = new ObjectOutputStream(...); ✅ ObjectMapper mapper = new ObjectMapper(); mapper.writeValue(new File("data.json"), object);
2. Or for binary: ✅ Protocol Buffers. ✅ Avro. ✅ MessagePack

The same code, clean:

```java
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not declaring `serialVersionUID` | Version incompatibility | Always declare explicitly |
| Serializing non-serializable fields | `NotSerializableException` | Mark as `transient` |
| Circular references | `StackOverflowError` | Use `transient` for back-references |
| Deserializing untrusted data | Security risk | Use `ObjectInputFilter` |
| Forgetting no-arg constructor | `Externalizable` fails | Always add no-arg constructor |
| Overriding `readObject` incorrectly | Data corruption | Call `defaultReadObject()` first |

