package com.backendforge.academy.analytics;

import com.backendforge.academy.security.UserPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * Recommendation A/B analytics — the frontend logs how lesson pages are reached
 * (recommendation chip/ribbon vs manual browsing) and completions, so the
 * recommendation's effectiveness is measurable per variant.
 */
@RestController
@RequestMapping("/api/analytics")
public class AnalyticsController {

    private final AnalyticsService service;

    public AnalyticsController(AnalyticsService service) {
        this.service = service;
    }

    public record EventRequest(String surface, String lessonId, String band) { }

    @PostMapping("/events")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void track(@AuthenticationPrincipal UserPrincipal principal,
                      @RequestBody EventRequest req) {
        AnalyticsEvent.Surface surface = parse(req.surface());
        if (surface == AnalyticsEvent.Surface.LESSON_COMPLETED) {
            // Completions are recorded server-side via /progress; a forged
            // client-side completion event would poison the outcome metric.
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "LESSON_COMPLETED is recorded by the server, not accepted from clients");
        }
        service.record(principal.user(), surface, req.lessonId(), req.band());
    }

    /** The caller's own event counts — transparency about what is stored. */
    @GetMapping("/me")
    public Map<String, Long> mine(@AuthenticationPrincipal UserPrincipal principal) {
        return service.myCounts(principal.user().getId());
    }

    /** Per-variant experiment summary — admin only. */
    @GetMapping("/summary")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> summary() {
        return service.summary();
    }

    /** Full A/B dashboard payload (counts, conversion rates, reach, trend) — admin only. */
    @GetMapping("/dashboard")
    @PreAuthorize("hasRole('ADMIN')")
    public Map<String, Object> dashboard() {
        return service.dashboard();
    }

    private static AnalyticsEvent.Surface parse(String raw) {
        if (raw == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "surface is required");
        }
        try {
            return AnalyticsEvent.Surface.valueOf(raw);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown surface: " + raw);
        }
    }
}
