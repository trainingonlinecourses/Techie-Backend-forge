package com.example.payments.money;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {

    @Test
    void add_sums_amounts() {
        Money a = Money.of("10.50", "EUR");
        Money b = Money.of("4.25", "EUR");
        assertThat(a.add(b).amount()).isEqualByComparingTo(new BigDecimal("14.75"));
    }

    @Test
    void subtract_differences_amounts() {
        Money a = Money.of("10.00", "EUR");
        Money b = Money.of("4.25", "EUR");
        assertThat(a.subtract(b).amount()).isEqualByComparingTo(new BigDecimal("5.75"));
    }

    @Test
    void add_rejects_different_currencies() {
        Money a = Money.of("10", "EUR");
        Money b = Money.of("10", "USD");
        assertThatThrownBy(() -> a.add(b))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("currency mismatch");
    }

    @Test
    void keeps_two_decimal_places() {
        assertThat(Money.of("1.005", "EUR").amount())
                .isEqualByComparingTo(new BigDecimal("1.01"));   // HALF_UP rounding
    }

    @Test
    void detects_negative_amounts() {
        assertThat(Money.of("-1.00", "EUR").isNegative()).isTrue();
        assertThat(Money.of("1.00", "EUR").isNegative()).isFalse();
    }
}
