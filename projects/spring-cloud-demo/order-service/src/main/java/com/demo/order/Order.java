package com.demo.order;

import java.time.Instant;

public record Order(Long id, String sku, int quantity, String status, Instant createdAt) {

    public static Order of(Long id, String sku, int quantity) {
        return new Order(id, sku, quantity, "PLACED", Instant.now());
    }
}
