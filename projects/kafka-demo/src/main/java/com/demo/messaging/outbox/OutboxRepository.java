package com.demo.messaging.outbox;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface OutboxRepository extends JpaRepository<OutboxEntry, Long> {

    /** Oldest unpublished rows first — keeps publication order close to insertion order. */
    List<OutboxEntry> findTop50ByPublishedFalseOrderByIdAsc();
}
