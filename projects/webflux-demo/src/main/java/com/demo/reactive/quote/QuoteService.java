package com.demo.reactive.quote;

import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.time.Duration;

/**
 * An infinite reactive stream — the source for the SSE endpoint. Consumers apply
 * backpressure naturally (take(n), WebTestClient, etc.).
 */
@Service
public class QuoteService {

    public Flux<Quote> stream() {
        return Flux.interval(Duration.ofMillis(200))
                .map(i -> new Quote("quote-" + i));
    }
}
