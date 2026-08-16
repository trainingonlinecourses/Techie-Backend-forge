package com.demo.reactive.customer;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.server.RouterFunction;
import org.springframework.web.reactive.function.server.RouterFunctions;
import org.springframework.web.reactive.function.server.ServerResponse;

/**
 * The same CRUD exposed as functional endpoints — the two WebFlux styles side by side.
 */
@Configuration
public class CustomerRouter {

    @Bean
    public RouterFunction<ServerResponse> customerRoutes(CustomerHandler handler) {
        return RouterFunctions.route()
                .GET("/api/fn/customers", handler::all)
                .GET("/api/fn/customers/{id}", handler::byId)
                .POST("/api/fn/customers", handler::create)
                .build();
    }
}
