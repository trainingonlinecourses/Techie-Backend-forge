package com.demo.messaging.consumer;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;

/**
 * Idempotency record: one row per event id this consumer has already applied.
 * The natural key IS the event id, so "already handled" is a single lookup.
 */
@Entity
@Table(name = "processed_events")
public class ProcessedEvent {

    @Id
    private String eventId;

    private Instant processedAt = Instant.now();

    public ProcessedEvent() {}

    public ProcessedEvent(String eventId) {
        this.eventId = eventId;
    }

    public String getEventId() { return eventId; }
    public Instant getProcessedAt() { return processedAt; }
}
