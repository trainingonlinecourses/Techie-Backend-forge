package com.demo.messaging.retry;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.DltHandler;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.annotation.RetryableTopic;
import org.springframework.kafka.retrytopic.DltStrategy;
import org.springframework.retry.annotation.Backoff;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Demonstrates retries and the dead letter queue.
 *
 * <p>Messages whose text contains "fail" throw on every attempt: {@code @RetryableTopic}
 * retries with increasing backoff (200ms → 300ms → 450ms), then the record lands on the
 * {@code notifications-dlt} topic and the {@code @DltHandler} records it. Healthy messages
 * are handled on the first attempt.
 */
@Component
public class NotificationListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationListener.class);

    private final List<Notification> handled = new CopyOnWriteArrayList<>();
    private final List<Notification> dead = new CopyOnWriteArrayList<>();

    @RetryableTopic(
            attempts = "4",                                    // 1 original + 3 retries
            backoff = @Backoff(delay = 200, multiplier = 1.5), // 200ms, 300ms, 450ms
            dltStrategy = DltStrategy.ALWAYS_RETRY_ON_ERROR)
    @KafkaListener(topics = "notifications", groupId = "notifier-workers")
    public void onNotification(Notification n) {
        if (n.message().contains("fail")) {
            throw new IllegalStateException("simulated permanent failure: " + n.message());
        }
        handled.add(n);
        log.info("Notification handled: {}", n);
    }

    /** Runs after retries are exhausted — this is the record of the permanent failure. */
    @DltHandler
    public void onDlt(Notification n) {
        dead.add(n);
        log.warn("Notification moved to DLT: {}", n);
    }

    public List<Notification> handled() { return handled; }
    public List<Notification> dead() { return dead; }
}
