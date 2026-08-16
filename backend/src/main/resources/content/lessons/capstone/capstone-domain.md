---
title: Capstone — Domain Model & Business Logic
summary: The Money value object, Account and Transfer entities, and transfer business rules with invariants.
order: 2
minutes: 18
topics: [capstone, domain, money, entities, invariants]
capstone: true
docs:
  - https://docs.spring.io/spring-data/jpa/reference/
---

# Capstone — Domain Model & Business Logic

Open `projects/payments-api/src/main/java/com/example/payments/` and follow along.

## Money: never double, always BigDecimal

```java
package com.example.payments.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;

/** Immutable money value object — the only way money moves in this app. */
public final class Money {

    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        this.amount = amount.setScale(2, RoundingMode.HALF_UP);   // 2 decimal places, always
        this.currency = currency;
    }

    public static Money of(String amount, String currency) {
        return new Money(new BigDecimal(amount), Currency.getInstance(currency));
    }

    public Money add(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money subtract(Money other) {
        requireSameCurrency(other);
        return new Money(amount.subtract(other.amount), currency);
    }

    public boolean isNegative() { return amount.signum() < 0; }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency))
            throw new IllegalArgumentException("currency mismatch: " + currency + " vs " + other.currency);
    }

    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currency.getCurrencyCode(); }
}
```

**The invariant lives here**: money is always 2-dp, currencies never mix, and every math operation goes through one class. No `double` anywhere in the codebase.

## Account: entity with a guarded balance

```java
package com.example.payments.account;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Currency;

@Entity
@Table(name = "accounts")
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 34)
    private String iban;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "balance_cents", nullable = false)
    private long balanceCents;                       // store cents as long — no float drift

    @Column(nullable = false)
    private String owner;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Account() {}                           // JPA requires a no-arg constructor

    public Account(String iban, String currency, String owner) {
        this.iban = iban;
        this.currency = currency;
        this.owner = owner;
        this.balanceCents = 0;
    }

    public long getBalanceCents() { return balanceCents; }

    void credit(long cents) { balanceCents += cents; }
    void debit(long cents) {
        if (balanceCents < cents)
            throw new com.example.payments.transfer.InsufficientFundsException(iban);
        balanceCents -= cents;
    }
}
```

Note: `credit`/`debit` are the *only* mutators and they're not part of the public API — money moves exclusively through `TransferService` (a JPA entity is shared state, so all mutation goes through services). The entity guards its own invariant: no negative balances.

## Transfer: the atomic unit of work

```java
package com.example.payments.transfer;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "transfers")
public class Transfer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 34)
    private String fromIban;

    @Column(nullable = false, length = 34)
    private String toIban;

    @Column(nullable = false)
    private long amountCents;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    @Column(nullable = false, unique = true, length = 64)
    private String idempotencyKey;                 // retries don't double-execute

    protected Transfer() {}

    public Transfer(String fromIban, String toIban, long amountCents, String currency, String idempotencyKey) {
        this.fromIban = fromIban;
        this.toIban = toIban;
        this.amountCents = amountCents;
        this.currency = currency;
        this.idempotencyKey = idempotencyKey;
    }
    // getters...
}
```

## The business rule, in one transaction

```java
package com.example.payments.transfer;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.example.payments.account.Account;
import com.example.payments.account.AccountRepository;

@Service
public class TransferService {

    private final AccountRepository accounts;
    private final TransferRepository transfers;

    @Transactional                                  // atomic: both sides move or neither does
    public TransferId execute(String fromIban, String toIban, long cents, String idempotencyKey) {

        // Idempotency: a retried key returns the SAME transfer (no double execution)
        if (transfers.existsByIdempotencyKey(idempotencyKey)) {
            throw new DuplicateTransferException(idempotencyKey);
        }

        if (fromIban.equals(toIban)) throw new SelfTransferException();

        Account from = accounts.findByIban(fromIban).orElseThrow(() -> new AccountNotFound(fromIban));
        Account to   = accounts.findByIban(toIban).orElseThrow(() -> new AccountNotFound(toIban));

        from.debit(cents);      // throws InsufficientFundsException → rollback
        to.credit(cents);
        accounts.save(from);
        accounts.save(to);

        return transfers.save(new Transfer(fromIban, toIban, cents, "EUR", idempotencyKey)).id();
    }
}
```

This is the money-movement pattern: **one transaction, row-level mutations, idempotency key, domain exceptions rolling back everything.**

> **Why it matters (organizational view)** — Domain code is where money bugs live, so it gets the strictest review. The standards on display: `BigDecimal`/cents math, invariants inside entities, package-private mutators, idempotency for retries, and one `@Transactional` boundary per business operation.

## Key takeaways

- Money math isolated in a value object; never `double` for money.
- Entities guard their invariants; mutation only through controlled methods.
- Idempotency keys make retries safe.
- One `@Transactional` per business operation; exceptions roll back everything.

**Official docs:** [Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/)
