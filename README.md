# BackendForge Academy — Java & Spring, End to End

A full-stack learning platform covering **Java → Spring Core → Spring Boot → Spring Security → Spring AI**
from an organizational point of view — with clear explanations, production-grade code, the official
docs from docs.spring.io, progress tracking, and an AI tutor backed by Spring AI.

It is **not** a static site. It is a real application:

- **Backend** — a Spring Boot 3.4 API (`backend/`) with JPA, JWT security, progress tracking,
  full-text-ish search, and a Spring AI chat service.
- **Frontend** — a professional React + Vite SPA (`frontend/`): curriculum tree, markdown lesson
  reader with syntax highlighting, search, official-docs index, AI tutor, login, and per-user progress.
- **Sample project** — `projects/payments-api/`: a complete, runnable payments API used by the
  Capstone module (layered architecture, JWT, atomic idempotent transfers, tests, Docker).

## What's inside

| Module | Lessons | Covers |
|---|---|---|
| 01 Java Foundations | 12 | JVM/bytecode, OOP, modern Java, collections, streams, concurrency, virtual threads |
| 02 Spring Core & Framework | 9 | IoC, DI, bean lifecycle, configuration, AOP/proxies, events, transactions, MVC |
| 03 Spring Boot | 9 | Auto-configuration, REST APIs, JPA, testing, Actuator, production readiness, async |
| 04 Spring Security | 9 | Authn vs Authz, filter chain, JWT, method security, OAuth2, CORS/CSRF, OWASP |
| 05 Spring AI | 8 | ChatClient, structured output, function calling, embeddings, RAG, advisors, eval |
| 06 Capstone: Payments API | 5 | Walkthrough of the real runnable project in `projects/payments-api` |
| 07 Spring Cloud & Microservices | 7 | Discovery (Eureka), config server, API gateway, Resilience4j, distributed tracing, production patterns — runnable demo in `projects/spring-cloud-demo` |
| 08 Spring Kafka & Messaging | 7 | Event-driven architecture, producers/listeners, consumer groups, transactional outbox, retries & DLQs, testing, production — runnable demo in `projects/kafka-demo` |
| 09 Spring WebFlux & Reactive | 7 | Reactive programming, Mono/Flux, WebFlux controllers & functional routes, WebClient, R2DBC, reactive testing, production — runnable demo in `projects/webflux-demo` |

Every lesson includes: explanation, runnable code, an *"Why it matters (organizational view)"* callout,
and links to the authoritative reference on docs.spring.io. The **Docs index** page organizes
69 official links (Framework, Boot, Security, AI, Cloud, Kafka, WebFlux, Data, Java, OWASP, Maven/Gradle).

## Run it

Requirements: **Java 21**, **Maven 3.9+**, **Node 20+**.

### 1. Start the backend (port 8080)

```bash
cd backend
mvn spring-boot:run
# or: mvn package && java -jar target/academy-api-1.0.0.jar
```

Health check: http://localhost:8080/actuator/health · H2 console: http://localhost:8080/h2-console

### 2. Start the frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api` to the backend.

### 3. Demo accounts

| Username | Password | Role |
|---|---|---|
| `admin` | `admin123` | ADMIN |
| `learner` | `learner123` | USER |

You can also register your own account.

### 4. The AI tutor — works with zero keys

The tutor uses **Spring AI's `ChatClient`** with retrieval-augmented context and a lesson-lookup
`@Tool`. It picks the best provider automatically, in this order — **no setup required**:

1. **OpenAI** — if `OPENAI_API_KEY` is set.
2. **Custom endpoint** — `APP_OPENAI_BASE_URL` (any OpenAI-compatible server, base URL without `/v1`).
3. **Ollama (local, free, no key)** — auto-detected on `localhost:11434` if it's running
   (`ollama pull qwen2.5:7b` once, then restart the backend).
4. **Free Hugging Face endpoint** — a keyless Space used by default
   (`APP_USE_FREE_ENDPOINT=false` to disable).
