package com.example.payments.account;

public class AccountAlreadyExists extends RuntimeException {

    public AccountAlreadyExists(String iban) {
        super("account already exists: " + iban);
    }
}
