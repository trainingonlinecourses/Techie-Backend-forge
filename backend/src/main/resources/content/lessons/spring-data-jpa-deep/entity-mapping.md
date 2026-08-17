---
title: Entity Mapping in Depth
module: spring-data-jpa-deep
order: 1
minutes: 28
topics: ["@Entity", "identifiers", "associations", "cascade", "orphan removal", "naming strategies", "embedding"]
docs:
  - title: "JPA reference"
    url: "https://docs.jboss.org/hibernate/orm/current/userguide/html_single/Hibernate_User_Guide.html"
---

# Entity Mapping in Depth

JPA mapping is where the object model meets the relational model — and where subtle mistakes (lazy loading, cascade surprises, identity problems) become production bugs. This lesson covers the mapping decisions that actually matter: identifiers, associations, cascade/ownership, and embedding.

## Identifiers

```java
@Entity
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)   // DB sequence/identity
    private Long id;
}
```

| Strategy | Mechanism | Use |
|----------|-----------|-----|
| `IDENTITY` | DB auto-increment | Simple, but INSERT happens immediately |
| `SEQUENCE` | DB sequence, batched | **Default choice** — supports batch inserts |
| `TABLE` | Emulated sequence | Legacy only |
| `UUID` | App-generated | Distributed systems, offline entities |

```java
@Entity
public class Course {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "course_seq")
    @SequenceGenerator(name = "course_seq", sequenceName = "course_seq", allocationSize = 50)
    private Long id;
}
```

**The batch-insert trap**: with `IDENTITY`, Hibernate can't batch inserts (it must execute to get the id). `SEQUENCE` with a healthy `allocationSize` enables batch inserts — a 10× write-speedup for imports.

## Associations: The Four Types

```java
@Entity
public class Course {

    @OneToMany(mappedBy = "course")              // one course → many lessons
    private List<Lesson> lessons = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)           // many lessons → one course (default LAZY)
    private Course course;

    @OneToOne                                    // one-to-one
    private CoverImage cover;

    @ManyToMany                                  // many-to-many
    @JoinTable(name = "course_tags",
        joinColumns = @JoinColumn(name = "course_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags = new HashSet<>();
}
```

**Fetch defaults**:

| Association | Default fetch |
|-------------|---------------|
| `@ManyToOne` | EAGER ❌ (should be LAZY) |
| `@OneToOne` | EAGER ❌ |
| `@OneToMany` | LAZY ✅ |
| `@ManyToMany` | LAZY ✅ |

**The rule**: mark `@ManyToOne` and `@OneToOne` as `LAZY` explicitly — eager fetches cause N+1 and load graphs you don't need.

## Owning Side and Cascade

```java
@Entity
public class Course {

    // The OWNING side owns the foreign key
    @OneToMany(mappedBy = "course",
               cascade = CascadeType.ALL,
               orphanRemoval = true)
    private List<Lesson> lessons = new ArrayList<>();

    public void addLesson(Lesson lesson) {
        lessons.add(lesson);
        lesson.setCourse(this);          // keep BOTH sides in sync — the #1 JPA bug
    }
}
```

| Cascade type | Effect |
|--------------|--------|
| `ALL` | Persist, merge, remove, refresh propagate |
| `PERSIST` | Save children with the parent |
| `MERGE` | Update children with the parent |
| `REMOVE` | Delete children with the parent |
| `DETACH`, `REFRESH` | Rarely used |

**`orphanRemoval = true`** — removing a child from the parent's collection deletes it from the DB. Without it, the child becomes an orphan row.

**The #1 JPA bug — one-sided sync**:

```java
// ❌ ONLY the parent side set
course.addLesson(new Lesson("AOP"));   // if addLesson doesn't set the back-reference...

// ✅ Both sides (via the helper method above)
public void addLesson(Lesson lesson) {
    lessons.add(lesson);
    lesson.setCourse(this);
}
```

Without the back-reference, the FK column stays null — the "lesson has no course" mystery.

## Embedding Value Objects

```java
@Embeddable
public class Address {
    private String street;
    private String city;
    private String zip;
    // getters/setters
}

@Entity
public class Customer {

    @Embedded
    private Address address;      // columns: street, city, zip on the customer table

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street", column = @Column(name = "shipping_street")),
        @AttributeOverride(name = "city",   column = @Column(name = "shipping_city"))
    })
    private Address shippingAddress;   // two addresses, distinct columns
}
```

Embedding maps value objects (the DDD kind) to columns — no separate table, no join.

## Naming Strategies

```yaml
spring:
  jpa:
    hibernate:
      naming:
        physical-strategy: org.hibernate.boot.model.naming.CamelCaseToUnderscoresNamingStrategy
```

`camelCase` → `snake_case` is the default in Boot — `courseTitle` → `course_title`. Consistent naming avoids the "why is my column named this?" puzzle.

## The equals/hashCode Question

For entities in `Set`s and detached comparisons:

```java
@Entity
public class Course {

    @Id private Long id;

    // Business-key equality — NOT id-based (id is null before persist)
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Course c)) return false;
        return code != null && code.equals(c.code);   // business key
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(code);   // stable before and after persist
    }
}
```

**Rule**: base `equals`/`hashCode` on a stable business key, never on the generated id — a transient entity's id is null, breaking `Set` semantics.

## Mapping Checklist

- ✅ `SEQUENCE` strategy with `allocationSize` (batch inserts)
- ✅ LAZY on `@ManyToOne`/`@OneToOne`
- ✅ `mappedBy` on the inverse side
- ✅ Cascade + `orphanRemoval` deliberate
- ✅ Both-side sync in helper methods
- ✅ `@Embedded` for value objects
- ✅ Business-key `equals`/`hashCode`
- ✅ Indexes on the columns you query

## Summary

| Decision | Recommendation |
|----------|----------------|
| Id strategy | SEQUENCE + allocationSize |
| ManyToOne/OneToOne | LAZY explicitly |
| OneToMany | `mappedBy` + cascade ALL + orphanRemoval |
| Sync | Helper methods set both sides |
| VOs | @Embedded / @Embeddable |
| Naming | snake_case default |
| equals/hashCode | Business key |

Mapping is where JPA's magic becomes predictable: choose sequences for batchability, keep associations lazy, own the cascade semantics, and sync both sides. Get these right and the object-relational bridge stops leaking; get them wrong and every query becomes a debugging session.
