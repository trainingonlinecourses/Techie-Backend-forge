# Payments API — Capstone Project

A complete, runnable **layered payments API** built with everything taught in this academy:
Spring Boot, Spring Data JPA, Spring Security with JWT, validation, uniform error handling,
unit + integration tests, and a Docker image.

## Run it

```bash
mvn spring-boot:run        # starts on http://localhost:8081
# or
mvn clean package && java -jar target/payments-api-0.0.1-SNAPSHOT.jar
```

## Try it

```bash
# 1. Register a user
curl -X POST localhost:8081/api/auth/register \
     -H 'Content-Type: application/json' \
     -d '{"username":"ada","password":"password123","displayName":"Ada"}'

# 2. Login → capture the token
curl -X POST localhost:8081/api/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"username":"ada","password":"password123"}'

# 3. Create two accounts
curl -X POST localhost:8081/api/accounts -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"iban":"DE89370400440532013000","currency":"EUR","owner":"ada"}'
curl -X POST localhost:8081/api/accounts -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"iban":"GB29NWBK60161331926819","currency":"EUR","owner":"ada"}'

# 4. Transfer money (idempotency key prevents double-execution)
curl -X POST localhost:8081/api/transfers -H "Authorization: Bearer $TOKEN" \
     -H 'Content-Type: application/json' \
     -d '{"fromIban":"DE89370400440532013000","toIban":"GB29NWBK60161331926819","amountCents":500,"idempotencyKey":"tx-1"}'

# 5. Check balances / history
curl localhost:8081/api/accounts -H "Authorization: Bearer $TOKEN"
curl "localhost:8081/api/transfers?iban=DE89370400440532013000" -H "Authorization: Bearer $TOKEN"

# 6. Without a token → clean JSON 401
curl -i localhost:8081/api/accounts
```

## Tests

```bash
mvn verify        # unit (Money, TransferService) + integration (MockMvc, JWT)
```

## Docker

```bash
docker build -t payments-api .
docker run -p 8081:8081 -e APP_JWT_SECRET=prod-secret-change-me payments-api
```

## Layout

```
src/main/java/com/example/payments/
├── PaymentsApplication.java
├── config/          SecurityConfig, AppProperties
├── security/        JwtService, JwtAuthFilter, UserPrincipal, entry points
├── auth/            AuthController, AuthService
├── account/         Account entity + controller + service (domain exceptions)
├── transfer/        Transfer entity + controller + service (atomic, idempotent)
├── common/          ApiError, GlobalExceptionHandler
└── money/           Money — BigDecimal value object (never double)
```

The full walkthrough lives in the academy's **Capstone** module (see the `backend` app's
`/api/content/lessons/capstone/*`).
