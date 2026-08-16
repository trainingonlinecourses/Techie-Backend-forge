package com.example.payments.account;

import com.example.payments.transfer.InsufficientFundsException;
import jakarta.persistence.*;

import java.time.Instant;

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
    private long balanceCents;

    @Column(nullable = false)
    private String owner;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected Account() {}

    public Account(String iban, String currency, String owner) {
        this.iban = iban;
        this.currency = currency;
        this.owner = owner;
        this.balanceCents = 0;
    }

    public Long getId() { return id; }
    public String getIban() { return iban; }
    public String getCurrency() { return currency; }
    public long getBalanceCents() { return balanceCents; }
    public String getOwner() { return owner; }
    public Instant getCreatedAt() { return createdAt; }

    /** Money may only move through TransferService — these are not part of the public API. */
    public void credit(long cents) { balanceCents += cents; }

    public void debit(long cents) {
        if (balanceCents < cents) throw new InsufficientFundsException(iban);
        balanceCents -= cents;
    }
}