5. **Local knowledge assistant** — deterministic answers from the lessons, used only if
   everything above is unreachable.

```bash
# Example: explicit key (OpenAI)
OPENAI_API_KEY=sk-... mvn spring-boot:run

# Example: your own keyless endpoint (base URL without the /v1 suffix)
APP_OPENAI_BASE_URL=http://localhost:11434 APP_OPENAI_MODEL=qwen2.5:7b mvn spring-boot:run
```

## The capstone project (runnable)

```bash
cd projects/payments-api
mvn spring-boot:run          # port 8081
mvn test                     # 12 tests: Money, TransferService, API integration
docker build -t payments-api .
```

See `projects/payments-api/README.md` for the full API walkthrough (register → login → create
accounts → transfer with idempotency keys).

## The WebFlux demo (runnable)

```bash
cd projects/webflux-demo
mvn spring-boot:run        # port 9096, H2 in-memory — nothing else to start
# POST/GET /api/customers (annotation controller), /api/fn/customers (RouterFunction),
# /api/summary (WebClient aggregation), curl -N /api/quotes/stream (SSE)
mvn test                   # 6 reactive tests (WebTestClient + StepVerifier)
```

## The Kafka demo (runnable)

```bash
cd projects/kafka-demo
docker compose up -d          # Kafka on :9092, Kafka UI on :8085
mvn spring-boot:run           # app on :9095
# POST /api/orders → outbox row → relay publishes OrderCreated → consumer processes it
# POST /api/notifications with "fail" in the message → retries → DLT
mvn test                      # 3 embedded-broker tests (outbox flow + retry/DLT)
```

## The Spring Cloud demo (runnable)

```bash
cd projects/spring-cloud-demo
# 5 services: eureka :8761, config :8888, order :9001, inventory :9002, gateway :9090
# run each with `mvn spring-boot:run` — see projects/spring-cloud-demo/README.md
```

## Architecture

```
frontend (React + Vite, :5173)
   │  /api/*  (proxied)
   ▼
backend (Spring Boot 3.4, :8080)
   ├── SecurityConfig ─ JwtAuthFilter ─ JwtService (Nimbus, HS256)
   ├── AuthController / AuthService        (register, login, me)
   ├── ContentController / ContentService  (modules, lessons, curriculum, search, docs index)
   ├── ProgressController / ProgressService (per-user lesson completion)
   ├── ChatController ─ AiChatService       (Spring AI ChatClient + RAG, or local fallback)
   ├── JPA: User, Module, Lesson, ProgressEntry, ChatMessage (H2 file DB)
   └── Actuator: /actuator/health
```

Security model: stateless JWT — public content browsing, authenticated chat/progress, roles in
claims, JSON 401/403 via `AuthenticationEntryPoint`/`AccessDeniedHandler`.

## Project layout

```
├── backend/                  Spring Boot API (the platform itself)
│   └── src/main/resources/content/
│       ├── modules.json      curriculum metadata
│       ├── docs-index.json   curated docs.spring.io index
│       └── lessons/<module>/ 52 markdown lessons (loaded + searched at runtime)
├── frontend/                 React SPA
└── projects/payments-api/    Capstone: complete runnable payments API
```

The old single-file `index.html` is kept in the repo root as an archive of the original design.

## Deployment

The SPA deploys to Vercel (static, auto-deploys on push to `main`). Vercel cannot run the Spring
Boot API, so the backend is hosted separately. The repo ships with `render.yaml` (Render Blueprint)
and `railway.toml` so the backend is one-click deployable on the free tier.

### 1. Deploy the backend — Render (free, recommended)

1. Push this repo to GitHub.
2. In the Render dashboard: **New + → Blueprint** → connect the repo.
3. Render reads `render.yaml` at the repo root and provisions **two** resources on the free plan:
   - `backendforge-academy-api-bef2` — the web service (builds `backend/Dockerfile`, Java 21).
     The name sets the public URL (`https://<name>.onrender.com`); if Render appends a suffix
     because the name was taken, update `VITE_API_URL` below to the actual URL.
   - `backendforge-academy-db` — a Postgres database whose connection string is injected as
     `DATABASE_URL`.
   It also generates a random `APP_JWT_SECRET` and sets `APP_CORS_ORIGINS` to
   `https://techie-backend-forge.vercel.app`.
