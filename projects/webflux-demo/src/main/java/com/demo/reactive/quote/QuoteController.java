package com.demo.reactive.quote;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

@RestController
@RequestMapping("/api")
public class QuoteController {

    private final QuoteService quotes;

    public QuoteController(QuoteService quotes) {
        this.quotes = quotes;
    }

    /** Server-Sent Events: curl -N localhost:9096/api/quotes/stream */
    @GetMapping(value = "/quotes/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<Quote> stream() {
        return quotes.stream();
    }
}
