# Production monitoring & recovery runbook

## Surfaces monitored

| Surface | URL | Checked by |
|---|---|---|
| Frontend (Vercel) | https://techie-backend-forge.vercel.app | keepalive (every ~15 min) + CI smoke-prod |
| API health (Render) | https://backendforge-academy-api-bef2.onrender.com/actuator/health | keepalive (every ~15 min) + CI smoke-prod |
| API content | .../api/content/stats | keepalive + smoke-prod |
| Vercel → Render proxy | https://techie-backend-forge.vercel.app/api/content/stats | smoke-prod |

## Layers

1. **Keepalive** (`.github/workflows/keepalive.yml`) — pings health + content every
   ~15 minutes. On failure it **re-triggers itself every ~2 minutes** until the API
   answers again (scheduled crons are heavily throttled by GitHub; dispatch runs are
   not). This is the "it stopped responding" alarm AND the retry heartbeat.
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

Create a Render **Deploy Hook** (Service → Settings → Deploy Hooks), then:

```bash
gh secret set RENDER_DEPLOY_HOOK_URL   # paste the hook URL
```

The keepalive workflow will then call it automatically when the API has been
unresponsive for 10+ minutes. If the secret is absent (current state), the
workflow still alerts via the re-trigger loop, and recovery is manual per above.

## Notes

- GitHub-scheduled workflows on free repos are heavily throttled — expect one run
  every ~2–4 hours, not every 5 minutes. That's why the failure loop uses
  `workflow_dispatch`, which is never throttled.
- The production smoke suite warms the API itself (`test.afterAll` retry loop in
  `frontend/e2e-prod/smoke.spec.js`) and tolerates one cold start per test via
  Playwright `retries`.
- CI minutes: the smoke-prod job adds ~3–5 minutes per push. If that becomes a
  problem, gate it to `workflow_dispatch` + a `schedule` cron instead of every push.
