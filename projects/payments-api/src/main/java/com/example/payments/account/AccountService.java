package com.example.payments.account;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AccountService {

    private final AccountRepository accounts;

    public AccountService(AccountRepository accounts) {
        this.accounts = accounts;
    }

    @Transactional(readOnly = true)
    public List<AccountView> listAll() {
        return accounts.findAllByOrderByCreatedAtAsc().stream()
                .map(AccountView::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public AccountView findByIban(String iban) {
        return AccountView.from(require(iban));
    }

    @Transactional
    public AccountView create(CreateAccountRequest request) {
        if (accounts.existsByIban(request.iban())) {
            throw new AccountAlreadyExists(request.iban());
        }
        Account account = new Account(request.iban(), request.currency(), request.owner());
        if (request.openingBalance() > 0) {
            account.credit(request.openingBalance());   // open with funds (e.g. initial deposit)
        }
        return AccountView.from(accounts.save(account));
    }

    Account require(String iban) {
        return accounts.findByIban(iban)
                .orElseThrow(() -> new AccountNotFound(iban));
    }
}
