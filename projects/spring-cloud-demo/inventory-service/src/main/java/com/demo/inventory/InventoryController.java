package com.demo.inventory;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@RestController
@RequestMapping("/api/inventory")
public class InventoryController {

    private static final Logger log = LoggerFactory.getLogger(InventoryController.class);

    private final Map<String, Integer> stock = new ConcurrentHashMap<>(Map.of(
            "SKU-1001", 42,
            "SKU-1002", 7,
            "SKU-1003", 0));

    @GetMapping("/{sku}")
    public ResponseEntity<InventoryStock> stock(@PathVariable String sku,
                                                @RequestParam(defaultValue = "false") boolean fail,
                                                @RequestParam(defaultValue = "0") int delayMs) throws InterruptedException {
        if (delayMs > 0) {
            log.info("simulating slow inventory response ({}ms) for {}", delayMs, sku);
            Thread.sleep(delayMs);                     // triggers the time limiter upstream
        }
        if (fail) {
            log.warn("simulating inventory failure for {}", sku);
            return ResponseEntity.status(500).body(new InventoryStock(sku, 0, "SIMULATED_FAILURE"));
        }
        log.info("inventory lookup sku={} stock={}", sku, stock.getOrDefault(sku, 0));
        return ResponseEntity.ok(new InventoryStock(sku, stock.getOrDefault(sku, 0), "OK"));
    }

    public record InventoryStock(String sku, int stock, String status) {}
}
