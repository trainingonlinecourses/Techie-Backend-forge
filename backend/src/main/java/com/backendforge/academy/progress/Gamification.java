package com.backendforge.academy.progress;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.*;

/**
 * Pure gamification math — no Spring, no repository access, fully unit-testable.
 *
 * <p>Rules:
 * <ul>
 *   <li><b>XP:</b> 10 XP per completed lesson, 15 XP for expert-level lessons.</li>
 *   <li><b>Streak:</b> consecutive distinct completion days (UTC) ending today or yesterday.</li>
 *   <li><b>Badges:</b> milestone achievements evaluated against XP, streak and progress data.</li>
 * </ul>
 *
 * Everything derives from {@code (lessonId, completedAt, level, minutes)} tuples, so the
 * read-model costs no storage and never goes stale.
 */
public final class Gamification {

    public static final int XP_PER_LESSON = 10;
    public static final int XP_EXPERT_BONUS = 5; // expert lessons award XP_PER_LESSON + this

    private Gamification() {}

    /** One completion fact, projected from the database. */
    public record Completion(String lessonId, Instant completedAt, String level, int minutes) {}

    /** Progress of one learning-path level. */
    public record LevelProgress(String level, long completed, long total) {
        public double fraction() {
            return total == 0 ? 0.0 : Math.min(1.0, (double) completed / total);
        }
    }

    /** A single badge and whether it is earned yet. */
    public record Badge(String id, String name, String description, String icon, boolean earned, int progressPct) {}

    /** Full gamification summary served to the frontend. */
    public record Summary(
            long xp,
            int streakDays,
            int bestStreak,
            String xpLevel,
            int xpLevelIndex,
            List<LevelProgress> levels,
            List<Badge> badges) {}

    // ---- XP ---------------------------------------------------------------

    public static long xp(List<Completion> completions) {
        return completions.stream()
                .mapToLong(c -> c.level() != null && c.level().equals("expert")
                        ? XP_PER_LESSON + XP_EXPERT_BONUS
                        : XP_PER_LESSON)
                .sum();
    }

    // ---- XP levels ----------------------------------------------------------

    private static final List<String> XP_LEVEL_NAMES =
            List.of("Byte", "Bit", "Loop", "Class", "Compiler", "JVM", "Thread", "Garbage Collector");

    /** Cumulative XP required to reach each level (index 0 is free). */
    static final long[] XP_THRESHOLDS = {0, 100, 300, 700, 1500, 3000, 5500, 9000};

    public static int xpLevelIndex(long xp) {
        int idx = 0;
        for (int i = 0; i < XP_THRESHOLDS.length; i++) {
            if (xp >= XP_THRESHOLDS[i]) idx = i;
        }
        return idx;
    }

    public static String xpLevelName(long xp) {
        return XP_LEVEL_NAMES.get(xpLevelIndex(xp));
    }

    /** 0..1 progress toward the next XP level (1.0 at max level). */
    public static double xpLevelProgress(long xp) {
        int idx = xpLevelIndex(xp);
        if (idx >= XP_THRESHOLDS.length - 1) return 1.0;
        long lower = XP_THRESHOLDS[idx];
        long upper = XP_THRESHOLDS[idx + 1];
        return (double) (xp - lower) / (upper - lower);
    }

    // ---- streaks ------------------------------------------------------------

    /**
     * Consecutive distinct UTC days ending today (or yesterday, so the streak
     * isn't "broken" before the user has studied today).
     */
    public static int streak(List<Completion> completions, LocalDate today) {
        return streakInternal(completions, today, false);
    }

    /** Longest ever run of consecutive distinct completion days. */
    public static int bestStreak(List<Completion> completions) {
        return streakInternal(completions, null, true);
    }

    private static int streakInternal(List<Completion> completions, LocalDate today, boolean best) {
        if (completions.isEmpty()) return 0;
        Set<LocalDate> days = new HashSet<>();
        for (Completion c : completions) {
            days.add(c.completedAt().atOffset(ZoneOffset.UTC).toLocalDate());
        }
        List<LocalDate> sorted = new ArrayList<>(days);
        Collections.sort(sorted);

        int longest = 1, run = 1;
        for (int i = 1; i < sorted.size(); i++) {
            if (sorted.get(i).equals(sorted.get(i - 1).plusDays(1))) {
                run++;
            } else {
                run = 1;
            }
            longest = Math.max(longest, run);
        }
        if (best) return longest;

        // current streak: walk back from today (or yesterday) counting consecutive days
        LocalDate anchor = days.contains(today) ? today : today.minusDays(1);
        if (!days.contains(anchor)) return 0;
        int streak = 1;
        LocalDate d = anchor;
        while (days.contains(d.minusDays(1))) {
            streak++;
            d = d.minusDays(1);
        }
        return streak;
    }

