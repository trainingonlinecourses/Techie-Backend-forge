package com.backendforge.academy.lab;

import com.backendforge.academy.security.UserPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Practice-lab endpoints. A user starts a lab for a topic (lesson slug), gets back
 * the lesson's real code as a starter, edits and runs it in the browser simulator,
 * and can submit to compare against expected output.
 *
 * Sessions have a 30-minute TTL and are evicted on access after expiry.
 */
@RestController
@RequestMapping("/api/labs")
public class LabController {

    private final LabService lab;


    public LabController(LabService lab) {
        this.lab = lab;
    }

    /**
     * Start a lab session for a topic.
     * <pre>
     *   GET /api/labs/start?topic=arrays-deep
     * </pre>
     * Returns the session id, the lesson's real starter code, and the expiry time
     * (30 minutes from now).
     */
    @GetMapping("/start")
    public ResponseEntity<?> start(
            @RequestParam String topic,
            @AuthenticationPrincipal UserPrincipal principal) {

        String topicSlug = topic;
        LabSession session;
        try {
            session = lab.start(topicSlug);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        return ResponseEntity.ok(Map.of(
                "sessionId", session.sessionId(),
                "topicSlug", session.topicSlug(),
                "lessonTitle", session.lessonTitle(),
                "moduleId", session.moduleId(),
                "starterCode", session.starterCode(),
                "expiresAt", session.expiresAt().toString(),
                "ttlMinutes", 30
        ));
    }

    /**
     * Check session status / remaining time. The frontend polls this to drive the
     * countdown timer and warn before expiry.
     */
    @GetMapping("/status")
    public ResponseEntity<?> status(
            @RequestParam String sessionId,
            @AuthenticationPrincipal UserPrincipal principal) {

        Long userId = (principal != null) ? principal.user().getId() : null;
        LabSession session;
        try {
            session = lab.status(sessionId);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }

        if (session == null) {
            return ResponseEntity.ok(Map.of(
                    "active", false,
                    "reason", "session expired or not found"
            ));
        }

        long minutesRemaining = lab.minutesRemaining(session.sessionId());
        boolean expired = minutesRemaining == 0;

        return ResponseEntity.ok(Map.of(
                "active", !expired,
                "sessionId", session.sessionId(),
                "topicSlug", session.topicSlug(),
                "lessonTitle", session.lessonTitle(),
                "moduleId", session.moduleId(),
                "starterCode", session.starterCode(),
                "expiresAt", session.expiresAt().toString(),
                "minutesRemaining", minutesRemaining,
                "expired", expired,
                "lastOutput", session.lastOutput() != null ? session.lastOutput() : ""
        ));
    }

    /**
     * Submit user output for the session — persists it server-side so the lab
     * state survives a page reload within the 30-minute window.
     */
    @PostMapping("/output")
    public ResponseEntity<?> recordOutput(
            @RequestParam String sessionId,
            @RequestBody Map<String, String> body,
            @AuthenticationPrincipal UserPrincipal principal) {

        LabSession session = lab.status(sessionId);
        if (session == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Session expired or not found"));
        }

        String output = body.getOrDefault("output", "");
        lab.recordOutput(sessionId, output);

        return ResponseEntity.ok(Map.of("ok", true, "minutesRemaining", lab.minutesRemaining(sessionId)));
    }

    /**
     * Extend the session by 15 minutes (e.g. when the user is actively working).
     * Each session can be extended up to 3 times (max 1.5h total) to prevent a
     * runaway session from living forever — the server still spins down.
     */
    @PostMapping("/extend")
    public ResponseEntity<?> extend(
            @RequestParam String sessionId,
            @AuthenticationPrincipal UserPrincipal principal) {

        LabSession session = lab.status(sessionId);
        if (session == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "Session expired or not found"));
        }

        // Allow up to 3 extensions per session (max 1.5h total from creation).
        boolean extended = lab.extend(sessionId);
        if (!extended) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", "Session extension limit reached (max 3 extensions). " +
                            "Restart the lab for another 30 minutes."));
        }

        long minutesRemaining = lab.minutesRemaining(sessionId);
        return ResponseEntity.ok(Map.of(
                "ok", true,
                "minutesRemaining", minutesRemaining,
                "message", "Session extended by 15 minutes. " +
                        (minutesRemaining > 5 ? "Keep going!" : "Hurry — less than 5 minutes left.")
        ));
    }

    /**
     * Cleanup endpoint — called by a scheduled task or admin. Evicts all expired
     * sessions so the server doesn't hold dead sessions forever.
     */
    @PostMapping("/cleanup")
    public ResponseEntity<?> cleanup() {
        // Count before eviction by listing active sessions.
        long before = lab.sessions().size();
        lab.evictExpired();
        long after = lab.sessions().size();
        return ResponseEntity.ok(Map.of(
                "evicted", before - after,
                "remaining", after
        ));
    }
}
