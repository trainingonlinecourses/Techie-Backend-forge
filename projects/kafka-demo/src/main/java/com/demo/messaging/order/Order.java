package com.demo.messaging.order;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String customerId;

    private BigDecimal amount;

    private Instant createdAt = Instant.now();

    public Order() {}

    public Order(String customerId, BigDecimal amount) {
        this.customerId = customerId;
        this.amount = amount;
    }

    public Long getId() { return id; }
    public String getCustomerId() { return customerId; }
    public BigDecimal getAmount() { return amount; }
    public Instant getCreatedAt() { return createdAt; }
}