    // ---- level rings ----------------------------------------------------------

    public static List<LevelProgress> levelProgress(List<Completion> completions,
                                                    Map<String, Long> totalsPerLevel) {
        Map<String, Long> completedPerLevel = new HashMap<>();
        for (Completion c : completions) {
            if (c.level() == null) continue;
            completedPerLevel.merge(c.level(), 1L, Long::sum);
        }
        List<String> order = List.of("foundation", "intermediate", "advanced", "expert");
        List<LevelProgress> out = new ArrayList<>();
        for (String level : order) {
            out.add(new LevelProgress(level, completedPerLevel.getOrDefault(level, 0L),
                    totalsPerLevel.getOrDefault(level, 0L)));
        }
        return out;
    }

    // ---- badges ---------------------------------------------------------------

    public static List<Badge> badges(List<Completion> completions,
                                     long xp,
                                     int streakDays,
                                     List<LevelProgress> levels) {
        long completed = completions.size();
        long lessonsTotal = levels.stream().mapToLong(LevelProgress::total).sum();

        List<Badge> badges = new ArrayList<>();
        badges.add(stepBadge("first-lesson", "First Steps", "Complete your first lesson", "🌱",
                completed >= 1, completed, 1));
        badges.add(stepBadge("ten-lessons", "Getting Serious", "Complete 10 lessons", "🔥",
                completed >= 10, completed, 10));
        badges.add(stepBadge("fifty-lessons", "Half Century", "Complete 50 lessons", "⚔️",
                completed >= 50, completed, 50));
        badges.add(stepBadge("century", "Century", "Complete 100 lessons", "💯",
                completed >= 100, completed, 100));
        badges.add(stepBadge("marathon", "Marathoner", "Complete every lesson in the academy", "🏁",
                lessonsTotal > 0 && completed >= lessonsTotal, completed, Math.max(1, lessonsTotal)));

        badges.add(stepBadge("streak-3", "Warm Up", "Keep a 3-day streak", "🔥",
                streakDays >= 3, streakDays, 3));
        badges.add(stepBadge("streak-7", "Week Warrior", "Keep a 7-day streak", "🗓️",
                streakDays >= 7, streakDays, 7));
        badges.add(stepBadge("streak-30", "Habit Formed", "Keep a 30-day streak", "🏆",
                streakDays >= 30, streakDays, 30));

        badges.add(stepBadge("xp-500", "XP Hunter", "Earn 500 XP", "⚡",
                xp >= 500, xp, 500));
        badges.add(stepBadge("xp-2000", "XP Master", "Earn 2,000 XP", "🌟",
                xp >= 2000, xp, 2000));

        long foundationDone = levels.stream()
                .filter(l -> l.level().equals("foundation"))
                .mapToLong(LevelProgress::completed).sum();
        long foundationTotal = levels.stream()
                .filter(l -> l.level().equals("foundation"))
                .mapToLong(LevelProgress::total).sum();
        badges.add(stepBadge("foundation-done", "Foundations Solid", "Finish the entire foundation level", "🏛️",
                foundationTotal > 0 && foundationDone >= foundationTotal, foundationDone, Math.max(1, foundationTotal)));

        long expertDone = levels.stream().filter(l -> l.level().equals("expert")).mapToLong(LevelProgress::completed).sum();
        long expertTotal = levels.stream().filter(l -> l.level().equals("expert")).mapToLong(LevelProgress::total).sum();
        badges.add(stepBadge("expert-started", "Into the Deep", "Complete 10 expert-level lessons", "🧠",
                expertDone >= 10, expertDone, 10));

        return badges;
    }

    /** A badge that is earned, or shows percent progress toward earning. */
    private static Badge stepBadge(String id, String name, String description, String icon,
                                   boolean earned, long progress, long target) {
        int pct = earned ? 100 : (int) Math.min(99, progress * 100 / Math.max(1, target));
        return new Badge(id, name, description, icon, earned, pct);
    }

    // ---- full summary -----------------------------------------------------------

    public static Summary summary(List<Completion> completions,
                                  Map<String, Long> totalsPerLevel,
                                  LocalDate today) {
        long xp = xp(completions);
        int streak = streak(completions, today);
        int best = bestStreak(completions);
        List<LevelProgress> levels = levelProgress(completions, totalsPerLevel);
        List<Badge> badges = badges(completions, xp, streak, levels);
        return new Summary(xp, streak, best, xpLevelName(xp), xpLevelIndex(xp), levels, badges);
    }
}
