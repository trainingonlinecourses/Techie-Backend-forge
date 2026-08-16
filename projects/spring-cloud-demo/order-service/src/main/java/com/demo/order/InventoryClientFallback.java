package com.demo.order;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Fallback used when the circuit breaker is open, the call times out, or
 * inventory-service is unreachable. Returns a safe default — the caller never
 * sees a 500 from the dependency.
 */
@Component
public class InventoryClientFallback implements InventoryClient {

    private static final Logger log = LoggerFactory.getLogger(InventoryClientFallback.class);

    @Override
    public InventoryStock getStock(String sku, boolean fail, int delayMs) {
        log.warn("inventory fallback for sku={} — circuit open or dependency unavailable", sku);
        return new InventoryStock(sku, 0, "UNAVAILABLE");
    }
}
