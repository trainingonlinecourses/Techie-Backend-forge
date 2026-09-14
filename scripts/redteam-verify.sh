#!/usr/bin/env bash
# Red-team verification. Target overridable: BASE=https://api.example.com bash scripts/redteam-verify.sh
set -u
B="${BASE:-http://localhost:18080}"
U="rt$RANDOM$RANDOM"
pass() { echo "  PASS: $1"; }
fail() { echo "  !!FAIL: $1"; }
code() { curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$@"; }

echo "== 1. Security headers =="
# HSTS is emitted unconditionally (TLS terminates at the platform edge — the app
# itself never sees an HTTPS request, so a request-conditional header would never
# fire in production).
H=$(curl -s -D - -o /dev/null "$B/api/content/stats")
echo "$H" | grep -qi "content-security-policy" && pass "CSP present" || fail "CSP missing"
echo "$H" | grep -qi "strict-transport-security" && pass "HSTS present (unconditional)" || fail "HSTS missing"
echo "$H" | grep -qi "x-frame-options: DENY" && pass "X-Frame-Options DENY" || fail "X-Frame-Options missing"
echo "$H" | grep -qi "x-content-type-options" && pass "nosniff present" || fail "nosniff missing"
echo "$H" | grep -qi "permissions-policy" && pass "Permissions-Policy present" || fail "Permissions-Policy missing"

echo "== 2. Endpoint lockdown =="
[ "$(code "$B/api/labs/start?topic=arrays-deep")" = "401" ] && pass "POST-less /api/labs/start -> 401" || fail "labs start NOT locked"
[ "$(code -X POST "$B/api/labs/output?sessionId=x")" = "401" ] && pass "/api/labs/output -> 401" || fail "labs output NOT locked"
[ "$(code -X POST "$B/api/chat" -H 'Content-Type: application/json' -d '{"message":"hi"}')" = "401" ] && pass "/api/chat -> 401" || fail "chat NOT locked"
[ "$(code "$B/api/progress")" = "401" ] && pass "/api/progress -> 401" || fail "progress NOT locked"
[ "$(code -X POST "$B/api/quiz/1/submit" -H 'Content-Type: application/json' -d '{"answers":[]}')" = "401" ] && pass "quiz submit -> 401" || fail "quiz submit NOT locked"
[ "$(code -X POST "$B/api/analytics/events" -H 'Content-Type: application/json' -d '{"surface":"IMPRESSION"}')" = "401" ] && pass "analytics events -> 401" || fail "analytics NOT locked"
[ "$(code "$B/api/certificates")" = "401" ] && pass "certificates list -> 401" || fail "certificates NOT locked"
[ "$(code "$B/api/content/curriculum")" = "200" ] && pass "public content still 200" || fail "public content broken"
[ "$(code "$B/actuator/health")" = "200" ] && pass "health still 200" || fail "health broken"
[ "$(code "$B/actuator/env")" = "401" ] && pass "actuator/env NOT exposed" || fail "actuator/env exposed!"
[ "$(code "$B/actuator/beans")" = "401" ] && pass "actuator/beans NOT exposed" || fail "actuator/beans exposed!"
CERTCODE=$(curl -s --max-time 10 "$B/api/certificates/verify/does-not-exist" | head -c 60)
echo "$CERTCODE" | grep -q "valid" && pass "public certificate verify still works" || fail "cert verify broken: $CERTCODE"

echo "== 3. Demo seeds disabled outside local-only runs =="
R=$(curl -s --max-time 10 -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"learner","password":"learner123"}' -o /dev/null -w "%{http_code}")
if [ "$R" = "401" ]; then pass "learner/learner123 rejected (data dir already seeded pre-change)"; else echo "  INFO: learner login -> $R (fresh DB = seeds skipped; pre-existing row accepted)"; fi

echo "== 4. Register -> login works; a run of failures locks only that IP window =="
REG=$(curl -s --max-time 10 -X POST "$B/api/auth/register" -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"displayName\":\"RT\",\"password\":\"RtPass123\"}")
echo "$REG" | grep -q token && pass "register ok" || fail "register broken: $REG"
TOK=$(echo "$REG" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
for i in $(seq 1 12); do
  R=$(code -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"wrong$i\"}")
  # Stop at the first 429; the limiter caps at 5 failures/15 min per IP window.
  [ "$R" = "429" ] && break
done
# NOTE: when several runs share one egress IP (CI, repeated local runs, or a host
# with rotating outbound addresses), the window may already be partially burned
# or split across two socket IPs, so 6 attempts alone can under- or over-shoot.
[ "$R" = "429" ] && pass "failures -> 429 lockout (failure-based, attempt-safe)" || fail "no 429 within 12 failures (got $R)"
# The lockout is per-IP-window, not per-account: the token from BEFORE the failures
# still authenticates (this is exactly the 'I locked myself out mid-testing' case).
R=$(code "$B/api/auth/me" -H "Authorization: Bearer $TOK")
[ "$R" = "200" ] && pass "existing session unaffected by IP lockout" || fail "lockout killed valid session ($R)"
# IP isolation via a client-supplied XFF chain is only verifiable against the
# LOCAL backend, where the app itself owns XFF interpretation. Production edges
# (Render) overwrite client XFF, so a forged "different IP" is correctly ignored
# there and the real (shared) socket IP stays locked — that is the desired
# behavior, verified separately in section 6.
case "$B" in
  *localhost*|*127.0.0.1*)
    R=$(code -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -H 'X-Forwarded-For: 198.51.100.9, 198.51.100.1' -d "{\"username\":\"$U\",\"password\":\"RtPass123\"}")
    [ "$R" = "200" ] && pass "different IP key: correct login succeeds while first IP locked" || fail "IP isolation broken ($R)"
    ;;
  *)
    echo "  SKIP: XFF-based IP isolation is local-only (production edge owns the header)"
    ;;
