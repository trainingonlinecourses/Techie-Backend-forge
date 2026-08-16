package com.demo.messaging.outbox;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * The outbox relay: polls for unpublished rows, publishes each to Kafka, and marks
 * it published AFTER a successful send. A crash mid-loop simply re-sends next poll —
 * which is why consumers must be idempotent (at-least-once semantics).
 */
@Component
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);

    private final OutboxRepository outbox;
    private final KafkaTemplate<String, Object> kafka;
    private final ObjectMapper mapper;

    private final long pollMs;
    private final int batchSize;

    public OutboxRelay(OutboxRepository outbox, KafkaTemplate<String, Object> kafka,
                       ObjectMapper mapper,
                       @Value("${app.outbox.poll-ms:2000}") long pollMs,
                       @Value("${app.outbox.batch-size:50}") int batchSize) {
        this.outbox = outbox;
        this.kafka = kafka;
        this.mapper = mapper;
        this.pollMs = pollMs;
        this.batchSize = batchSize;
    }

    @Scheduled(fixedDelayString = "${app.outbox.poll-ms:2000}")
    public void publishPending() {
        List<OutboxEntry> pending = outbox.findTop50ByPublishedFalseOrderByIdAsc();
        for (OutboxEntry entry : pending) {
            try {
                Class<?> type = Class.forName(entry.getEventType());
                Object event = mapper.readValue(entry.getPayload(), type);
                kafka.send(entry.getTopic(), event).get(5, TimeUnit.SECONDS);
                entry.setPublished(true);
            } catch (Exception e) {
                log.warn("Outbox publish failed for event {} on topic {} — will retry next poll",
                        entry.getEventId(), entry.getTopic(), e);
            }
        }
        outbox.saveAll(pending);
    }

    public long getPollMs() { return pollMs; }
    public int getBatchSize() { return batchSize; }

    @Transactional(readOnly = true)
    public long pendingCount() {
        return outbox.findAll().stream().filter(e -> !e.isPublished()).count();
    }
}
