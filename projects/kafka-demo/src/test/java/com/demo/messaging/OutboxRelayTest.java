package com.demo.messaging;

import com.demo.messaging.consumer.ProcessedEventRepository;
import com.demo.messaging.order.CreateOrderRequest;
import com.demo.messaging.order.Order;
import com.demo.messaging.order.OrderService;
import com.demo.messaging.outbox.OutboxEntry;
import com.demo.messaging.outbox.OutboxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.test.context.EmbeddedKafka;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.util.concurrent.TimeUnit;

/**
 * The most valuable test in the module: business transaction → outbox row → relay →
 * Kafka topic → consumer → processed-event row, all in one flow.
 */
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "orders")
class OutboxRelayTest {

    @Autowired OrderService orders;
    @Autowired OutboxRepository outbox;
    @Autowired ProcessedEventRepository processed;

    @Test
    void create_order_publishes_event_and_consumer_processes_it() {
        Order order = orders.createOrder("customer-1", new BigDecimal("19.99"));

        // The consumer in the "order-processors" group must eventually record the event.
        await().atMost(20, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(processed.existsById("order-" + order.getId()))
                        .as("consumer processed the OrderCreated event")
                        .isTrue());

        // The relay must mark the outbox row published after a successful send.
        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(outbox.findAll())
                        .as("all outbox rows eventually published")
                        .allMatch(OutboxEntry::isPublished));
    }
}
