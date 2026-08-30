---
title: Authentication and Authorization — Broken Access Control and Auth Failures
module: owasp-security
order: 4
minutes: 26
topics: ["broken access control", "IDOR", "authentication failures", "session management", "authorization", "Spring Security"]
docs:
  - title: "Broken Access Control (OWASP Top 10)"
    url: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/"
  - title: "Identification and Authentication Failures (OWASP Top 10)"
    url: "https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/"
summary: Two separate jobs, one acronym away from each other, and both in the Top 10: authentication — proving who you are (A07, Identification and Authenti...
---

# Authentication and Authorization — Broken Access Control and Auth Failures

## The Concept: Proving Who You Are, and Limiting What You Can Do

Two separate jobs, one acronym away from each other, and both in the Top 10: **authentication** — proving *who* you are (A07, Identification and Authentication Failures) — and **authorization** — enforcing *what* you may do (A01, Broken Access Control, the #1 web risk). The devastating bugs usually aren't in the login itself; they're in the *forgotten checks* after it: the endpoint that trusts "the user is logged in" and never asks "should *this* user access *this* object?"

**The mental model:** authentication is the ID check at the door; authorization is the permissions inside. The door check (login) is well-guarded in most apps — it's the *rooms* that leak: an authenticated student walking into the admin office, or into *another student's* exam. Broken access control is "the door was fine; the room doors were open." The most common real-world form is **IDOR** (Insecure Direct Object Reference): the app uses a user-supplied identifier to fetch an object, and never verifies the caller may see that object.

## IDOR: The #1 Real-World Bug

```java
@RestController
public class LessonController {

    // VULNERABLE — classic IDOR:
    @GetMapping("/api/users/{id}/progress")
    public ProgressDto getProgress(@PathVariable Long id) {
        // Any authenticated user can read ANY user's progress by
        // changing the id: /api/users/1/progress, /api/users/2/progress...
        return progressService.findByUserId(id);
    }

    // SAFE — bind the resource to the caller's identity:
    @GetMapping("/api/users/{id}/progress")
    public ProgressDto getProgress(@PathVariable Long id,
                                   Authentication authentication) {
        String callerId = authentication.getName();
        // Rule 1: only your own progress (self-service):
        if (!String.valueOf(id).equals(callerId)) {
            throw new ForbiddenException("not your progress");
        }
        // Rule 2 (the general form): the RESOURCE belongs to the caller:
        // Progress p = progressService.findByUserId(id);
        // if (!p.getOwnerId().equals(callerId)) throw new ForbiddenException();
        return progressService.findByUserId(id);
    }
}
```

**The pattern of the bug:** the id comes from the URL (client-controlled), the query trusts it, and authorization never happens. **The rule:** *every* object-level access must verify ownership (or an explicit grant) — never trust that an id in the URL implies permission. The same bug shows up in file downloads (`/files/{name}`), order views, message threads, and admin actions keyed by ids.

## The Authorization Toolkit in Spring

Spring Security gives you the enforcement layers:

```java
// 1. URL-level (coarse) — in the SecurityFilterChain:
.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/admin/**").hasRole("ADMIN")
    .requestMatchers("/api/lessons/**").authenticated()
    .anyRequest().denyAll())                    // deny-by-default!

// 2. Method-level (fine) — on the service methods:
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(Long id) { ... }

// 3. Object-level (the IDOR fix) — expression referencing the args:
@PreAuthorize("hasRole('ADMIN') or #progress.ownerId == authentication.name")
public ProgressDto getProgress(@P("progress") Progress progress) { ... }

// 4. Deny-by-default — the meta-rule:
//    every endpoint must have an EXPLICIT rule; anything unlisted is denied.
```

**The three habits that prevent the class:** **deny-by-default** (`anyRequest().denyAll()` — an unlisted endpoint is *denied*, not open), **authorization at the resource** (method-level checks where the object is known, not just at the URL), and **ownership checks for every object reference** (the IDOR fix). The layered shape: URL rules for coarse routes, `@PreAuthorize` for fine-grained service rules, and ownership logic for per-object access.

## Authentication Failures: The Common Problems

A07 covers the ways "proving who you are" goes wrong:

**1. Weak credential handling.** Passwords stored in plaintext or weak hashes (MD5/SHA1 — fast to brute-force). **The fix:** hash with bcrypt/Argon2 (deliberately slow), unique salt per password — Spring Security's `BCryptPasswordEncoder`:

```java
@Bean
PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();   // salts automatically, ~100ms per hash
}
```

**2. Credential stuffing.** Attackers replay passwords leaked from other sites (users reuse passwords). **The fixes:** rate-limit login attempts, lock out/throttle after failures, require MFA for sensitive actions, and check breached-password lists.

**3. Weak session management.** Session IDs predictable, not rotated on login, exposed in URLs, or readable by JavaScript. **The fixes:** Spring's defaults — random session ids, `HttpOnly` + `Secure` + `SameSite` cookies, session fixation protection (a new session id on login — Spring does this automatically), and `sessionManagement` with fixed timeouts.

**4. Missing MFA and weak password policies.** The industry answer to the reality that passwords alone fail: **multi-factor authentication** (TOTP, WebAuthn) for the accounts that matter, plus automated scanning for the trivial cases (default credentials, blank passwords).

## The Privilege Escalation Variants

Beyond IDOR, broken access control has more faces:

- **Horizontal escalation** — same role, other users' data (the IDOR case above).
- **Vertical escalation** — a lower role reaching higher privileges: calling an admin URL directly, replaying an admin's request with your cookie, or *manipulating claims* — a client that *sends* its role and the server trusts it:

```java
// VULNERABLE — the client declares its own role:
// POST /api/login  body: { user: "ada", role: "ADMIN" }
// -> the server stores role: ADMIN for the session.

// SAFE — roles come from the SERVER's authority (the DB, the token), never
// from client-supplied input.
```

- **Missing function-level checks** — the admin *button* is hidden in the UI, but the admin *endpoint* is open. UI hiding is not security; the server must enforce.
- **Direct method access** — POST endpoints reachable with GET, or state-changing methods callable via the wrong verb. Spring's `@RequestMapping(method = ...)` and CSRF protection address the basics.

## The Practical Security Checklist for Auth

1. **Deny-by-default** on every route; explicit rules for everything else.
2. **Object-level ownership checks** on every id-based resource (the IDOR fix).
3. **Roles from the server**, never from client input; verify on every privileged path.
4. **bcrypt/Argon2** password hashing (never plaintext, never MD5/SHA).
5. **Login rate limiting + lockout + MFA** for sensitive actions.
6. **Secure sessions**: HttpOnly, Secure, SameSite cookies; rotate ids on login; timeouts.
7. **Audit logins and denials** — A09's logging discipline (who tried, who failed, who escalated).
8. **Test with an automated scanner + manual probes** — change an id, try an admin URL as a normal user, replay a request — every release.

## Recap

Authentication (who you are) and authorization (what you may do) are separate jobs with separate failure modes. **Broken access control** — the #1 risk — is almost always **IDOR**: trusting a client-supplied id without checking ownership. The fix is defense in depth: deny-by-default routing, `@PreAuthorize` at the resource, and ownership checks for every object reference — with roles coming from the server, never the client. **Authentication failures** are weak credential handling (bcrypt/Argon2, never plaintext), credential stuffing (rate limits, MFA), and weak sessions (HttpOnly/Secure/SameSite, rotation, timeouts — Spring's defaults). The habit that prevents the whole class: **after every authentication check, ask the authorization question — "and should THIS caller do THIS thing to THIS object?" — and let the code answer explicitly.**
