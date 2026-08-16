package com.example.payments.transfer;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateTransferRequest(
        @NotBlank String fromIban,
        @NotBlank String toIban,
        @NotNull @Min(1) Long amountCents,
        @NotBlank String idempotencyKey) {}
