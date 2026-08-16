package com.example.payments.transfer;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TransferRepository extends JpaRepository<Transfer, Long> {

    boolean existsByIdempotencyKey(String idempotencyKey);

    List<Transfer> findByFromIbanOrToIbanOrderByCreatedAtDesc(String fromIban, String toIban);
}
