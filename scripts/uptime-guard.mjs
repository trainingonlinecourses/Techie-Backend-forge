#!/usr/bin/env node
/**
 * Production uptime guard — check, diagnose, and (where safe) auto-recover.
 *
 * Why this exists: the self-ping only keeps a *running* instance warm. It cannot
 * help when the deploy itself is wedged (Render's proxy accepts the TCP
 * connection, then the container never answers), which is exactly how the
 * backend stayed dark for three weeks while 25+ keepalive runs failed silently.
 *
 * Design constraints that shaped this:
 *
 *  1. NEVER loop. A paused Supabase project cannot be fixed by redeploying — the
 *     app boots, fails to reach the database, and dies again. A blind
 *     "redeploy until green" loop would hammer Render and burn CI minutes while
 *     making things worse. So recovery is attempted at most ONCE per invocation,
 *     and a redeploy that does not produce a healthy service is reported as a
 *     MANUAL action with the exact dashboard steps, not retried.
 *
 *  2. Distinguish "wedged boot" from "paused database" before acting. The
 *     signature differs:
 *       - TCP connects, zero bytes, repeated  -> wedged container (redeploy helps)
 *       - connection refused / DNS failure     -> service gone (manual)
 *       - healthy after redeploy but DB errors  -> paused Supabase (manual)
 *
 *  3. Secrets stay in GitHub Actions. RENDER_API_KEY and VERCEL_TOKEN are read
 *     from the environment; this script never writes them anywhere.
 *
 * Usage:
 *   node scripts/uptime-guard.mjs            # check + auto-recover if down
 *   node scripts/uptime-guard.mjs --check    # check only, never redeploy
 *   node scripts/uptime-guard.mjs --recover  # force one recovery attempt
 *
 * Exit codes: 0 healthy (or recovered), 1 still down, 2 bad configuration.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const RENDER_HEALTH =
  process.env.RENDER_HEALTH_URL || 'https://backendforge-academy-api-bef2.onrender.com/actuator/health';
const RENDER_CONTENT =
  process.env.RENDER_CONTENT_URL || 'https://backendforge-academy-api-bef2.onrender.com/api/content/stats';
const VERCEL_URL = process.env.VERCEL_URL || 'https://techie-backend-forge.vercel.app';
const PROXY_URL = `${VERCEL_URL.replace(/\/$/, '')}/api/content/stats`;

const RENDER_API = 'https://api.render.com/v1';
const SERVICE_NAME = process.env.RENDER_SERVICE_NAME || 'backendforge-academy-api-bef2';
const RENDER_API_KEY = process.env.RENDER_API_KEY || '';
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';

// A wedged Render boot can hang for minutes; probe patiently but bounded.
const PROBE_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS || 25_000);
const PROBE_ATTEMPTS = Number(process.env.PROBE_ATTEMPTS || 3);

// Cooldown file: stops a scheduled workflow from redeploying on every tick.
const STATE_DIR = process.env.GUARD_STATE_DIR || path.join(os.tmpdir(), 'uptime-guard');
const COOLDOWN_MS = Number(process.env.GUARD_COOLDOWN_MS || 30 * 60 * 1000);

const log = (m) => console.log(`[guard] ${m}`);

/**
 * One HTTP probe that distinguishes failure MODES instead of collapsing them
 * into a boolean — the diagnosis drives whether a redeploy is even useful.
 */
async function probe(url, timeoutMs = PROBE_TIMEOUT_MS) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return {
      ok: res.ok,
      status: res.status,
      ms: Date.now() - started,
      mode: res.ok ? 'healthy' : 'http-error',
    };
  } catch (e) {
    const ms = Date.now() - started;
    // Node surfaces a hung connection as a timeout; a dead service as a
    // connection/DNS error. Only the first is worth a redeploy.
    const timedOut = e.name === 'TimeoutError' || e.name === 'AbortError';
    const cause = e.cause?.code || e.code || '';
    return {
      ok: false,
      status: 0,
      ms,
      mode: timedOut ? 'hang' : cause === 'ENOTFOUND' || cause === 'ECONNREFUSED' ? 'unreachable' : 'error',
      detail: timedOut ? 'no response bytes' : cause || e.name,
    };
  }
}

