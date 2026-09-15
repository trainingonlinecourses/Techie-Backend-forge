package com.backendforge.academy.analytics;

import com.backendforge.academy.user.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
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

    /**
     * Everything the admin dashboard needs in one payload: per-variant/surface
     * counts, derived conversion rates, distinct-user reach, and a daily
     * activity trend. Derived here (not in SQL) so the rules stay testable.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> dashboard() {
        Map<String, Object> out = new LinkedHashMap<>();

        Map<String, Map<String, Long>> perVariant = new LinkedHashMap<>();
        for (String variant : List.of(VARIANT_CHIP, VARIANT_CONTROL)) {
            Map<String, Long> perSurface = new LinkedHashMap<>();
            for (Object[] row : repo.summarizeByVariantAndSurface()) {
                if (variant.equals(row[0])) {
                    perSurface.put(((AnalyticsEvent.Surface) row[1]).name(), (Long) row[2]);
                }
            }
            perVariant.put(variant, perSurface);
        }
        out.put("variants", perVariant);

        // Derived per-variant metrics: conversions of impressions into chip
        // clicks and into completions, and distinct-learner reach.
        Map<String, Map<String, Object>> derived = new LinkedHashMap<>();
        Map<String, Long> impressionUsers = new LinkedHashMap<>();
        for (Object[] row : repo.countDistinctUsersByVariantWithImpression()) {
            impressionUsers.put((String) row[0], (Long) row[1]);
        }
        Map<String, Long> convertingUsers = new LinkedHashMap<>();
        for (Object[] row : repo.countDistinctImpressionUsersWhoCompleted()) {
            convertingUsers.put((String) row[0], (Long) row[1]);
        }
        for (var entry : perVariant.entrySet()) {
            Map<String, Long> counts = entry.getValue();
            long impressions = counts.getOrDefault("IMPRESSION", 0L);
            long chipClicks = counts.getOrDefault("CONTINUE_CHIP", 0L);
            long completions = counts.getOrDefault("LESSON_COMPLETED", 0L);
            long users = impressionUsers.getOrDefault(entry.getKey(), 0L);
            long converted = convertingUsers.getOrDefault(entry.getKey(), 0L);

            Map<String, Object> d = new LinkedHashMap<>();
            d.put("impressions", impressions);
            d.put("chipClicks", chipClicks);
            d.put("completions", completions);
            d.put("usersWithImpression", users);
            d.put("impressionUsersCompleted", converted);
            d.put("clickRate", rate(chipClicks, impressions));
            // Funnel rate: impression-users who completed / impression-users.
            // Capped at 100% — multi-day users legitimately exceed one completion.
            d.put("completionRate", Math.min(rate(converted, users), 100.0));
            derived.put(entry.getKey(), d);
        }
        out.put("metrics", derived);

        // Totals across variants for the headline cards.
        long totalEvents = repo.count();
        long totalUsers = repo.countDistinctUsers();
        long totalImpressions = perVariant.values().stream()
                .mapToLong(m -> m.getOrDefault("IMPRESSION", 0L)).sum();
        long totalChipClicks = perVariant.values().stream()
                .mapToLong(m -> m.getOrDefault("CONTINUE_CHIP", 0L)).sum();
        long totalCompletions = perVariant.values().stream()
                .mapToLong(m -> m.getOrDefault("LESSON_COMPLETED", 0L)).sum();
        Map<String, Object> totals = new LinkedHashMap<>();
        totals.put("events", totalEvents);
        totals.put("users", totalUsers);
        totals.put("impressions", totalImpressions);
        totals.put("chipClicks", totalChipClicks);
        totals.put("completions", totalCompletions);
        out.put("totals", totals);

        // Daily trend: [{day: "2026-09-15", events: 42}, ...]
        List<Map<String, Object>> trend = new ArrayList<>();
        for (Object[] row : repo.countByDay()) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("day", String.valueOf(row[0]));
            point.put("events", ((Number) row[1]).longValue());
            trend.add(point);
        }
        out.put("trend", trend);
        return out;
    }

    /** Percentage rate as a 0-100 double with one decimal; 0 when the base is 0. */
    private static double rate(long part, long base) {
        if (base <= 0) return 0.0;
        return Math.round((part * 1000.0) / base) / 10.0;
    }

    private static String trim(String s) {
        if (s == null) return null;
        return s.length() > 120 ? s.substring(0, 120) : s;
    }
}
