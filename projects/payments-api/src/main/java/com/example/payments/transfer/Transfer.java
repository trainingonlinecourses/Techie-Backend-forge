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
    private String idempotencyKey;

    protected Transfer() {}

    public Transfer(String fromIban, String toIban, long amountCents, String currency, String idempotencyKey) {
        this.fromIban = fromIban;
        this.toIban = toIban;
        this.amountCents = amountCents;
        this.currency = currency;
        this.idempotencyKey = idempotencyKey;
    }

    public Long id() { return id; }
    public String getFromIban() { return fromIban; }
    public String getToIban() { return toIban; }
    public long getAmountCents() { return amountCents; }
    public String getCurrency() { return currency; }
    public Instant getCreatedAt() { return createdAt; }
    public String getIdempotencyKey() { return idempotencyKey; }
}
