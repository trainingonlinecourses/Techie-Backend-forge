package com.example.payments.transfer;

import com.example.payments.account.Account;
import com.example.payments.account.AccountNotFound;
import com.example.payments.account.AccountRepository;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TransferServiceTest {

    private final AccountRepository accounts = mock(AccountRepository.class);
    private final TransferRepository transfers = mock(TransferRepository.class);
    private final TransferService service = new TransferService(accounts, transfers);

    @Test
    void insufficient_funds_throws_and_saves_nothing() {
        when(accounts.findByIban("iban-a"))
                .thenReturn(Optional.of(new Account("iban-a", "EUR", "alice")));
        when(accounts.findByIban("iban-b"))
                .thenReturn(Optional.of(new Account("iban-b", "EUR", "bob")));

        assertThatThrownBy(() -> service.execute("iban-a", "iban-b", 100, "key-1"))
                .isInstanceOf(InsufficientFundsException.class);

        verify(transfers, never()).save(any());
    }

    @Test
    void self_transfer_is_rejected() {
        assertThatThrownBy(() -> service.execute("iban-a", "iban-a", 100, "key-1"))
                .isInstanceOf(SelfTransferException.class);
    }

    @Test
    void duplicate_idempotency_key_is_rejected() {
        when(transfers.existsByIdempotencyKey("key-1")).thenReturn(true);

        assertThatThrownBy(() -> service.execute("iban-a", "iban-b", 100, "key-1"))
                .isInstanceOf(DuplicateTransferException.class);
    }

    @Test
    void unknown_account_is_rejected() {
        when(accounts.findByIban("iban-missing")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.execute("iban-missing", "iban-b", 100, "key-1"))
                .isInstanceOf(AccountNotFound.class);
    }
}
