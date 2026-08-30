package com.backendforge.academy;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * BackendForge Academy — a full-stack Spring learning platform.
 *
 * <p>Run with: {@code mvn spring-boot:run} (from the backend/ directory).
 * The web UI (frontend/) talks to this API on port 8080.
 * All 675 lessons with proper summaries loaded.
 */
@SpringBootApplication
public class AcademyApplication {

    public static void main(String[] args) {
        SpringApplication.run(AcademyApplication.class, args);
    }
}
