package com.demo.reactive.summary;

import com.demo.reactive.customer.Customer;
import org.springframework.core.env.Environment;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.Map;

/**
 * Uses WebClient to call this app's own /api/customers endpoint — a non-blocking
 * aggregation demo. The target is resolved from the incoming request (scheme +
 * host:port), falling back to the actual server port for in-process clients that
 * send relative URIs (e.g. WebTestClient in tests).
 */
@RestController
@RequestMapping("/api")
public class SummaryController {

    private final WebClient.Builder webClientBuilder;
    private final Environment env;

    public SummaryController(WebClient.Builder webClientBuilder, Environment env) {
        this.webClientBuilder = webClientBuilder;
        this.env = env;
    }

    @GetMapping("/summary")
    public Mono<Map<String, Object>> summary(ServerHttpRequest request) {
        String scheme = request.getURI().getScheme();
        String authority = request.getURI().getAuthority();
        if (authority == null) {                       // in-process client: no host in URI
            scheme = "http";
            authority = "localhost:" + env.getProperty("local.server.port", "9096");
        }
        String origin = scheme + "://" + authority;
        return webClientBuilder
                .baseUrl(origin)
                .build()
                .get()
                .uri("/api/customers")
                .retrieve()
                .bodyToFlux(Customer.class)
                .collectList()
                .map(customers -> Map.of(
                        "count", customers.size(),
                        "customers", customers));
    }
}
