---
title: HTTP Caching — Serving Old Responses When They're Still True
module: http-basics
order: 5
minutes: 24
topics: ["Cache-Control", "ETag", "conditional requests", "expiration", "revalidation"]
docs:
  - title: "RFC 9111 — HTTP Caching"
    url: "https://datatracker.ietf.org/doc/html/rfc9111"
summary: Most HTTP responses don't change every second. The curriculum, a course's metadata, a logo — fetching them from the server on every page view waste...
---

# HTTP Caching — Serving Old Responses When They're Still True

## The Concept: The Web Is a Cache, If You Let It Be

Most HTTP responses don't change every second. The curriculum, a course's metadata, a logo — fetching them from the server on every page view wastes bandwidth, latency, and server capacity. **HTTP caching** lets clients (and intermediate proxies/CDNs) **reuse a response** when it's still valid — the server *declares* the caching rules via headers, and the infrastructure obeys.

Think of a library: instead of everyone asking the library to print the same book, the library gives out a *loan card* (the cache) and everyone reads the copy already printed — as long as the book hasn't changed (validity) and the loan is still current (expiration).

The two mechanisms:

1. **Expiration** — "this response is valid for 60 seconds; reuse it without asking."
2. **Revalidation** — "ask the server if it changed; if not, keep your copy" (conditional requests via `ETag`/`Last-Modified`).

## The Headers

| Header | Direction | Meaning |
|---|---|---|
| `Cache-Control: max-age=60` | Response | Reuse for 60s without asking |
| `Cache-Control: no-store` | Response | Never cache (auth, personal data) |
| `Cache-Control: private` | Response | Cache in the browser only, not shared proxies |
| `Cache-Control: public` | Response | Anyone may cache (CDNs) |
| `Cache-Control: no-cache` | Response | *Store* it, but always revalidate before reuse |
| `ETag: "abc123"` | Response | A fingerprint of the content |
| `If-None-Match: "abc123"` | Request | "Only send if my copy is stale" → 304 or 200 |
| `Last-Modified` / `If-Modified-Since` | Both | The date-based sibling of ETag |

## The Two-Flow Story

### Flow 1 — Expiration (no request at all)

```
1st GET /api/courses/1
   Server: 200 OK, body, Cache-Control: max-age=60, ETag: "v2"

2nd GET /api/courses/1  (within 60s)
   Browser: uses its cached copy — NO request to the server
```

### Flow 2 — Revalidation (a cheap "did it change?" request)

```
After 60s:
GET /api/courses/1
   If-None-Match: "v2"          <- "I have v2; did it change?"

Server: unchanged
   304 Not Modified              <- NO body, tiny response
Browser: uses its cached copy

Server: changed
   200 OK + new body + ETag: "v3"
Browser: replaces the cache
```

The `304` response is the genius: the server says "still valid" with a few hundred bytes instead of the whole body — the client keeps its copy.

## The Code Walkthrough — Caching in Spring

```java
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

@RestController
@RequestMapping("/api")
public class ContentController {

    private final ContentService content;
    private String etagCache = "v1";          // in reality: derived from content hash

    public ContentController(ContentService content) { this.content = content; }

    // ---- 1. Expiration-based caching for stable content ----
    @GetMapping(value = "/curriculum", produces = "application/json")
    public ResponseEntity<Curriculum> curriculum() {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5))
                        .cachePublic())              // CDN-cacheable: public data
                .body(content.curriculum());
    }

    // ---- 2. ETag-based revalidation for per-user-ish data ----
    @GetMapping("/me")
    public ResponseEntity<UserDto> me(@RequestHeader(value = "If-None-Match",
                                                    required = false) String ifNoneMatch) {
        UserDto user = userService.current();
        String etag = "\"" + user.version() + "\"";      // e.g., a content hash

        if (etag.equals(ifNoneMatch)) {
            return ResponseEntity.status(304).build();   // "unchanged — keep your copy"
        }
        return ResponseEntity.ok()
                .eTag(etag)                              // sets the ETag header
                .body(user);
    }
}
```

### Walking Through Each Part

**`Cache-Control: max-age=300, public`** — the curriculum (public, rarely-changing content) is reusable for 5 minutes, cacheable by *anyone* including CDNs. Five minutes of stale curriculum is fine, and the traffic saved is enormous.

**The ETag dance** — the server computes a fingerprint (a version number, a hash of the content). The client sends it back as `If-None-Match`; if it matches, the server answers `304` with no body. This is the "revalidate before reuse" pattern: always *correct* (the server checks), always cheap (no body when unchanged).

**What NOT to cache** — responses with `Authorization`, personal data, or one-time resources: `Cache-Control: no-store` tells every layer not to keep them at all.

## The Caching Decision Table

| Data | Policy |
|---|---|
| Public, rarely changes (curriculum, assets) | `Cache-Control: public, max-age=300` (+ ETag) |
| Private, per-user (profile) | `Cache-Control: private, max-age=60` or ETag revalidation |
| Auth/session responses | `Cache-Control: no-store` |
| API errors | `no-store` (never cache failures by default) |
| Static assets (JS/CSS) | Long `max-age` + **fingerprinted URLs** (the `index-abc123.js` pattern — the content hash in the filename invalidates the cache when the file changes) |

**The fingerprint trick** — the academy's frontend bundle is `index-CUhVFdoX.js`: the hash in the filename means the browser can cache it *forever* (`max-age=31536000, immutable`) — when the code changes, the filename changes, and the browser fetches the new one. No hash, and a long cache would serve stale JS forever.

## Common Beginner Pitfalls

1. **No `Cache-Control`** — browsers/proxies guess (often caching things you don't want cached, like authenticated responses). Set it explicitly.
2. **Caching authenticated responses** — `no-store` for anything with `Authorization`/personal data.
3. **Long cache without fingerprints** — serving stale JS/CSS after deploys; fingerprint the filenames.
4. **ETag on frequently-changing data** — if the data changes every second, revalidation is just an extra request; use expiration for coarse windows, ETag for fine.
5. **`304` without the `ETag` on the original response** — the dance needs both sides; the first response must carry the ETag the client echoes back.
6. **Forgetting that caches are shared** — `public` responses go into shared/CDN caches; never mark private data `public`.
7. **Debugging "it's cached!"** — remember the layers: browser cache, CDN, proxy, server cache. Invalidate deliberately (fingerprints, versioned URLs), not by hoping.

## Key Takeaways

- HTTP caching reuses valid responses: expiration (`max-age`) without a request, revalidation (`ETag`/`304`) with a cheap one.
- `Cache-Control` is the policy: `public`/`private`, `max-age`, `no-store`, `no-cache`.
- `ETag` + `If-None-Match` = the "did it change?" round trip with a tiny `304` when it didn't.
- Never cache auth/personal data (`no-store`).
- Fingerprint static assets so long caches are safe.
- The web is a cache — declare the policy, or the infrastructure will guess.
