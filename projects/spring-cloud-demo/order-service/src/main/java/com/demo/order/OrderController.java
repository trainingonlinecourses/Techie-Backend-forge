package com.demo.order;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    private static final Logger log = LoggerFactory.getLogger(OrderController.class);

    private final InventoryClient inventory;

    public OrderController(InventoryClient inventory) {
        this.inventory = inventory;
    }

    private final List<Order> orders = List.of(
            Order.of(1L, "SKU-1001", 2),
            Order.of(2L, "SKU-1002", 5),
            Order.of(3L, "SKU-1003", 1));

    @GetMapping
    public List<Order> list() {
        return orders;
    }

    @GetMapping("/{id}")
    public Order find(@PathVariable Long id) {
        return orders.stream().filter(o -> o.id().equals(id)).findFirst().orElseThrow();
    }

    /**
     * Cross-service call with resilience. Pass fail=true or delayMs=2000 to
     * watch the time limiter, retries, circuit breaker and fallback in action.
     */
    @GetMapping("/{id}/stock")
    public Map<String, Object> stock(@PathVariable Long id,
                                     @RequestParam(defaultValue = "false") boolean fail,
                                     @RequestParam(defaultValue = "0") int delayMs) {
        Order order = find(id);
        log.info("checking stock for order {} sku={}", id, order.sku());
        InventoryStock stock = inventory.getStock(order.sku(), fail, delayMs);
        return Map.of(
                "orderId", id,
                "sku", order.sku(),
                "stock", stock.stock(),
                "status", stock.status(),
                "app", "order-service");
    }
}
