package com.backendforge.academy.certificate;

import com.backendforge.academy.content.ContentService;
import com.backendforge.academy.progress.ProgressService;
import com.backendforge.academy.quiz.QuizService;
import com.backendforge.academy.user.User;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;
import java.util.Optional;

@Service
public class CertificateService {

    private final CertificateRepository certRepo;
    private final ProgressService progressService;
    private final QuizService quizService;
    private final ContentService contentService;
    private final SecureRandom random = new SecureRandom();

    public CertificateService(CertificateRepository certRepo,
                              ProgressService progressService,
                              QuizService quizService,
                              ContentService contentService) {
        this.certRepo = certRepo;
        this.progressService = progressService;
        this.quizService = quizService;
        this.contentService = contentService;
    }

    /** Check if user is eligible for a certificate (>= 80% lessons completed). */
    public boolean isEligible(Long userId) {
        long completed = progressService.completedCount(userId);
        long total = contentService.modules().stream().mapToLong(m -> m.lessonCount()).sum();
        return total > 0 && (completed * 100.0 / total) >= 80.0;
    }

    /** Get completion percentage. */
    public int getCompletionPercentage(Long userId) {
        long completed = progressService.completedCount(userId);
        long total = contentService.modules().stream().mapToLong(m -> m.lessonCount()).sum();
        return total > 0 ? (int) ((completed * 100) / total) : 0;
    }

    /** Generate a certificate for an eligible user. */
    public Optional<Certificate> generateCertificate(User user) {
        // Check if already has an active certificate
        if (certRepo.existsByUserIdAndActiveTrue(user.getId())) {
            return certRepo.findByUserId(user.getId()).stream()
                    .filter(Certificate::isActive)
                    .findFirst();
        }

        // Check eligibility
        if (!isEligible(user.getId())) {
            return Optional.empty();
        }

        // Generate unique certificate code
        String code = generateCode();

        Certificate cert = new Certificate();
        cert.setUserId(user.getId());
        cert.setCertificateCode(code);
        cert.setUserName(user.getDisplayName());
        cert.setCourseTitle("BackendForge Academy — Java & Spring Boot Mastery");
        cert.setTotalLessons((int) contentService.modules().stream().mapToLong(m -> m.lessonCount()).sum());
        cert.setCompletedLessons((int) progressService.completedCount(user.getId()));
        cert.setQuizzesPassed((int) quizService.getPassedQuizCount(user.getId()));

        return Optional.of(certRepo.save(cert));
    }

    /** Get user's certificates. */
    public List<Certificate> getUserCertificates(Long userId) {
        return certRepo.findByUserId(userId);
    }

    /** Verify a certificate by code. */
    public Optional<Certificate> verifyCertificate(String code) {
        return certRepo.findByCertificateCode(code)
                .filter(Certificate::isActive);
    }

    private String generateCode() {
        String chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        StringBuilder sb = new StringBuilder("BF-");
        for (int i = 0; i < 8; i++) {
            sb.append(chars.charAt(random.nextInt(chars.length())));
        }
        return sb.toString();
    }
}
