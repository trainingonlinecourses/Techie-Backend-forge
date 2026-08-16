package com.example.payments.transfer;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/transfers")
public class TransferController {

    private final TransferService transferService;

    public TransferController(TransferService transferService) {
        this.transferService = transferService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TransferView transfer(@Valid @RequestBody CreateTransferRequest request) {
        return transferService.execute(request.fromIban(), request.toIban(),
                request.amountCents(), request.idempotencyKey());
    }

    @GetMapping
    public List<TransferView> history(@RequestParam String iban) {
        return transferService.history(iban);
    }
}
