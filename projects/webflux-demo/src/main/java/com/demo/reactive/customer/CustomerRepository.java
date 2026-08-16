package com.demo.reactive.customer;

import org.springframework.data.repository.reactive.ReactiveCrudRepository;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

/**
 * Reactive data access — every method returns a publisher and never blocks.
 */
public interface CustomerRepository extends ReactiveCrudRepository<Customer, Long> {

    Flux<Customer> findByEmailContaining(String email);

    Mono<Customer> findByEmail(String email);
}
