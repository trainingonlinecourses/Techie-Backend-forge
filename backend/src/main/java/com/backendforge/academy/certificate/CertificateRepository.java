package com.backendforge.academy.certificate;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface CertificateRepository extends JpaRepository<Certificate, Long> {
    Optional<Certificate> findByCertificateCode(String code);
    List<Certificate> findByUserId(Long userId);
    boolean existsByUserIdAndActiveTrue(Long userId);
}
