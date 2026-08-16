package com.demo.reactive;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring WebFlux demo — a fully reactive REST API:
 *
 * <ul>
 *   <li>Annotation controller + functional RouterFunction endpoints over R2DBC ({@code /api/customers})</li>
 *   <li>Server-sent events stream ({@code /api/quotes/stream})</li>
 *   <li>WebClient aggregator calling this app's own API ({@code /api/summary})</li>
 * </ul>
 *
 * Run: {@code mvn spring-boot:run} (port 9096, no Kafka/DB server needed — H2 in-memory).
 */
@SpringBootApplication
public class WebfluxDemoApplication {

    public static void main(String[] args) {
        SpringApplication.run(WebfluxDemoApplication.class, args);
    }
}
