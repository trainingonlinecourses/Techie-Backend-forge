package com.demo.messaging.events;

import java.math.BigDecimal;

/**
 * Events are past facts with a stable id — consumers use the id for idempotency.
 */
public final class OrderEvents {

    private OrderEvents() {}

    public record OrderCreated(String eventId, String orderId, String customerId, BigDecimal amount) {}
}
