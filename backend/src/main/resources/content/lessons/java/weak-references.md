---
title: Weak, Soft & Phantom References — Memory-Sensitive Caching and Cleanup
summary: Reference types beyond strong — WeakReference for caches, SoftReference for memory-sensitive storage, PhantomReference for cleanup, and ReferenceQueue for post-GC notification.
order: 86
minutes: 18
topics: [weak-reference, soft-reference, phantom-reference, reference-queue, memory-cache, gc-integration, weakhashmap]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/WeakReference.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/SoftReference.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/PhantomReference.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/ReferenceQueue.html
---

# Weak, Soft & Phantom References — Memory-Sensitive Caching and Cleanup

## The concept: references the GC can ignore

A **strong reference** (`User u = new User()`) keeps the object alive — the GC will never collect it as long as the reference exists. The other reference types give the GC a hint: "I'd like this object, but I don't *need* it — collect it if you need the memory." This is the foundation of memory-sensitive caches and automatic resource cleanup.

**The mental model:** think of strong references as "this is mine, don't touch it"; soft references as "I'd like to keep this, but you can take it if you're running low"; weak references as "I'm using this, but don't keep it alive on my account"; phantom references as "tell me when it's gone."

## The four reference types

| Type | GC behavior | Typical use |
|---|---|---|
| **Strong** (default) | Never collected while reachable | Normal variables |
| **Soft** | Collected only when memory is low | Memory-sensitive cache |
| **Weak** | Collected at the next GC cycle (regardless of memory) | Cache keys, prevent memory leaks |
| **Phantom** | Collected; enqueued for final cleanup | Resource cleanup, native memory release |

## WeakReference — the cache that won't cause memory leaks

```java
import java.lang.ref.WeakReference;

// Create a weak reference
User alice = new User("alice");
WeakReference<User> weakAlice = new WeakReference<>(alice);

// Access the referent
User cached = weakAlice.get();        // returns "alice" if not yet collected
if (cached == null) {
    // The GC collected the User — cache miss
    cached = loadFromDB("alice");
    weakAlice = new WeakReference<>(cached);
}

// Once no strong references exist, the GC will collect the User
alice = null;                           // only the WeakReference holds it
System.gc();                            // hint to GC (not guaranteed)
// Next GC: weakAlice.get() returns null
```

**Line-by-line breakdown:**
- `new WeakReference<>(alice)` — wraps `alice` in a weak reference; the object is reachable through the weak reference but the GC considers it "weakly reachable"
- `weakAlice.get()` — returns the referent if still alive, `null` if collected; the GC can collect it at any time
- `alice = null` — removes the strong reference; now the object is only weakly reachable → eligible for GC
- `System.gc()` — a hint (not a command); the JVM may or may not run GC in response

**Real-world scenario — WeakHashMap as a cache:**
```java
import java.util.WeakHashMap;

// Keys are weakly referenced — when the key is GC'd, the entry is removed
Map<UserSession, String> sessionTokens = new WeakHashMap<>();

UserSession session = new UserSession("token-123");
sessionTokens.put(session, "bearer-token-456");

// When session is GC'd, the entry disappears automatically — no memory leak
session = null;
// Next GC: the entry is removed
```

**Why WeakHashMap for caches:** you don't need to manually evict entries — the GC does it for you. The trade-off: entries can disappear at any time (even immediately), so you need a fallback (database, default value).

## SoftReference — memory-sensitive cache

```java
import java.lang.ref.SoftReference;
import java.util.HashMap;
import java.util.Map;

// A memory-sensitive image cache
Map<String, SoftReference<Image>> imageCache = new HashMap<>();

public Image getImage(String url) {
    SoftReference<Image> ref = imageCache.get(url);
    Image img = (ref != null) ? ref.get() : null;

    if (img == null) {
        img = downloadImage(url);            // expensive network call
        imageCache.put(url, new SoftReference<>(img));
    }
    return img;
}
```

**How SoftReference differs from WeakReference:**
- `WeakReference` — collected at the **next GC** regardless of available memory
- `SoftReference` — collected **only when memory is low**; the JVM keeps soft references alive as long as possible

**The JVM's soft-reference policy:** the default is to collect soft references after about 1 second of free memory (in milliseconds, `SoftReference.get()` returns non-null for at least ` currentTimeMillis - clock + softReferenceTimeout`). You can tune this with `-XX:SoftRefLRUPolicyMSPerMB`.

## PhantomReference — cleanup after collection

