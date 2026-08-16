package com.demo.messaging.order;

import com.demo.messaging.events.OrderEvents.OrderCreated;
import com.demo.messaging.outbox.OutboxEntry;
import com.demo.messaging.outbox.OutboxRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;

/**
 * The heart of the outbox pattern: business state + outbox row commit together.
 * No Kafka call in the business path — the DB transaction is the guarantee.
 */
@Service
public class OrderService {

    private final OrderRepository orders;
    private final OutboxRepository outbox;
    private final ObjectMapper mapper;

    public OrderService(OrderRepository orders, OutboxRepository outbox, ObjectMapper mapper) {
        this.orders = orders;
        this.outbox = outbox;
        this.mapper = mapper;
    }

    @Transactional
    public Order createOrder(String customerId, BigDecimal amount) {
        Order order = orders.save(new Order(customerId, amount));

        OrderCreated event = new OrderCreated(
                "order-" + order.getId(),   // stable id — consumer idempotency
                String.valueOf(order.getId()),
                order.getCustomerId(),
                order.getAmount());
        outbox.save(new OutboxEntry(
                event.eventId(),
                "orders",
                OrderCreated.class.getName(),
                toJson(event)));
        return order;
    }

    private String toJson(Object o) {
        try {
            return mapper.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize outbox payload", e);
        }
    }
}
