package com.example.payments.transfer;

public class SelfTransferException extends RuntimeException {

    public SelfTransferException() {
        super("source and destination accounts must differ");
    }
}
