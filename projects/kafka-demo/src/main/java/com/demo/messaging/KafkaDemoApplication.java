package com.demo.messaging;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Kafka demo — the transactional outbox pattern, consumer groups and retry/DLT.
 *
 * <p>Run: {@code docker compose up -d} (Kafka on :9092), then {@code mvn spring-boot:run}.
 * Try: {@code POST /api/orders {"customerId":"c1","amount":"19.99"}} → the order and an
 * outbox row are committed in one transaction, the relay publishes {@code OrderCreated}
 * to the {@code orders} topic, and the {@code order-processors} group consumes it.
 * {@code POST /api/notifications {"id":"n1","message":"boom fail"}} → the retryable
 * listener exhausts its retries and the event lands in the DLT.
 */
@SpringBootApplication
@EnableScheduling
public class KafkaDemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(KafkaDemoApplication.class, args);
    }
}
