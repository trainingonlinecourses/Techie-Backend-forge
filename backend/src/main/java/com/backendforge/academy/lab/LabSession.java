package com.backendforge.academy.lab;

import java.time.Instant;

/**
 * A single lab session. Lives for 30 minutes from creation, then is evicted.
 */
public record LabSession(
        String sessionId,
        String topicSlug,
        String lessonTitle,
        String moduleId,
        String starterCode,
        Instant createdAt,
        Instant expiresAt,
        String lastOutput   // user's last run output, persisted across edits
) {
}