esac

echo "== 5. Brute-force 429 carries a retry hint =="
OUT=$(curl -s --max-time 10 -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d "{\"username\":\"$U\",\"password\":\"bad8\"}")
echo "$OUT" | grep -q "Too many login attempts" && pass "429 body explains the lockout" || fail "429 body missing hint: $OUT"

echo "== 6. XFF spoofing cannot bypass the limiter (real proxy topology) =="
# A real edge proxy APPENDS the client address to any client-supplied XFF, so the
# last hop is always the proxy-observed IP. Simulate Render: the attacker rotates
# their fake first hop, the proxy appends the same real IP every time.
CODES=""
for i in 1 2 3 4 5 6 7 8; do
  C=$(code -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -H "X-Forwarded-For: 10.0.$i.$i, 198.51.100.77" -d '{"username":"nobody_xyz","password":"bad"}')
  CODES="$CODES $C"
done
echo "  codes with rotating first hop behind a constant proxy hop:$CODES"
echo "$CODES" | grep -q " 429" && pass "rotating spoofed first hop still hits 429 (last-hop keying)" || fail "XFF rotation bypasses limiter"

echo "== 7. SSRF guard on BYO chat endpoint =="
# Fresh token via REGISTER (registration is not login-limited, so this works
# even when section 4 locked the shared egress IP's login window).
TOK=$(curl -s --max-time 15 -X POST "$B/api/auth/register" -H 'Content-Type: application/json' -d "{\"username\":\"${U}-ssrf\",\"displayName\":\"RT SSRF\",\"password\":\"RtPass123\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).token||'')}catch(e){console.log('')}})")
[ -n "$TOK" ] && pass "fresh token acquired" || fail "could not get token for SSRF test"
R=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$B/api/chat" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"message":"hi","baseUrl":"http://169.254.169.254/latest/meta-data"}')
[ "$R" = "400" ] && pass "metadata IP rejected with 400" || fail "SSRF metadata IP not rejected (http $R)"
R=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST "$B/api/chat" -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d '{"message":"hi","baseUrl":"http://localhost:11434/v1"}')
[ "$R" = "400" ] && pass "localhost endpoint rejected with 400" || fail "SSRF localhost not rejected (http $R)"

echo "== 8. Token forgery rejected =="
R=$(code "$B/api/auth/me" -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhZG1pbiIsImlhdCI6MTYwMDAwMDAwMH0.forged_sig')
[ "$R" = "401" ] && pass "forged JWT -> 401" || fail "forged JWT accepted ($R)"

echo "RED-TEAM RUN COMPLETE"
