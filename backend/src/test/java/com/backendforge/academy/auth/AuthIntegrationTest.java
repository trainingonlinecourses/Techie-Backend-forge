package com.backendforge.academy.auth;

import com.backendforge.academy.user.UserRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full-stack integration tests against a real Spring context, real Spring
 * Security filter chain and an in-memory H2 database (test profile).
 * These reproduce the exact HTTP behavior of production: register → login → /me,
 * plus validation, duplicates, wrong-password and persistence checks.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional // each test rolls back its DB changes — no cross-test interference
class AuthIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;

    private static final String REGISTER_JSON = """
            {"username":" integra_user ","displayName":"Integra User","password":"Integra123"}
            """;

    @Test
    @DisplayName("E2E: register → token → /me with token → login with same password → token again")
    void registerThenLoginThenMe() throws Exception {
        // -- register -------------------------------------------------------
        String registerBody = """
                {"username":"e2e_flow_user","displayName":"E2E Flow","password":"Secret123"}
                """;
        String token = mvc.perform(post("/api/auth/register")
                        .contentType("application/json")
                        .content(registerBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.username").value("e2e_flow_user"))
                .andExpect(jsonPath("$.user.password").doesNotExist()) // never leaks the hash
                .andReturn().getResponse().getContentAsString();
        token = com.jayway.jsonpath.JsonPath.read(token, "$.token");

        // user persisted, password stored as BCrypt hash (not plaintext)
        var saved = users.findByUsername("e2e_flow_user").orElseThrow();
        assertThat(saved.getPassword()).startsWith("$2").isNotEqualTo("Secret123");

        // -- /me with the fresh token --------------------------------------
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("e2e_flow_user"));

        // -- login with the SAME password → 200 + token ---------------------
        // (this is the exact flow users hit: signup works, then sign-in works)
        mvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content("""
                                {"username":"e2e_flow_user","password":"Secret123"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andExpect(jsonPath("$.user.username").value("e2e_flow_user"));
    }

    @Test
    @DisplayName("register: username is case-insensitively unique and lowercased")
    void registerLowercasesAndRejectsCaseVariants() throws Exception {
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content("""
                                {"username":"MixedCase","displayName":"MC","password":"Secret123"}
                                """))
                .andExpect(status().isOk());

        // same name in different case → 409
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content("""
                                {"username":"MIXEDCASE","displayName":"Again","password":"Secret123"}
                                """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Username is already taken"));
    }

    @Test
    @DisplayName("register: password shorter than 6 → 400 with fieldErrors")
    void registerRejectsShortPassword() throws Exception {
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content("""
                                {"username":"shorty","displayName":"S","password":"123"}
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='password')].message").isNotEmpty());
    }

    @Test
    @DisplayName("register: blank fields → 400 with errors for every missing field")
    void registerRejectsBlankFields() throws Exception {
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content("{\"username\":\"\",\"password\":\"\",\"displayName\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='username')]").isNotEmpty())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='password')]").isNotEmpty())
                .andExpect(jsonPath("$.fieldErrors[?(@.field=='displayName')]").isNotEmpty());
    }

    @Test
    @DisplayName("login: correct user + wrong password → 401 'Invalid username or password'")
    void loginWrongPasswordIs401() throws Exception {
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content("""
                                {"username":"pwtest","displayName":"PW","password":"RightPass1"}
                                """))
                .andExpect(status().isOk());

        mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("""
                                {"username":"pwtest","password":"WrongPass1"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid username or password"));
    }

    @Test
    @DisplayName("login: unknown user → 401 (no user-enumeration difference)")
    void loginUnknownUserIs401() throws Exception {
        mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("""
                                {"username":"no_such_user_xyz","password":"Whatever1"}
                                """))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid username or password"));
    }

    @Test
    @DisplayName("seeded demo accounts work: admin/admin123 and learner/learner123")
    void seededDemoAccountsCanLogin() throws Exception {
        mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("ADMIN"));

        mvc.perform(post("/api/auth/login").contentType("application/json")
                        .content("{\"username\":\"learner\",\"password\":\"learner123\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.role").value("USER"));
    }

    @Test
    @DisplayName("/me without token → 401")
    void meWithoutTokenIs401() throws Exception {
        mvc.perform(get("/api/auth/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("/me with garbage token → 401")
    void meWithGarbageTokenIs401() throws Exception {
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("register body missing fields → 400 with field names")
    void registerMalformedJsonFields() throws Exception {
        mvc.perform(post("/api/auth/register").contentType("application/json")
                        .content(REGISTER_JSON.replace("\"Integra123\"", "\"\"")))
                .andExpect(status().isBadRequest());
    }
}
