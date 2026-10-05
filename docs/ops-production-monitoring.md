# Production monitoring & recovery runbook

## Surfaces monitored

| Surface | URL | Checked by |
|---|---|---|
| Frontend (Vercel) | https://techie-backend-forge.vercel.app | uptime guard + CI smoke-prod |
| API health (Render) | https://backendforge-academy-api-bef2.onrender.com/actuator/health | uptime guard + CI smoke-prod |
| API content | .../api/content/stats | uptime guard + smoke-prod |
| Vercel → Render proxy | https://techie-backend-forge.vercel.app/api/content/stats | uptime guard + smoke-prod |

## Layers

1. **Uptime guard** (`.github/workflows/keepalive.yml` → `scripts/uptime-guard.mjs`) —
   checks the API, the frontend and the Vercel→API proxy, then auto-redeploys the
   cases a redeploy genuinely fixes (see the table above). On failure it
   re-triggers itself every ~90s so recovery isn't stuck behind GitHub's
   heavily-throttled cron. This single job is both the alarm and the repair.
2. **CI smoke-prod** (`.github/workflows/ci.yml` → `smoke-prod` job) — after every
   push, real-browser checks against production: lesson load, signup, login,
   completion persistence, prereq gate. A functional break in prod fails the push's
   CI, so it cannot go unnoticed.
2. **CI smoke-prod** (`.github/workflows/ci.yml` → `smoke-prod` job) — after every
   push, real-browser checks against production: lesson load, signup, login,
   completion persistence, prereq gate. A functional break in prod fails the push's
   CI, so it cannot go unnoticed.
3. **Manual recovery** — see "When the backend hangs" below.

## When the backend hangs (the 2026-09-16 pattern)

Symptom: `/actuator/health` connects (TCP) but never returns bytes; curl exits 28.
Render's own status page is green. Vercel's `/api` proxy times out the same way.

Diagnosis order:

1. **Check Render dashboard → Deploys.** If the latest deploy is stuck or failed,
   the boot is wedged — trigger **Manual Deploy → Deploy latest commit**.
2. **If deploys look fine**, the likely cause is the database: the free Supabase
   project pauses after ~1 week of inactivity, and Spring Boot hangs forever on
   a pool that can never connect. Open the Supabase dashboard — if paused,
   **Restore project**, then trigger a Render manual deploy.
3. **Render free instances also crash silently** on OOM. Check Metrics → Memory;
   a restart (Suspend → Resume) clears it.

The push-nudge trick (an empty commit to main) only helps when the deploy
pipeline itself is healthy — it does NOT fix a wedged boot or a paused database.

## Auto-recovery (needs one secret)

`scripts/uptime-guard.mjs` is the recovery brain: it diagnoses the failure mode
and redeploys **only what a redeploy can actually fix**.

| Diagnosis | Auto-recover? | Why |
|---|---|---|
| API hangs (TCP connects, 0 bytes) | ✅ Render redeploy + cache clear | a wedged container is exactly what a redeploy fixes |
| Frontend unreachable | ✅ `vercel redeploy` | Vercel-side failure, Render's API can't help |
| API unreachable (DNS/conn refused) | ❌ manual | the service is gone; redeploy can't resurrect it |
| API answers with an error (404/500) | ❌ manual | the app is UP — a redeploy would mask the real cause |
| Healthy | — | no action |

A paused Supabase project lands in the last two rows: the app boots, can't reach
the database, and dies again. Redeploying in a loop cannot fix that, so the
guard reports it and stops. A 30-minute cooldown also prevents every throttled
cron tick from queueing another build during a real outage.

### 1. Get a Render API key (required for auto-recovery)

Render dashboard → your account → **API Keys** → *Create API Key* → copy it.

```bash
gh secret set RENDER_API_KEY        # paste the key
```

The guard resolves your service **by name** (`backendforge-academy-api-bef2`),
so no service id is needed. Override with `RENDER_SERVICE_NAME` if you rename it.

### 2. Get a Vercel token (optional, frontend only)

Vercel dashboard → Account Settings → Tokens → Create Token.

```bash
gh secret set VERCEL_TOKEN          # paste the token
```

Without it the guard still checks the frontend and just reports it instead of
redeploying. The API key/secret are only ever read from the Actions environment —
never committed, never written to disk by the script.

### Verify the automation end to end

```bash
node scripts/uptime-guard.mjs --check   # check only, never redeploys
node scripts/uptime-guard.mjs           # check + recover if needed
```

Exit codes: `0` healthy or recovered, `1` still down (manual steps printed),
`2` bad configuration.

## Notes

- GitHub-scheduled workflows on free repos are heavily throttled — expect one run
  every ~2–4 hours, not every 5 minutes. That's why the failure loop uses
  `workflow_dispatch`, which is never throttled.
- The production smoke suite warms the API in `test.beforeAll` and tolerates a
  Render cold start (90s budget). If the API never answers it aborts the whole
  job in ~90 seconds with the recovery steps above, rather than letting every
  test burn its own timeout — that variant turned a dead backend into a
  30-minute CI run that reported only "failed".
- A `PORT` env var is what marks the app as deployed (Render injects it). It must
  be a real port: shells such as Git Bash export `PORT=0`, and treating that as
  production makes the CORS guard reject the local dev origins and crash startup.
- CI minutes: the smoke-prod job adds ~3–5 minutes per push. If that becomes a
  problem, gate it to `workflow_dispatch` + a `schedule` cron instead of every push.
