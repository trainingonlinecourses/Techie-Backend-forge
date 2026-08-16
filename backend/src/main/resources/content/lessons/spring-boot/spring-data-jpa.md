---
title: Spring Data JPA — Entities, Repositories, Relationships
summary: Entities, derived queries, @Query, relationships, auditing, and the N+1 trap.
order: 5
minutes: 22
topics: [jpa, entities, repositories, derived-queries, n-plus-one, auditing]
docs:
  - https://docs.spring.io/spring-data/jpa/reference/
  - https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html
---

# Spring Data JPA — Entities, Repositories, Relationships

## The repository pattern, made trivial

Spring Data generates implementations from interface method names. Define the query *by naming*:

```java
public interface AccountRepository extends JpaRepository<Account, String> {

    Optional<Account> findByIban(String iban);

    List<Account> findByCustomerIdAndStatus(String customerId, AccountStatus status);

    long countByCurrency(String currency);

    Page<Account> findByStatus(AccountStatus status, Pageable pageable);

    boolean existsByIban(String iban);
}
```

`JpaRepository<T, ID>` gives you `save`, `findById`, `findAll`, `delete`, `count`, `existsById`, pagination, and transactions for free.

## Entities: the basics

```java
@Entity
@Table(name = "accounts")
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 34)
    private String iban;

    @Column(name = "balance_cents", nullable = false)
    private long balanceCents;

    @Version                                  // optimistic locking — prevents lost updates
    private long version;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;
}
```

Rules: entities have an identity (`@Id`), a no-arg constructor (JPA requirement), and accessors; **don't serialize entities directly to JSON** — map to DTOs/records at the boundary.

## Explicit queries with @Query

```java
public interface PaymentRepository extends JpaRepository<Payment, Long> {

    @Query("""
            SELECT p FROM Payment p
            WHERE p.account.iban = :iban AND p.createdAt >= :since
            ORDER BY p.createdAt DESC
            """)
    List<Payment> recentForAccount(@Param("iban") String iban,
                                   @Param("since") Instant since);

    @Query("UPDATE Payment p SET p.status = :status WHERE p.id = :id")
    @Modifying
    int updateStatus(@Param("id") Long id, @Param("status") PaymentStatus status);
}
```

## Relationships & the N+1 trap

```java
@OneToMany(mappedBy = "account", cascade = CascadeType.ALL, orphanRemoval = true)
private List<Payment> payments = new ArrayList<>();

@ManyToOne(fetch = FetchType.LAZY)
@JoinColumn(name = "customer_id")
private Customer customer;
```

**N+1 problem**: loading 100 accounts, then accessing `account.getCustomer()` for each → 1 query + 100 lazy loads. Fix with `join fetch` or `@EntityGraph`:

```java
@Query("SELECT DISTINCT a FROM Account a JOIN FETCH a.customer WHERE a.status = :status")
List<Account> findAllWithCustomer(@Param("status") AccountStatus status);

// or
@EntityGraph(attributePaths = "customer")
@Query("SELECT a FROM Account a WHERE a.status = :status")
List<Account> findAllWithCustomer(AccountStatus status);
```

## Auditing with JPA

```java
@Configuration
@EnableJpaAuditing
public class JpaConfig {}

@MappedSuperclass
public abstract class AuditedEntity {
    @CreatedDate private Instant createdAt;
    @LastModifiedDate private Instant updatedAt;
}
// entity extends AuditedEntity — timestamps maintained automatically
```

## Transactions with repositories

Each repository method runs in a transaction. For multi-step operations, annotate the **service** method `@Transactional` (see data-access lesson) so the whole flow commits or rolls back together.

> **Why it matters (organizational view)** — Spring Data removes most SQL boilerplate while keeping escape hatches (`@Query`). The org standards: derived queries for simple lookups, `@Query`/`@EntityGraph` for anything with relationships (watch N+1), lazy everywhere + explicit fetch, DTOs over entities on the wire, and optimistic locking (`@Version`) on mutable aggregates.

## Key takeaways

- Name-based derived queries; `@Query` for complex ones; `@Modifying` for writes.
- LAZY by default; `JOIN FETCH`/`@EntityGraph` to avoid N+1.
- `@Version` for optimistic locking; auditing via `@EnableJpaAuditing`.
- Map entities → DTOs at the boundary; never serialize lazy entities.

**Official docs:** [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/) · [Query methods](https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html)
