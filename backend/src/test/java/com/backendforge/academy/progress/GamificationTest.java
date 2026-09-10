package com.backendforge.academy.progress;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the pure gamification math — XP, XP levels, streaks,
 * per-level progress rings and badge milestones.
 */
class GamificationTest {

    private static Instant at(int year, int month, int day) {
        return LocalDate.of(year, month, day).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    private static Gamification.Completion c(String id, Instant t, String level) {
        return new Gamification.Completion(id, t, level, 10);
    }

    @Test
    @DisplayName("XP: 10 per lesson, +5 bonus for expert lessons")
    void xpCalculation() {
        var completions = List.of(
                c("a", at(2026, 9, 1), "foundation"),
                c("b", at(2026, 9, 2), "foundation"),
                c("c", at(2026, 9, 3), "expert"));
        assertThat(Gamification.xp(completions)).isEqualTo(35); // 10 + 10 + 15
        assertThat(Gamification.xp(List.of())).isZero();
    }

    @Test
    @DisplayName("Current streak counts consecutive days ending today or yesterday")
    void currentStreak() {
        LocalDate today = LocalDate.of(2026, 9, 10);
        var completions = List.of(
                c("a", at(2026, 9, 7), "foundation"),
                c("b", at(2026, 9, 8), "foundation"),
                c("c", at(2026, 9, 9), "foundation"));
        // nothing today: anchored to yesterday (Sep 9) → 3
        assertThat(Gamification.streak(completions, today)).isEqualTo(3);
    }

    @Test
    @DisplayName("A broken streak resets to zero even with a long history")
    void brokenStreak() {
        LocalDate today = LocalDate.of(2026, 9, 10);
        var completions = List.of(
                c("a", at(2026, 9, 1), "foundation"),
                c("b", at(2026, 9, 2), "foundation"));
        assertThat(Gamification.streak(completions, today)).isZero();
    }

    @Test
    @DisplayName("Same-day duplicates count once toward the streak")
    void streakIgnoresSameDayDuplicates() {
        LocalDate today = LocalDate.of(2026, 9, 10);
        var completions = List.of(
                c("a", at(2026, 9, 9).plusSeconds(3600), "foundation"),
                c("b", at(2026, 9, 9).plusSeconds(7200), "foundation"));
        assertThat(Gamification.streak(completions, today)).isEqualTo(1);
    }

    @Test
    @DisplayName("Best streak finds the longest historical run")
    void bestStreakRun() {
        var completions = List.of(
                c("a", at(2026, 1, 1), "foundation"),
                c("b", at(2026, 1, 2), "foundation"),
                c("c", at(2026, 1, 3), "foundation"),
                c("d", at(2026, 2, 1), "foundation"),
                c("e", at(2026, 2, 2), "foundation"));
        assertThat(Gamification.bestStreak(completions)).isEqualTo(3);
    }

    @Test
    @DisplayName("XP level thresholds and progress")
    void xpLevels() {
        assertThat(Gamification.xpLevelName(0)).isEqualTo("Byte");
        assertThat(Gamification.xpLevelIndex(0)).isZero();
        assertThat(Gamification.xpLevelName(100)).isEqualTo("Bit");
        assertThat(Gamification.xpLevelName(99999)).isEqualTo("Garbage Collector");
        assertThat(Gamification.xpLevelIndex(99999)).isEqualTo(7);
        assertThat(Gamification.xpLevelProgress(150)).isBetween(0.24, 0.26); // halfway 100→300
        assertThat(Gamification.xpLevelProgress(99999)).isEqualTo(1.0);
    }

    @Test
    @DisplayName("Level rings: completed vs total per learning-path level, in canonical order")
    void levelRings() {
        var completions = List.of(
                c("a", Instant.now(), "foundation"),
                c("b", Instant.now(), "foundation"),
                c("c", Instant.now(), "expert"));
        var totals = Map.of("foundation", 10L, "intermediate", 20L, "advanced", 30L, "expert", 40L);
        var rings = Gamification.levelProgress(completions, totals);

        assertThat(rings).hasSize(4);
        assertThat(rings.get(0).level()).isEqualTo("foundation");
        assertThat(rings.get(0).completed()).isEqualTo(2);
        assertThat(rings.get(0).total()).isEqualTo(10);
        assertThat(rings.get(3).completed()).isEqualTo(1);
        assertThat(rings.get(0).fraction()).isEqualTo(0.2);
        // canonical order preserved even if totals map order differs
        assertThat(rings).extracting(Gamification.LevelProgress::level)
                .containsExactly("foundation", "intermediate", "advanced", "expert");
    }

    @Test
    @DisplayName("Badges: milestones flip earned and track percent progress")
    void badges() {
        var rings = Gamification.levelProgress(List.of(), Map.of(
                "foundation", 10L, "intermediate", 20L, "advanced", 30L, "expert", 40L));

        var none = Gamification.badges(List.of(), 0, 0, rings);
        assertThat(none).allSatisfy(b -> assertThat(b.earned()).isFalse());
        var first = none.stream().filter(b -> b.id().equals("first-lesson")).findFirst().orElseThrow();
        assertThat(first.progressPct()).isZero();

        var completions = List.of(c("a", Instant.now(), "foundation"));
        var some = Gamification.badges(completions, 500, 7, rings);
        assertThat(some).anySatisfy(b -> {
            assertThat(b.id()).isEqualTo("first-lesson");
            assertThat(b.earned()).isTrue();
            assertThat(b.progressPct()).isEqualTo(100);
        });
        var xpHunter = some.stream().filter(b -> b.id().equals("xp-500")).findFirst().orElseThrow();
        assertThat(xpHunter.earned()).isTrue();
        var weekWarrior = some.stream().filter(b -> b.id().equals("streak-7")).findFirst().orElseThrow();
        assertThat(weekWarrior.earned()).isTrue();
        // progress badge not yet earned shows a partial percent, capped below 100
        var xpMaster = some.stream().filter(b -> b.id().equals("xp-2000")).findFirst().orElseThrow();
        assertThat(xpMaster.earned()).isFalse();
        assertThat(xpMaster.progressPct()).isBetween(1, 99);
    }

    @Test
    @DisplayName("Full summary wires all parts together")
    void summaryEndToEnd() {
        var completions = List.of(
                c("a", at(2026, 9, 9), "foundation"),
                c("b", at(2026, 9, 10), "foundation"));
        var summary = Gamification.summary(completions,
                Map.of("foundation", 10L, "intermediate", 20L, "advanced", 30L, "expert", 40L),
                LocalDate.of(2026, 9, 10));

        assertThat(summary.xp()).isEqualTo(20);
        assertThat(summary.streakDays()).isEqualTo(2);
        assertThat(summary.bestStreak()).isEqualTo(2);
        assertThat(summary.xpLevel()).isEqualTo("Byte");
        assertThat(summary.levels()).hasSize(4);
        assertThat(summary.badges()).isNotEmpty();
        var first = summary.badges().stream()
                .filter(b -> b.id().equals("first-lesson")).findFirst().orElseThrow();
        assertThat(first.earned()).isTrue();
    }
}
