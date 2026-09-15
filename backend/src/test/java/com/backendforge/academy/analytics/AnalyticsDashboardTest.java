package com.backendforge.academy.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the admin dashboard aggregation: derived conversion rates,
 * totals, reach and the daily trend — the math the admin page visualizes.
 */
class AnalyticsDashboardTest {

    private AnalyticsEventRepository repo;
    private AnalyticsService service;

    @BeforeEach
    void setUp() {
        repo = mock(AnalyticsEventRepository.class);
        service = new AnalyticsService(repo);
    }

    private static Object[] row(String variant, AnalyticsEvent.Surface surface, long count) {
        return new Object[]{ variant, surface, count };
    }

    @Test
    @DisplayName("dashboard: derives click/completion rates and totals from raw counts")
    void derivedMetrics() {
        when(repo.summarizeByVariantAndSurface()).thenReturn(List.of(
                row("chip", AnalyticsEvent.Surface.IMPRESSION, 100),
                row("chip", AnalyticsEvent.Surface.CONTINUE_CHIP, 25),
                row("chip", AnalyticsEvent.Surface.LESSON_COMPLETED, 10),
                row("control", AnalyticsEvent.Surface.IMPRESSION, 90),
                row("control", AnalyticsEvent.Surface.CONTINUE_CHIP, 5),
                row("control", AnalyticsEvent.Surface.LESSON_COMPLETED, 9)
        ));
        when(repo.countDistinctUsersByVariantWithImpression()).thenReturn(List.of(
                new Object[]{ "chip", 40L },
                new Object[]{ "control", 35L }
        ));
        when(repo.countDistinctImpressionUsersWhoCompleted()).thenReturn(List.of(
                new Object[]{ "chip", 6L },
                new Object[]{ "control", 4L }
        ));
        when(repo.count()).thenReturn(239L);
        when(repo.countDistinctUsers()).thenReturn(75L);
        when(repo.countByDay()).thenReturn(List.of(
                new Object[]{ java.sql.Date.valueOf("2026-09-14"), 30L },
                new Object[]{ java.sql.Date.valueOf("2026-09-15"), 55L }
        ));

        Map<String, Object> dash = service.dashboard();

        // Rates: chip 25 clicks / 100 impressions = 25.0%; funnel 6 of 40
        // impression-users completed = 15.0%.
        @SuppressWarnings("unchecked")
        Map<String, Object> chip = (Map<String, Object>) ((Map<String, Object>) dash.get("metrics")).get("chip");
        assertThat(chip.get("clickRate")).isEqualTo(25.0);
        assertThat(chip.get("completionRate")).isEqualTo(15.0);
        assertThat(chip.get("usersWithImpression")).isEqualTo(40L);
        assertThat(chip.get("impressionUsersCompleted")).isEqualTo(6L);

        @SuppressWarnings("unchecked")
        Map<String, Object> control = (Map<String, Object>) ((Map<String, Object>) dash.get("metrics")).get("control");
        // 5/90 → 5.6% (one-decimal rounding); funnel 4/35 → 11.4%.
        assertThat(control.get("clickRate")).isEqualTo(5.6);
        assertThat(control.get("completionRate")).isEqualTo(11.4);

        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) dash.get("totals");
        assertThat(totals.get("events")).isEqualTo(239L);
        assertThat(totals.get("users")).isEqualTo(75L);
        assertThat(totals.get("impressions")).isEqualTo(190L);
        assertThat(totals.get("chipClicks")).isEqualTo(30L);
        assertThat(totals.get("completions")).isEqualTo(19L);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) dash.get("trend");
        assertThat(trend).hasSize(2);
        assertThat(trend.get(0).get("day")).isEqualTo("2026-09-14");
        assertThat(trend.get(0).get("events")).isEqualTo(30L);
    }

    @Test
    @DisplayName("dashboard: empty data → zeroed metrics, no division-by-zero, empty trend")
    void emptyData() {
        when(repo.summarizeByVariantAndSurface()).thenReturn(List.of());
        when(repo.countDistinctUsersByVariantWithImpression()).thenReturn(List.<Object[]>of());
        when(repo.countDistinctImpressionUsersWhoCompleted()).thenReturn(List.<Object[]>of());
        when(repo.count()).thenReturn(0L);
        when(repo.countDistinctUsers()).thenReturn(0L);
        when(repo.countByDay()).thenReturn(List.of());

        Map<String, Object> dash = service.dashboard();

        @SuppressWarnings("unchecked")
        Map<String, Object> chip = (Map<String, Object>) ((Map<String, Object>) dash.get("metrics")).get("chip");
        assertThat(chip.get("impressions")).isEqualTo(0L);
        assertThat(chip.get("clickRate")).isEqualTo(0.0);
        assertThat(chip.get("completionRate")).isEqualTo(0.0);
        assertThat(chip.get("usersWithImpression")).isEqualTo(0L);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> trend = (List<Map<String, Object>>) dash.get("trend");
        assertThat(trend).isEmpty();

        Mockito.verify(repo).count();
    }

    @Test
    @DisplayName("dashboard: variant with events but zero impressions still yields 0 rates")
    void zeroImpressionBase() {
        when(repo.summarizeByVariantAndSurface()).thenReturn(List.<Object[]>of(
                row("control", AnalyticsEvent.Surface.MANUAL_NAVIGATION, 7)
        ));
        when(repo.countDistinctUsersByVariantWithImpression()).thenReturn(List.<Object[]>of());
        when(repo.countDistinctImpressionUsersWhoCompleted()).thenReturn(List.<Object[]>of());
        when(repo.count()).thenReturn(7L);
        when(repo.countDistinctUsers()).thenReturn(2L);
        when(repo.countByDay()).thenReturn(List.of());

        Map<String, Object> dash = service.dashboard();

        @SuppressWarnings("unchecked")
        Map<String, Object> control = (Map<String, Object>) ((Map<String, Object>) dash.get("metrics")).get("control");
        assertThat(control.get("impressions")).isEqualTo(0L);
        assertThat(control.get("clickRate")).isEqualTo(0.0);
        assertThat(control.get("completionRate")).isEqualTo(0.0);
    }

    @Test
    @DisplayName("dashboard: missing surface keys default to 0 (variant with impressions only)")
    void missingSurfacesDefaultToZero() {
        when(repo.summarizeByVariantAndSurface()).thenReturn(List.<Object[]>of(
                row("chip", AnalyticsEvent.Surface.IMPRESSION, 4)
        ));
        when(repo.countDistinctUsersByVariantWithImpression()).thenReturn(List.<Object[]>of(
                new Object[]{ "chip", 3L }
        ));
        when(repo.countDistinctImpressionUsersWhoCompleted()).thenReturn(List.<Object[]>of());
        when(repo.count()).thenReturn(4L);
        when(repo.countDistinctUsers()).thenReturn(3L);
        when(repo.countByDay()).thenReturn(List.of());

        Map<String, Object> dash = service.dashboard();

        @SuppressWarnings("unchecked")
        Map<String, Object> chip = (Map<String, Object>) ((Map<String, Object>) dash.get("metrics")).get("chip");
        assertThat(chip.get("chipClicks")).isEqualTo(0L);
        assertThat(chip.get("completions")).isEqualTo(0L);
        assertThat(chip.get("clickRate")).isEqualTo(0.0);
        assertThat(chip.get("usersWithImpression")).isEqualTo(3L);
    }
}
