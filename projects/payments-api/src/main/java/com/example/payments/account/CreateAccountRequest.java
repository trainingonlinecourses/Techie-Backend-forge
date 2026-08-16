package com.example.payments.account;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record CreateAccountRequest(
        @NotBlank
        @Pattern(regexp = "[A-Z]{2}[0-9A-Z]{8,32}", message = "invalid IBAN")
        String iban,

        @NotBlank
        @Pattern(regexp = "[A-Z]{3}", message = "invalid currency")
        String currency,

        @NotBlank
        String owner,

        @Min(0)
        Long openingBalanceCents) {

    public long openingBalance() {
        return openingBalanceCents == null ? 0 : openingBalanceCents;
    }
}
