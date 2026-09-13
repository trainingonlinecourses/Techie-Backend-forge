package com.backendforge.academy.analytics;

import com.backendforge.academy.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Recommendation A/B experiment — event ingestion and variant assignment.
 *
 * <p>Variants are assigned deterministically by user id so the split is stable
 * across sessions and devices without storing anything extra: even user ids go
 * to the "chip" variant, odd ids to "control". The chip UI itself stays active
 * for everyone — what differs is that control-group clicks carry no
 * recommendation context, so the comparison measures how much the
 * recommendation surfaces (chip + ribbon) contribute on top of manual browsing.
 */
@Service
public class AnalyticsService {

    public static final String VARIANT_CHIP = "chip";
    public static final String VARIANT_CONTROL = "control";

    private final AnalyticsEventRepository repo;

    public AnalyticsService(AnalyticsEventRepository repo) {
        this.repo = repo;
    }

    /** Deterministic, stable variant for a user id — no extra storage needed. */
    public static String variantFor(Long userId) {
        return userId != null && userId % 2 == 0 ? VARIANT_CHIP : VARIANT_CONTROL;
    }

    @Transactional
    public void record(User user, AnalyticsEvent.Surface surface, String lessonId, String band) {
        Long userId = user.getId();
        repo.save(new AnalyticsEvent(user, surface, trim(lessonId), trim(band), variantFor(userId)));
    }

    /** The caller's own counters — powers the "your data contributes to N events" transparency line. */
    @Transactional(readOnly = true)
    public Map<String, Long> myCounts(Long userId) {
        Map<String, Long> out = new LinkedHashMap<>();
        for (AnalyticsEvent.Surface s : AnalyticsEvent.Surface.values()) {
            out.put(s.name(), repo.countByUserIdAndSurface(userId, s));
        }
        return out;
    }

    /**
     * Experiment summary: per variant, per surface counts, ready for a simple
     * conversion comparison (chip-driven completions vs control completions).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> summary() {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String variant : List.of(VARIANT_CHIP, VARIANT_CONTROL)) {
            Map<String, Long> perSurface = new LinkedHashMap<>();
            for (Object[] row : repo.summarizeByVariantAndSurface()) {
                if (variant.equals(row[0])) {
                    perSurface.put(((AnalyticsEvent.Surface) row[1]).name(), (Long) row[2]);
                }
            }
            out.put(variant, perSurface);
        }
        return out;
    }

    private static String trim(String s) {
        if (s == null) return null;
        return s.length() > 120 ? s.substring(0, 120) : s;
    }
}
