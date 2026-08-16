package com.demo.reactive;

import com.demo.reactive.customer.Customer;
import com.demo.reactive.customer.CustomerRepository;
import com.demo.reactive.quote.Quote;
import com.demo.reactive.quote.QuoteService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.reactive.AutoConfigureWebTestClient;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.reactive.server.WebTestClient;
import reactor.test.StepVerifier;

import java.time.Duration;

/**
 * Full-context reactive tests: WebTestClient against the running Netty server
 * (annotation + functional endpoints, WebClient aggregation, SSE) and
 * StepVerifier for the stream logic.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureWebTestClient
class WebfluxDemoTest {

    @Autowired WebTestClient client;
    @Autowired CustomerRepository repo;
    @Autowired QuoteService quotes;

    @BeforeEach
    void clear() {
        repo.deleteAll().block();
    }

    @Test
    void create_and_list_customers() {
        client.post().uri("/api/customers")
                .bodyValue(new Customer("Ada Lovelace", "ada@example.com"))
                .exchange()
                .expectStatus().isCreated();

        client.get().uri("/api/customers")
                .exchange()
                .expectStatus().isOk()
                .expectBodyList(Customer.class)
                .hasSize(1)
                .consumeWith(r -> {
                    Customer c = r.getResponseBody().get(0);
                    assert c.getEmail().equals("ada@example.com");
                });
    }

    @Test
    void missing_customer_is_404() {
        client.get().uri("/api/customers/999")
                .exchange()
                .expectStatus().isNotFound();
    }

    @Test
    void functional_routes_work_too() {
        client.post().uri("/api/fn/customers")
                .bodyValue(new Customer("Grace Hopper", "grace@example.com"))
                .exchange()
                .expectStatus().isCreated();

        client.get().uri("/api/fn/customers")
                .exchange()
                .expectStatus().isOk()
                .expectBodyList(Customer.class)
                .hasSize(1);
    }

    @Test
    void webclient_summary_aggregates() {
        client.post().uri("/api/customers")
                .bodyValue(new Customer("Ada", "ada@example.com"))
                .exchange()
                .expectStatus().isCreated();

        client.get().uri("/api/summary")
                .exchange()
                .expectStatus().isOk()
                .expectBody()
                .jsonPath("$.count").isEqualTo(1);
    }

    @Test
    void quote_stream_emits_sse() {
        StepVerifier.create(client.get().uri("/api/quotes/stream")
                        .accept(MediaType.TEXT_EVENT_STREAM)
                        .exchange()
                        .expectStatus().isOk()
                        .returnResult(Quote.class)
                        .getResponseBody()
                        .take(3))
                .expectNextCount(3)
                .verifyComplete();
    }

    @Test
    void quote_service_respects_backpressure() {
        StepVerifier.create(quotes.stream().take(5))
                .expectNextCount(5)
                .verifyComplete();
    }
}
