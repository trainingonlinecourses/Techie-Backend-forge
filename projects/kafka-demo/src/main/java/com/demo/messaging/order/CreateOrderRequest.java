package com.demo.messaging.order;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

public record CreateOrderRequest(
        @NotBlank String customerId,
        @DecimalMin("0.01") BigDecimal amount) {}