async function probeWithRetries(url, attempts = PROBE_ATTEMPTS) {
  const results = [];
  for (let i = 1; i <= attempts; i++) {
    const r = await probe(url);
    results.push(r);
    if (r.ok) return { ...r, attempts: i, results };
    if (i < attempts) {
      log(`${short(url)} ${r.mode} (${r.detail || r.status}); retry ${i}/${attempts - 1} in 15s`);
      await new Promise((res) => setTimeout(res, 15_000));
    }
  }
  const last = results[results.length - 1];
  return { ...last, attempts, results };
}

function short(url) {
  return url.replace(/^https?:\/\//, '').slice(0, 60);
}

function cooldownState() {
  const f = path.join(STATE_DIR, 'redeploy.json');
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return {};
  }
}

function inCooldown() {
  const last = cooldownState().lastRedeployAt;
  if (!last) return false;
  const age = Date.now() - last;
  if (age < COOLDOWN_MS) {
    log(`cooldown active — a redeploy was attempted ${Math.round(age / 60000)}m ago (limit ${COOLDOWN_MS / 60000}m)`);
    return true;
  }
  return false;
}

function markRedeployed() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(STATE_DIR, 'redeploy.json'),
      JSON.stringify({ lastRedeployAt: Date.now() })
    );
  } catch (e) {
    log(`could not persist cooldown state (${e.message}) — proceeding`);
  }
}

/**
 * Trigger a Render deploy via the official REST API.
 * POST /v1/services/{id}/deploys -> 202 Queued.
 * The service id is resolved by NAME so the repo needs no hardcoded id.
 */
