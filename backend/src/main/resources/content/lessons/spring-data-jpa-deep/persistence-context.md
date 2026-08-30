---
title: The Persistence Context and Dirty Checking
module: spring-data-jpa-deep
order: 5
minutes: 25
topics: ["persistence context", "entity lifecycle", "dirty checking", "flush", "detached entities", "first-level cache"]
summary: JPA's magic — "I changed the field and it saved itself" — is the persistence context at work: a firstlevel cache that tracks entities, detects chan...
docs:
  - title: "Hibernate persistence context"
    url: "https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html#pc"
---

# The Persistence Context and Dirty Checking

JPA's magic — "I changed the field and it saved itself" — is the **persistence context** at work: a first-level cache that tracks entities, detects changes, and flushes them. Understanding the lifecycle is what makes JPA predictable instead of spooky.

## The Entity Lifecycle

```
             persist()                 
  NEW ────────────────▶ MANAGED ────────▶ DETACHED
  (no id,             (tracked by the    (id set, no longer
   not in context)     context,          tracked — after tx
                       dirty-checked)     commit or detach())

                          │
                          ▼
                       REMOVED
                      (delete scheduled)
```

| State | In context? | Has id? | Changes tracked? |
|-------|:---:|:---:|:---:|
| NEW (transient) | ❌ | ❌ | ❌ |
| MANAGED | ✅ | ✅ | ✅ |
| DETACHED | ❌ | ✅ | ❌ |
| REMOVED | ✅ | ✅ | scheduled for delete |

## What "Managed" Means

```java
@Transactional
public void updateTitle(Long id, String title) {
    Course course = courseRepository.findById(id).orElseThrow();
    // course is MANAGED — loaded into the persistence context

    course.setTitle(title);
    // NO save() call needed!
    // At flush/commit, Hibernate dirty-checks and issues:
    //   UPDATE courses SET title = ? WHERE id = ?
}
```

**Dirty checking**: Hibernate snapshots the entity state at load; at flush it compares — changed fields generate UPDATEs. The `save()` call on a managed entity is a **no-op** (it just returns the same managed instance).

## The First-Level Cache

The persistence context is also a **cache**: the same entity loaded twice returns the same instance.

```java
@Transactional
public void demonstrateCache() {
    Course a = courseRepository.findById(1L).orElseThrow();
    Course b = courseRepository.findById(1L).orElseThrow();

    assertSame(a, b);          // SAME instance — only ONE query ran
    // SELECT ran once; the second find hit the context
}
```

This is why two loads of the same entity can't drift — they're the same object until flushed.

## When Does Flush Happen?

| Trigger | Detail |
|---------|--------|
| Transaction commit | The final flush |
| Query execution | Before a query that might see pending changes (auto-flush) |
| Explicit `flush()` | Your code forces it |
| `IDENTITY` insert | Immediately (must get the id) |

```java
@Transactional
public void flushExamples() {
    Course c = new Course("Spring");
    courseRepository.save(c);          // PERSIST — queued, not yet INSERTed
    Long id = c.getId();               // null with SEQUENCE until flush!

    entityManager.flush();             // force the INSERT now
    Long idAfter = c.getId();          // now populated
}
```

**The classic surprise**: with `SEQUENCE` ids, `save()` doesn't return an id until flush. With `IDENTITY`, the INSERT fires immediately (which kills batch inserts — see the mapping lesson).

## The Dirty-Checking Cost

Dirty checking happens for **every managed entity at flush**. With a huge first-level cache, that's a big comparison pass. Mitigations:

```java
// readOnly: no dirty checking for this operation
@Transactional(readOnly = true)
public List<Course> list() { ... }      // Hibernate skips dirty checks

// Or detach: stop tracking
entityManager.detach(course);
```

## Detached Entities: The Merge Pattern

```java
// A DTO arrives from the controller with an id:
public void update(CourseDto dto) {
    Course course = courseRepository.findById(dto.id()).orElseThrow();
    course.setTitle(dto.title());        // mutate the MANAGED entity — clean
    course.setMinutes(dto.minutes());
    // no save needed — dirty checking does it
}

// The merge anti-pattern:
public void update(CourseDto dto) {
    Course detached = new Course(dto.id(), dto.title(), ...);
    courseRepository.save(detached);     // save on a DETACHED entity = merge?
    // save() on a detached entity actually MERGES — copies state to a managed copy
    // and may do a SELECT + UPDATE — or worse, INSERT if the id is wrong
}
```

**The rule**: load the managed entity, mutate it, let dirty checking flush. `merge` (`save` on detached) does extra queries and can surprise — avoid unless the entity came from outside the transaction.

## Clearing the Context

```java
@Transactional
public void processAll() {
    for (Course c : courseRepository.findAll()) {
        process(c);
        entityManager.clear();     // ⚠️ evicts ALL managed entities
    }
    // without clearing, the context holds every processed course in memory
}
```

For long loops, `clear()` (or batch-size-flush patterns) prevents memory blowup — the persistence context would otherwise keep every entity alive until commit.

## The Lazy-Loading Window (again)

The persistence context defines the lazy-loading window:

```java
// ❌ Lazy access after the tx → LazyInitializationException
public CourseDto getCourse(Long id) {
    Course c = courseRepository.findById(id).orElseThrow();
    // tx ends here (no @Transactional)
    return new CourseDto(c, c.getLessons().size());   // 💥 no session
}
```

## Summary

| Concept | Key fact |
|---------|----------|
| Persistence context | First-level cache + change tracker, per transaction |
| Managed | Loaded via a repository/EM within a tx |
| Dirty checking | Flush compares snapshots → UPDATEs |
| save() on managed | No-op — dirty checking handles it |
| First-level cache | Same id → same instance, one query |
| Flush triggers | Commit, queries, explicit flush |
| readOnly | Skips dirty checking |
| Detached | Not tracked — load-and-mutate, don't merge blindly |
| clear() | Frees the context in long loops |

The persistence context is the engine under JPA's declarative surface: entities are tracked, changes detected, and flushes scheduled. Work *with* it — load, mutate, rely on dirty checking, keep lazy access inside the transaction — and JPA feels like magic in the good way.
