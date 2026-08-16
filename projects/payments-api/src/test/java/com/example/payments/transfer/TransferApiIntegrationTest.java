package com.example.payments.transfer;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class TransferApiIntegrationTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    /** The Spring context (and H2) is cached across methods — unique names prevent collisions. */
    private final String suffix = String.format("%08d", System.nanoTime() % 100_000_000);
    private final String username = "testuser" + suffix;
    private final String ibanA = "DE" + suffix;
    private final String ibanB = "GB" + suffix;
    private final String key1 = "k-" + suffix;
    private final String key2 = "same-" + suffix;

    private String token;

    @BeforeEach
    void registerAndLogin() throws Exception {
        register(username, "password123", "Test User");
        token = login(username, "password123");
        createAccount(ibanA, 10_000);   // fund the source account
        createAccount(ibanB, 0);
    }

    @Test
    void transfer_moves_money_atomically() throws Exception {
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fromIban":"%s","toIban":"%s",
                                 "amountCents":500,"idempotencyKey":"%s"}
                                """.formatted(ibanA, ibanB, key1)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.amountCents").value(500));

        mockMvc.perform(get("/api/accounts/" + ibanA)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balanceCents").value(9500));   // 10000 - 500

        mockMvc.perform(get("/api/accounts/" + ibanB)
                        .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.balanceCents").value(500));
    }

    @Test
    void same_idempotency_key_is_rejected_with_409() throws Exception {
        String body = """
                {"fromIban":"%s","toIban":"%s",
                 "amountCents":100,"idempotencyKey":"%s"}
                """.formatted(ibanA, ibanB, key2);
        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/transfers")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void unauthenticated_request_gets_401_json() throws Exception {
        mockMvc.perform(get("/api/accounts"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Unauthorized"));
    }

    private void register(String username, String password, String displayName) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"%s","password":"%s","displayName":"%s"}
                                """.formatted(username, password, displayName)))
                .andExpect(status().isOk());
    }

    private String login(String username, String password) throws Exception {
        String body = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"%s\",\"password\":\"%s\"}"
                                .formatted(username, password)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("token").asText();
    }

    private void createAccount(String iban, long openingBalanceCents) throws Exception {
        mockMvc.perform(post("/api/accounts")
                        .header("Authorization", "Bearer " + token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"iban":"%s","currency":"EUR","owner":"test",
                                 "openingBalanceCents":%d}
                                """.formatted(iban, openingBalanceCents)))
                .andExpect(status().isCreated());
    }
}
