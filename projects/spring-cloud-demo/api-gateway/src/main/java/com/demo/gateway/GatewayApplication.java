package com.demo.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * The single entry point: routes /api/orders/** and /api/inventory/** to the
 * services by name (lb:// resolved via Eureka), with a circuit breaker and
 * trace-id logging at the edge.
 */
@SpringBootApplication
public class GatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
