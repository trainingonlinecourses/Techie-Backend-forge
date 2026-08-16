package com.example.payments.transfer;

public class InsufficientFundsException extends RuntimeException {

    public InsufficientFundsException(String iban) {
        super("insufficient funds on account " + iban);
    }
}
