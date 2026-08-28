package com.backendforge.academy.certificate;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "certificates")
public class Certificate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long userId;

    @Column(nullable = false, unique = true)
    private String certificateCode; // unique code like "BF-2024-XXXX"

    @Column(nullable = false)
    private String userName;

    @Column(nullable = false)
    private String courseTitle;

    @Column(nullable = false)
    private int totalLessons;

    @Column(nullable = false)
    private int completedLessons;

    @Column(nullable = false)
    private int quizzesPassed;

    @Column(nullable = false)
    private Instant issuedAt;

    @Column(nullable = false)
    private boolean active;

    @PrePersist
    void onCreate() {
        issuedAt = Instant.now();
        active = true;
    }

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }

    public String getCertificateCode() { return certificateCode; }
    public void setCertificateCode(String certificateCode) { this.certificateCode = certificateCode; }

    public String getUserName() { return userName; }
    public void setUserName(String userName) { this.userName = userName; }

    public String getCourseTitle() { return courseTitle; }
    public void setCourseTitle(String courseTitle) { this.courseTitle = courseTitle; }

    public int getTotalLessons() { return totalLessons; }
    public void setTotalLessons(int totalLessons) { this.totalLessons = totalLessons; }

    public int getCompletedLessons() { return completedLessons; }
    public void setCompletedLessons(int completedLessons) { this.completedLessons = completedLessons; }

    public int getQuizzesPassed() { return quizzesPassed; }
    public void setQuizzesPassed(int quizzesPassed) { this.quizzesPassed = quizzesPassed; }

    public Instant getIssuedAt() { return issuedAt; }
    public void setIssuedAt(Instant issuedAt) { this.issuedAt = issuedAt; }

    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