async function renderRedeploy({ clearCache = false } = {}) {
  if (!RENDER_API_KEY) {
    return { ok: false, reason: 'no RENDER_API_KEY — cannot redeploy' };
  }
  const auth = { Authorization: `Bearer ${RENDER_API_KEY}`, accept: 'application/json' };

  // Resolve the service id by name (GET /v1/services returns the list).
  let serviceId = process.env.RENDER_SERVICE_ID || '';
  if (!serviceId) {
    const res = await fetch(`${RENDER_API}/services?limit=100`, { headers: auth });
    if (!res.ok) return { ok: false, reason: `list services failed: HTTP ${res.status}` };
    const body = await res.json();
    const services = Array.isArray(body) ? body : body.services || [];
    const svc = services.find((s) => s.service?.name === SERVICE_NAME || s.name === SERVICE_NAME);
    if (!svc) return { ok: false, reason: `no Render service named "${SERVICE_NAME}" on this account` };
    serviceId = svc.id || svc.service?.id;
  }
  if (!serviceId) return { ok: false, reason: 'could not resolve Render service id' };

  if (clearCache) {
    // A stale build cache is a real cause of wedged boots after many redeploys.
    const cc = await fetch(`${RENDER_API}/services/${serviceId}/clear-cache`, {
      method: 'POST',
      headers: auth,
    });
    log(`clear-cache: HTTP ${cc.status}`);
    // The deploy must reference the fresh cache, so give it a moment.
    await new Promise((r) => setTimeout(r, 10_000));
  }

  const res = await fetch(`${RENDER_API}/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: auth,
  });
  if (res.status === 202 || res.ok) {
    markRedeployed();
    return { ok: true, detail: `deploy queued (HTTP ${res.status})` };
  }
  const text = await res.text().catch(() => '');
  return { ok: false, reason: `deploy failed: HTTP ${res.status} ${text.slice(0, 200)}` };
}

/** Redeploy the frontend with the authenticated Vercel CLI. */
function vercelRedeploy() {
  try {
    execFileSync('npx', ['vercel', 'redeploy', VERCEL_URL, '--no-wait'], {
      stdio: 'pipe',
      timeout: 180_000,
      env: { ...process.env, VERCEL_TOKEN: VERCEL_TOKEN || process.env.VERCEL_TOKEN || '' },
    });
    markRedeployed();
    return { ok: true, detail: 'vercel redeploy queued' };
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.slice(-300);
    return { ok: false, reason: `vercel redeploy failed: ${out || e.message}` };
  }
}

const MANUAL = [
  'MANUAL ACTION REQUIRED:',
  '  1. Render dashboard -> service -> Manual Deploy -> "Clear build cache & deploy"',
  '  2. If it still will not boot: Supabase -> your project -> Restore (free projects',
  '     auto-pause after ~1 week idle, and Spring hangs forever on a pool that cannot',
  '     connect — a redeploy cannot fix this)',
].join('\n');

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const forceRecover = args.includes('--recover');

  log('=== production uptime guard ===');
  log(`frontend: ${VERCEL_URL}`);
  log(`api:      ${short(RENDER_HEALTH)}`);

  // ---- 1. Diagnose -------------------------------------------------------
  const [api, frontend, proxy] = await Promise.all([
    probeWithRetries(RENDER_HEALTH),
    probe(VERCEL_URL),
    probe(PROXY_URL),
  ]);

  log(`API      → ${api.ok ? 'OK' : api.mode} (${api.ms}ms)`);
  log(`frontend → ${frontend.ok ? 'OK' : frontend.mode} (${frontend.ms}ms)`);
  log(`proxy    → ${proxy.ok ? 'OK' : proxy.mode} (${proxy.ms}ms)`);

  const allHealthy = api.ok && frontend.ok && proxy.ok;
  if (allHealthy) {
    log('ALL SURFACES HEALTHY — nothing to do.');
    return 0;
  }

  // ---- 2. Report what is broken -----------------------------------------
  const issues = [];
  if (!api.ok) issues.push(`API (${api.mode}: ${api.detail || api.status})`);
  if (!frontend.ok) issues.push(`frontend (${frontend.mode}: ${frontend.detail || frontend.status})`);
  if (!proxy.ok) issues.push(`Vercel→API proxy (${proxy.mode}: ${proxy.detail || proxy.status})`);
  log(`UNHEALTHY: ${issues.join(' | ')}`);

  if (checkOnly) {
    log('--check passed: no recovery attempted.');
    return 1;
  }

  // ---- 3. Recover only what recovery can actually fix ---------------------
  if (!frontend.ok && frontend.mode === 'unreachable') {
    // A dead frontend is a Vercel-side problem; the Render API cannot touch it.
    log('frontend unreachable — attempting Vercel redeploy');
    const r = vercelRedeploy();
    log(r.ok ? `✓ ${r.detail}` : `✗ ${r.reason}`);
  }

  if (!api.ok) {
    if (api.mode !== 'hang') {
      // Only a HANG means a wedged boot, and only a wedged boot is fixed by
      // redeploying. Everything else is actively answering:
      //   - unreachable (DNS/conn refused) -> the service is gone; redeploy can't resurrect it
      //   - http-error (404/500/...)     -> the app IS responding; it just doesn't
      //     satisfy /actuator/health (misconfigured service id, 500 from a failing
      //     boot, an app error). A redeploy would paper over the real cause and
      //     burn a build, so report instead of acting.
      log(`API answered with ${api.mode} (${api.status || api.detail}) — not a wedged boot, so no redeploy.`);
      console.error(MANUAL);
      return 1;
    }
    if (!forceRecover && inCooldown()) {
      log('not redeploying: cooldown active.');
      console.error(MANUAL);
      return 1;
    }
    log('API wedged (hang signature) — attempting ONE Render redeploy with cache clear');
    const r = await renderRedeploy({ clearCache: true });
    if (!r.ok) {
      log(`✗ ${r.reason}`);
      console.error(MANUAL);
      return 1;
    }
    log(`✓ ${r.detail} — waiting for the new instance to boot`);
    await new Promise((r2) => setTimeout(r2, 90_000));
    const after = await probeWithRetries(RENDER_HEALTH, 4);
    if (after.ok) {
      log(`RECOVERED — API healthy after redeploy (${after.ms}ms)`);
      return 0;
    }
    // A redeploy that does not help strongly suggests the DATABASE is paused.
    // Say so explicitly instead of looping — this is the 2026-09-16 signature.
    log(`still down after redeploy (${after.mode}) — a redeploy did NOT fix it.`);
    console.error(MANUAL);
    return 1;
  }

  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`[guard] unexpected failure: ${e.stack || e.message}`);
    process.exit(2);
  });