```java
import java.lang.ref.PhantomReference;
import java.lang.ref.ReferenceQueue;

// Track when objects are collected for cleanup
ReferenceQueue<Cleanable> queue = new ReferenceQueue<>();
Map<PhantomReference<Cleanable>, CleanupTask> pending = new ConcurrentHashMap<>();

Cleanable resource = new Cleanable();
CleanupTask task = new CleanupTask(resource);
PhantomReference<Cleanable> phantom = new PhantomReference<>(resource, queue);
pending.put(phantom, task);

// In a background thread, poll the queue
Thread cleanupThread = Thread.ofVirtual().start(() -> {
    while (true) {
        PhantomReference<?> ref = queue.remove();   // blocks until an entry is enqueued
        CleanupTask t = pending.remove(ref);
        if (t != null) t.cleanup();                 // release native resources
    }
});
```

**Line-by-line breakdown:**
- `new PhantomReference<>(resource, queue)` — wraps `resource` with a phantom reference; when `resource` is GC'd, the phantom reference is enqueued in `queue`
- `queue.remove()` — blocks the cleanup thread until a phantom reference is enqueued (object was collected)
- `pending.remove(ref)` — retrieves the cleanup task associated with the collected object
- `t.cleanup()` — perform cleanup (close file handles, release native memory, etc.)

**PhantomReference vs finalize():** `finalize()` is deprecated (unreliable ordering, resurrection risk, GC pressure). PhantomReference + ReferenceQueue is the modern replacement: deterministic, predictable, and thread-safe.

## ReferenceQueue — the notification system

```java
import java.lang.ref.Reference;
import java.lang.ref.ReferenceQueue;
import java.lang.ref.WeakReference;

ReferenceQueue<Object> queue = new ReferenceQueue<>();
WeakReference<Object> ref = new WeakReference<>(new Object(), queue);

// In a background loop:
Reference<?> collected;
while ((collected = queue.poll()) != null) {
    System.out.println("Object was collected: " + collected);
    // Perform cleanup, remove from maps, etc.
}
```

**How it works:**
1. Create a `ReferenceQueue` and pass it to the reference constructor
2. When the referent is GC'd, the JVM enqueues the reference in the queue
3. Poll or remove from the queue to get notified
4. The enqueued reference's `get()` returns `null` (the object is already collected)

## Common patterns

**Pattern 1 — Cache with eviction listener:**
```java
public class EvictingCache<K, V> {
    private final Map<K, WeakReference<V>> cache = new WeakHashMap<>();
    private final ReferenceQueue<V> queue = new ReferenceQueue<>();

    public void put(K key, V value) {
        cache.put(key, new WeakReference<>(value, queue));
    }

    // Call periodically to clean up entries whose referents were collected
    public void cleanup() {
        Reference<? extends V> ref;
        while ((ref = queue.poll()) != null) {
            cache.values().remove(ref);  // remove the stale entry
        }
    }
}
```

**Pattern 2 — ThreadLocal leak prevention:**
```java
// Bad: ThreadLocal holding a large object — leaks in thread pools
private static final ThreadLocal<LargeObject> tl = ThreadLocal.withInitial(LargeObject::new);

// Better: WeakReferenceThreadLocal (Java 21+)
private static final WeakReferenceThreadLocal<LargeObject> tl = new WeakReferenceThreadLocal<>();

// The WeakReferenceThreadLocal uses weak references internally,
// so the LargeObject can be GC'd when no strong references exist
```

## Common mistakes

| Mistake | Why it's wrong | Fix |
|---|---|---|
| Using WeakReference for critical data | GC can collect at any time — data loss | Use strong references for critical data; WeakReference for optional cache |
| Assuming SoftReference keeps data forever | Collected under memory pressure — data loss | Treat as a cache; have a reload strategy |
| Forgetting to poll the ReferenceQueue | Stale references pile up; cleanup never runs | Run a background cleanup thread |
| Using `finalize()` for cleanup | Deprecated, unpredictable timing, can resurrect objects | Use `PhantomReference` + `ReferenceQueue` |
| `WeakHashMap` with interned/constant keys | If keys are never GC'd (static fields), entries never expire | Only use with ephemeral keys |

## Key takeaways

- **Strong** = keep alive; **Soft** = keep if memory available; **Weak** = collect at next GC; **Phantom** = collect + notify via queue.
- `WeakReference` for caches (WeakHashMap) — entries auto-evict when keys are GC'd.
- `SoftReference` for memory-sensitive caches — survives until memory is low.
- `PhantomReference` + `ReferenceQueue` replaces `finalize()` for deterministic cleanup.
- `get()` returns `null` after the referent is collected — always null-check.

**Official docs:** [WeakReference API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/WeakReference.html) · [SoftReference API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/SoftReference.html) · [PhantomReference API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/PhantomReference.html) · [ReferenceQueue API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/ref/ReferenceQueue.html)
