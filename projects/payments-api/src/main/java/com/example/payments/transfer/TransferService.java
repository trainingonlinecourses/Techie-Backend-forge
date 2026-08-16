package com.example.payments.transfer;

import com.example.payments.account.Account;
import com.example.payments.account.AccountNotFound;
import com.example.payments.account.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class TransferService {

    private final AccountRepository accounts;
    private final TransferRepository transfers;

    public TransferService(AccountRepository accounts, TransferRepository transfers) {
        this.accounts = accounts;
        this.transfers = transfers;
    }

    @Transactional
    public TransferView execute(String fromIban, String toIban, long cents, String idempotencyKey) {
        // Idempotency: a retried key must not double-execute
        if (transfers.existsByIdempotencyKey(idempotencyKey)) {
            throw new DuplicateTransferException(idempotencyKey);
        }
        if (fromIban.equals(toIban)) {
            throw new SelfTransferException();
        }

        Account from = accounts.findByIban(fromIban)
                .orElseThrow(() -> new AccountNotFound(fromIban));
        Account to = accounts.findByIban(toIban)
                .orElseThrow(() -> new AccountNotFound(toIban));

        // One transaction: both sides move, or neither does.
        from.debit(cents);     // throws InsufficientFundsException → full rollback
        to.credit(cents);
        accounts.save(from);
        accounts.save(to);

        Transfer transfer = transfers.save(
                new Transfer(fromIban, toIban, cents, from.getCurrency(), idempotencyKey));
        return TransferView.from(transfer);
    }

    @Transactional(readOnly = true)
    public List<TransferView> history(String iban) {
        return transfers.findByFromIbanOrToIbanOrderByCreatedAtDesc(iban, iban).stream()
                .map(TransferView::from)
                .toList();
    }
}
