package com.backendforge.academy.analytics;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AnalyticsEventRepository extends JpaRepository<AnalyticsEvent, Long> {

    long countByUserIdAndSurface(Long userId, AnalyticsEvent.Surface surface);

    long countByUserIdAndVariant(Long userId, String variant);

    @Query("""
           select a.variant, a.surface, count(a)
           from AnalyticsEvent a
           group by a.variant, a.surface
           """)
    List<Object[]> summarizeByVariantAndSurface();

    @Query("""
           select count(distinct a.user.id)
           from AnalyticsEvent a
           """)
    long countDistinctUsers();

    /** Events grouped by UTC day for the activity trend chart. CAST is portable across H2 and Postgres. */
    @Query("""
           select cast(a.createdAt as date), count(a)
           from AnalyticsEvent a
           group by cast(a.createdAt as date)
           order by cast(a.createdAt as date)
           """)
    List<Object[]> countByDay();

    /** Distinct users who saw at least one impression, per variant. */
    @Query("""
           select a.variant, count(distinct a.user.id)
           from AnalyticsEvent a
           where a.surface = com.backendforge.academy.analytics.AnalyticsEvent.Surface.IMPRESSION
           group by a.variant
           """)
    List<Object[]> countDistinctUsersByVariantWithImpression();

    /**
     * Distinct impression-users per variant who later completed at least one
     * lesson — the true impression-to-completion funnel (excludes seeded
     * completions from users who never saw a recommendation).
     */
    @Query("""
           select a2.variant, count(distinct a2.user.id)
           from AnalyticsEvent a2
           where a2.surface = com.backendforge.academy.analytics.AnalyticsEvent.Surface.LESSON_COMPLETED
             and exists (select 1 from AnalyticsEvent a1
                         where a1.user.id = a2.user.id
                           and a1.surface = com.backendforge.academy.analytics.AnalyticsEvent.Surface.IMPRESSION)
           group by a2.variant
           """)
    List<Object[]> countDistinctImpressionUsersWhoCompleted();
}
