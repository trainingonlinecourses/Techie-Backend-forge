package com.example.payments.account;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AccountRepository extends JpaRepository<Account, Long> {

    Optional<Account> findByIban(String iban);

    List<Account> findAllByOrderByCreatedAtAsc();

    boolean existsByIban(String iban);
}
