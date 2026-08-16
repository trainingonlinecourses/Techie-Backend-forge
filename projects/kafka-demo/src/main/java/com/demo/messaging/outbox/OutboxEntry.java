package com.demo.messaging.outbox;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * One row per event to publish. Written in the SAME database transaction as the
 * business state, so "order created" and "OrderCreated will be published" are atomic.
 */
@Entity
@Table(name = "outbox")
public class OutboxEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Stable event id — lets the relay tolerate duplicate scans and consumers dedupe. */
    @Column(unique = true, nullable = false)
    private String eventId;

    @Column(nullable = false)
    private String topic;

    /** Fully qualified event class name, so the relay can deserialize to the right type. */
    @Column(nullable = false)
    private String eventType;

    /** JSON serialization of the event. */
    @Column(nullable = false, length = 4000)
    private String payload;

    private boolean published = false;

    private Instant createdAt = Instant.now();

    public OutboxEntry() {}

    public OutboxEntry(String eventId, String topic, String eventType, String payload) {
        this.eventId = eventId;
        this.topic = topic;
        this.eventType = eventType;
        this.payload = payload;
    }

    public Long getId() { return id; }
    public String getEventId() { return eventId; }
    public String getTopic() { return topic; }
    public String getEventType() { return eventType; }
    public String getPayload() { return payload; }
    public boolean isPublished() { return published; }
    public Instant getCreatedAt() { return createdAt; }

    public void setPublished(boolean published) { this.published = published; }
}
