package com.example.payments.money;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Currency;

/** Immutable money value object — the only way money moves in this app. */
public final class Money {

    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        this.amount = amount.setScale(2, RoundingMode.HALF_UP);
        this.currency = currency;
    }

    public static Money of(String amount, String currency) {
        return new Money(new BigDecimal(amount), Currency.getInstance(currency));
    }

    public Money add(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money subtract(Money other) {
        requireSameCurrency(other);
        return new Money(amount.subtract(other.amount), currency);
    }

    public boolean isNegative() {
        return amount.signum() < 0;
    }

    private void requireSameCurrency(Money other) {
        if (!currency.equals(other.currency))
            throw new IllegalArgumentException(
                    "currency mismatch: " + currency + " vs " + other.currency);
    }

    public BigDecimal amount() { return amount; }
    public String currencyCode() { return currency.getCurrencyCode(); }
}
