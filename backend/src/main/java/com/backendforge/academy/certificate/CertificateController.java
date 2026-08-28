package com.backendforge.academy.certificate;

import com.backendforge.academy.security.UserPrincipal;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/certificates")
public class CertificateController {

    private final CertificateService certService;

    public CertificateController(CertificateService certService) {
        this.certService = certService;
    }

    /** Check eligibility and get certificate status. */
    @GetMapping("/status")
    public CertificateStatusDto getStatus(@AuthenticationPrincipal UserPrincipal principal) {
        boolean eligible = certService.isEligible(principal.user().getId());
        int percentage = certService.getCompletionPercentage(principal.user().getId());
        List<Certificate> certs = certService.getUserCertificates(principal.user().getId());

        return new CertificateStatusDto(
                eligible,
                percentage,
                80, // required percentage
                certs.stream().map(this::toDto).toList()
        );
    }

    /** Generate certificate (if eligible). */
    @PostMapping("/generate")
    public ResponseEntity<?> generate(@AuthenticationPrincipal UserPrincipal principal) {
        return certService.generateCertificate(principal.user())
                .map(cert -> ResponseEntity.ok((Object) toDto(cert)))
                .orElse(ResponseEntity.badRequest().body(
                        Map.of("error", "Not eligible. Complete at least 80% of lessons.")));
    }

    /** Get user's certificates. */
    @GetMapping
    public List<CertificateDto> getCertificates(@AuthenticationPrincipal UserPrincipal principal) {
        return certService.getUserCertificates(principal.user().getId()).stream()
                .map(this::toDto)
                .toList();
    }

    /** Verify a certificate (public). */
    @GetMapping("/verify/{code}")
    public ResponseEntity<?> verify(@PathVariable String code) {
        return certService.verifyCertificate(code)
                .map(cert -> ResponseEntity.ok((Object) new VerifyResponse(
                        true,
                        cert.getUserName(),
                        cert.getCourseTitle(),
                        cert.getIssuedAt().toString(),
                        cert.getCertificateCode(),
                        cert.getCompletedLessons(),
                        cert.getTotalLessons()
                )))
                .orElse(ResponseEntity.ok(new VerifyResponse(false, null, null, null, null, 0, 0)));
    }

    private CertificateDto toDto(Certificate cert) {
        return new CertificateDto(
                cert.getId(),
                cert.getCertificateCode(),
                cert.getUserName(),
                cert.getCourseTitle(),
                cert.getCompletedLessons(),
                cert.getTotalLessons(),
                cert.getQuizzesPassed(),
                cert.getIssuedAt().toString()
        );
    }

    // DTOs
    public record CertificateStatusDto(boolean eligible, int completionPercentage,
                                        int requiredPercentage, List<CertificateDto> certificates) {}

    public record CertificateDto(Long id, String code, String userName, String courseTitle,
                                  int completedLessons, int totalLessons, int quizzesPassed,
                                  String issuedAt) {}

    public record VerifyResponse(boolean valid, String userName, String courseTitle,
                                  String issuedAt, String code, int completedLessons, int totalLessons) {}
}
