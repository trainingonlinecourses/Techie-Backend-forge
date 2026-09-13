package com.backendforge.academy.analytics;

import com.backendforge.academy.user.User;
import jakarta.persistence.*;

import java.time.Instant;

/**
 * One analytics event in the recommendation A/B experiment.
 *
 * <p>The experiment: signed-in learners are deterministically split into two
 * variants by user id — "chip" (the Start-here / Continue-chip recommendations
 * are active) and "control" (same UI, clicks are still logged but the learner
 * reached the lesson by browsing). Each event records how a lesson page was
 * reached, so completion rates can be compared per variant.
 */
@Entity
@Table(name = "analytics_events")
public class AnalyticsEvent {

    public enum Surface {
        /** Click on the "Continue where you left off" / "Start here" chip by the band tabs. */
        CONTINUE_CHIP,
        /** Click on the "Show the X band →" action in the recommendation ribbon. */
        RIBBON_JUMP,
        /** A lesson page was opened without using any recommendation surface. */
        MANUAL_NAVIGATION,
        /** The learner completed a lesson (used as the experiment's outcome metric). */
        LESSON_COMPLETED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Surface surface;

    /** Lesson id for navigation/completion events; null for pure surface clicks. */
    @Column(name = "lesson_id", length = 120)
    private String lessonId;

    /** The band of the chip/ribbon recommendation, e.g. "foundation" (informational). */
    @Column(length = 20)
    private String band;

    @Column(name = "variant", nullable = false, length = 12)
    private String variant;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public AnalyticsEvent() { }

    public AnalyticsEvent(User user, Surface surface, String lessonId, String band, String variant) {
        this.user = user;
        this.surface = surface;
        this.lessonId = lessonId;
        this.band = band;
        this.variant = variant;
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public Surface getSurface() { return surface; }
    public String getLessonId() { return lessonId; }
    public String getBand() { return band; }
    public String getVariant() { return variant; }
    public Instant getCreatedAt() { return createdAt; }
}
