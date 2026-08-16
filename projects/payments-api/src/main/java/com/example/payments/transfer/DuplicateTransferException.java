package com.example.payments.transfer;

public class DuplicateTransferException extends RuntimeException {

    public DuplicateTransferException(String idempotencyKey) {
        super("a transfer with idempotency key " + idempotencyKey + " already exists");
    }
}
