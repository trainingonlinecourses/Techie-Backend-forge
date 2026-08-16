package com.demo.messaging.consumer;

import com.demo.messaging.events.OrderEvents.OrderCreated;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * Consumer in the {@code order-processors} group. At-least-once delivery means the
 * same event can arrive twice — the processed-events table makes it a no-op.
 */
@Component
public class OrderEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(OrderEventConsumer.class);

    private final ProcessedEventRepository processed;

    public OrderEventConsumer(ProcessedEventRepository processed) {
        this.processed = processed;
    }

    @KafkaListener(topics = "orders", groupId = "order-processors")
    public void onOrderCreated(OrderCreated event) {
        if (processed.existsById(event.eventId())) {
            log.info("Duplicate event {} — already processed, skipping", event.eventId());
            return;
        }
        // Business processing for this demo = recording the idempotency row.
        processed.save(new ProcessedEvent(event.eventId()));
        log.info("Processed OrderCreated {} (customer {}, amount {})",
                event.orderId(), event.customerId(), event.amount());
    }
}