4. When the deploy finishes, the API is at `https://backendforge-academy-api-bef2.onrender.com`.
   Verify it:

   ```bash
   curl https://backendforge-academy-api-bef2.onrender.com/actuator/health   # → {"status":"UP"}
   ```

Free-tier notes: the web instance sleeps after ~15 min idle (the first request takes ~1 min to
wake), and Render's free Postgres **expires after 30 days** — upgrade it to the Starter plan for a
permanent database. Demo accounts (`admin`/`admin123`, `learner`/`learner123`) are seeded at
startup only if they don't exist yet, so your own users are never touched.

### Alternative: Railway

1. Create a project on railway.com and connect this repo. It reads `railway.toml`, which sets the
   root directory to `backend/` (its Dockerfile) — `PORT` is injected automatically.
2. Add a **PostgreSQL** plugin to the project — Railway injects `DATABASE_URL` automatically.
3. In the project's **Variables** tab add:
   - `APP_CORS_ORIGINS=https://techie-backend-forge.vercel.app`
   - `APP_JWT_SECRET=<random string ≥ 32 chars>`

### Database (H2 locally, Postgres in production)

- **Local dev:** zero setup — the app uses an H2 file database (`backend/data/academy`).
- **Production:** when `DATABASE_URL` is set (Render/Railway Postgres), the app builds its JDBC
  DataSource from it automatically (`DatabaseConfig`), so user data survives redeploys.
- Migrating: existing local H2 data does **not** carry over to Postgres — the fresh production
  database is created empty (demo accounts are re-seeded; any previously registered users must
  register again).

### 2. Point the Vercel frontend at the hosted API

The SPA's axios client uses `import.meta.env.VITE_API_URL || '/api'`. Vite inlines the value at
**build time**, so changing it requires a redeploy of the frontend.

1. Vercel dashboard → **techie-backend-forge** → **Settings → Environment Variables**.
2. Add:
   - **Key:** `VITE_API_URL`
   - **Value:** `https://backendforge-academy-api-bef2.onrender.com/api` — keep the `/api` suffix;
     the client joins it onto every request (`/content/curriculum`, `/auth/login`, …). If Render
     assigned a different URL, use the actual one from the service's dashboard.
   - **Scope:** Production (or All).
3. **Redeploy**: Deployments → latest → ⋯ → **Redeploy** (or just push to `main`).

If `VITE_API_URL` is left unset, the SPA calls `/api/*` on its own origin — Vercel rewrites those
paths to `index.html`, so the app shows the "Static preview — the Spring Boot API isn't connected"
banner instead of crashing (the API client rejects non-JSON responses).

### Backend environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Injected by Render/Railway; don't set manually. |
| `DATABASE_URL` | *(unset → H2 file DB)* | `postgres://…` connection string from Render/Railway Postgres. When present, the app uses Postgres instead of H2. |
| `APP_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated origins allowed to call the API. Add your Vercel **preview** origin too if you test there. |
| `APP_JWT_SECRET` | dev-only value | ≥ 32 chars. Keep it stable or existing JWTs stop validating. |
| `OPENAI_API_KEY` | *(unset)* | Enables real OpenAI answers from the AI tutor. |
| `APP_OPENAI_BASE_URL` | *(unset)* | Any OpenAI-compatible endpoint (base URL without `/v1`). |
| `APP_USE_FREE_ENDPOINT` | `true` | Zero-key fallback: a free Hugging Face endpoint answers the tutor by default. |

### Deployed URLs

- **Frontend (Vercel):** https://techie-backend-forge.vercel.app — the React SPA.
- **Backend (Render, after step 1):** https://backendforge-academy-api-bef2.onrender.com —
  health check at `/actuator/health`.
- **Local:** backend on `:8080`, frontend dev server on `:5173` (proxies `/api`).
