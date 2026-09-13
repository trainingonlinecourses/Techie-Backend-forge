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
}
