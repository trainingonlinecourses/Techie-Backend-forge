package com.demo.gateway;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class FallbackController {

    @GetMapping("/fallback/orders")
    public Map<String, String> ordersFallback() {
        return Map.of(
                "status", "TEMPORARILY_UNAVAILABLE",
                "message", "Orders service is busy right now — the gateway circuit breaker is open.");
    }
}
