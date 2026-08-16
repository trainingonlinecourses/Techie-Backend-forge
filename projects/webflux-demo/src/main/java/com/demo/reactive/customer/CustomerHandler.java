package com.demo.reactive.customer;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.server.ServerRequest;
import org.springframework.web.reactive.function.server.ServerResponse;
import reactor.core.publisher.Mono;

/**
 * Handler functions for the functional (RouterFunction) endpoints.
 */
@Component
public class CustomerHandler {

    private final CustomerRepository repo;

    public CustomerHandler(CustomerRepository repo) {
        this.repo = repo;
    }

    public Mono<ServerResponse> all(ServerRequest req) {
        return ServerResponse.ok().body(repo.findAll(), Customer.class);
    }

    public Mono<ServerResponse> byId(ServerRequest req) {
        return repo.findById(Long.valueOf(req.pathVariable("id")))
                .flatMap(c -> ServerResponse.ok().bodyValue(c))
                .switchIfEmpty(ServerResponse.notFound().build());
    }

    public Mono<ServerResponse> create(ServerRequest req) {
        return req.bodyToMono(Customer.class)
                .flatMap(c -> ServerResponse.status(HttpStatus.CREATED).body(repo.save(c), Customer.class));
    }
}
