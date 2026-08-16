package com.example.payments.transfer;

import java.time.Instant;

public record TransferView(Long id, String fromIban, String toIban, long amountCents,
                           String currency, Instant createdAt, String idempotencyKey) {

    public static TransferView from(Transfer t) {
        return new TransferView(t.id(), t.getFromIban(), t.getToIban(), t.getAmountCents(),
                t.getCurrency(), t.getCreatedAt(), t.getIdempotencyKey());
    }
}
