package com.example.payments.account;

import java.time.Instant;

public record AccountView(Long id, String iban, String currency, long balanceCents, String owner,
                          Instant createdAt) {

    public static AccountView from(Account a) {
        return new AccountView(a.getId(), a.getIban(), a.getCurrency(), a.getBalanceCents(),
                a.getOwner(), a.getCreatedAt());
    }
}
