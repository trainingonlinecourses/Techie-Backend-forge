package com.backendforge.academy.analytics;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the A/B variant assignment — the experiment's core invariant:
 * every user maps to exactly one of two variants, deterministically.
 */
class AnalyticsServiceTest {

    @Test
    @DisplayName("variantFor: even ids → chip, odd ids → control")
    void variantAssignment() {
        assertThat(AnalyticsService.variantFor(2L)).isEqualTo(AnalyticsService.VARIANT_CHIP);
        assertThat(AnalyticsService.variantFor(452L)).isEqualTo(AnalyticsService.VARIANT_CHIP);
        assertThat(AnalyticsService.variantFor(1L)).isEqualTo(AnalyticsService.VARIANT_CONTROL);
        assertThat(AnalyticsService.variantFor(453L)).isEqualTo(AnalyticsService.VARIANT_CONTROL);
    }

    @Test
    @DisplayName("variantFor: stable — the same id always gets the same variant")
    void stability() {
        for (long id = 1; id <= 100; id++) {
            String first = AnalyticsService.variantFor(id);
            for (int i = 0; i < 5; i++) {
                assertThat(AnalyticsService.variantFor(id)).isEqualTo(first);
            }
        }
    }

    @Test
    @DisplayName("variantFor: both variants occur and nothing else is ever returned")
    void splitAndClosure() {
        Set<String> seen = new HashSet<>();
        for (long id = 1; id <= 200; id++) {
            String v = AnalyticsService.variantFor(id);
            assertThat(v).isIn(AnalyticsService.VARIANT_CHIP, AnalyticsService.VARIANT_CONTROL);
            seen.add(v);
        }
        assertThat(seen).containsExactlyInAnyOrder(AnalyticsService.VARIANT_CHIP, AnalyticsService.VARIANT_CONTROL);
    }

    @Test
    @DisplayName("variantFor: null id degrades safely to control")
    void nullSafety() {
        assertThat(AnalyticsService.variantFor(null)).isEqualTo(AnalyticsService.VARIANT_CONTROL);
    }
}
