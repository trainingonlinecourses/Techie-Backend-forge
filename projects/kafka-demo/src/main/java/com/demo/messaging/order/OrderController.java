package com.demo.messaging.order;

import com.demo.messaging.outbox.OutboxEntry;
import com.demo.messaging.outbox.OutboxRepository;
import com.demo.messaging.outbox.OutboxRelay;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class OrderController {

    private final OrderService orders;
    private final OutboxRepository outbox;
    private final OutboxRelay relay;

    public OrderController(OrderService orders, OutboxRepository outbox, OutboxRelay relay) {
        this.orders = orders;
        this.outbox = outbox;
        this.relay = relay;
    }

    /** Creates an order AND an outbox row in one transaction; the relay publishes it. */
    @PostMapping("/orders")
    public Order createOrder(@Valid @RequestBody CreateOrderRequest req) {
        return orders.createOrder(req.customerId(), req.amount());
    }

    /** Outbox rows still waiting to be published (0 in steady state). */
    @GetMapping("/outbox")
    public List<OutboxEntry> pendingOutbox() {
        return outbox.findAll();
    }

    @GetMapping("/outbox/pending-count")
    public long pendingOutboxCount() {
        return relay.pendingCount();
    }
}
