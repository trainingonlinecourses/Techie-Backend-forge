package com.demo.order;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;

/**
 * Declarative HTTP client. "inventory-service" is resolved through Eureka and
 * load-balanced across instances. When the circuit breaker opens (or a call
 * fails/times out), the fallback bean answers instead.
 */
@FeignClient(name = "inventory-service", fallback = InventoryClientFallback.class)
public interface InventoryClient {

    @GetMapping("/api/inventory/{sku}")
    InventoryStock getStock(@PathVariable("sku") String sku,
                            @RequestParam(value = "fail", defaultValue = "false") boolean fail,
                            @RequestParam(value = "delayMs", defaultValue = "0") int delayMs);
}
