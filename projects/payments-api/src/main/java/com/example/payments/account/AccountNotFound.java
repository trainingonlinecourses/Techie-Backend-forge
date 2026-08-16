package com.example.payments.account;

public class AccountNotFound extends RuntimeException {

    public AccountNotFound(String iban) {
        super("account not found: " + iban);
    }
}
