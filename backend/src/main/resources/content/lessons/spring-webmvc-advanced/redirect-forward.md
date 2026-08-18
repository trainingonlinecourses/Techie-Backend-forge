---
title: Redirects, Forwards and Flash Attributes
summary: 302 vs forward semantics, RedirectView and redirect: prefixes, POST/Redirect/GET, flash attributes, and why SPAs rarely redirect.
order: 8
minutes: 15
topics: [redirect, forward, flash-attributes, post-redirect-get, redirectview, 302]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/redirect-attributes.html
  - https://en.wikipedia.org/wiki/Post/Redirect/Get
---

# Redirects, Forwards and Flash Attributes

## The concept: two ways to "go somewhere else"

A controller returning a view or a URL can do two very different things:

- **Forward** — the *server* internally dispatches to another handler; the browser never knows; the URL bar doesn't change; one request round-trip.
- **Redirect** — the server replies `302 Found` (or `303 See Other`, `307`, `308`) with a `Location` header; the *browser* then issues a fresh GET to that location; the URL changes; two round-trips.

```java
@GetMapping("/old-path")
public String forwardToNew() {
    return "forward:/new-path";      // internal dispatch — same request
}

@GetMapping("/old-path")
public String redirectToNew() {
    return "redirect:/new-path";     // HTTP 302 + Location — browser follows
}
```

The distinction matters for **POST/Redirect/GET (PRG)** — the canonical form-handling pattern.

## POST/Redirect/GET — why forms must redirect

When a browser POSTs a form and the server responds with a *rendered page directly* (no redirect), pressing **F5 / refresh re-POSTs** — duplicating the order, the charge, the email. The PRG pattern prevents it:

```text
1. Browser:  POST /orders            (submit form)
2. Server:   create order, respond 302 Location: /orders/123
3. Browser:  GET  /orders/123        (rendered page)
4. Refresh → re-GETs /orders/123     ← harmless, idempotent
```

```java
@PostMapping("/orders")
public String createOrder(@Valid @ModelAttribute OrderForm form,
                          RedirectAttributes attrs) {
    Long id = orderService.create(form);
    attrs.addFlashAttribute("success", "Order " + id + " created");
    return "redirect:/orders/" + id;      // PRG — never render directly after a POST
}
```

The success message survives the redirect because it rides in **flash attributes**.

## Flash attributes — data across the redirect

Flash attributes live in the session for exactly one redirect: set them before the `redirect:`, and the *next* request (the redirected GET) reads them once, then they're gone:

```java
@PostMapping("/orders")
public String createOrder(...) {
    attrs.addFlashAttribute("message", "Order created");   // visible only on next request
    return "redirect:/orders";
}

@GetMapping("/orders")
public String listOrders(Model model) {
    // model now contains "message" automatically — from the flash
    // (Spring merges flash attributes into the model on the receiving handler)
}
```

This is the correct way to pass success/error messages after a redirect — **never** via query string (leaks in URLs, history, logs) and never via the session as a manual attribute (leaks when not cleared).

## RedirectView and explicit responses

```java
@GetMapping("/shortlink/{code}")
public RedirectView resolve(@PathVariable String code) {
    Link l = linkRepo.findByCode(code).orElseThrow();
    RedirectView rv = new RedirectView(l.target());
    rv.setStatusCode(HttpStatus.MOVED_PERMANENTLY);   // 301 — permanent link, cacheable
    return rv;
}
```

- `RedirectView` gives programmatic control (status code, context-relative vs absolute, `http10Compatible`).
- A `String` return with `redirect:` prefix is the common idiom; `RedirectView` when you need the explicit status (301 vs 302).
- **Status choice:** 301 is permanent (cached by browsers and proxies); 302 is temporary (not cached); 303 See Other — "see GET result" — the correct one for PRG after POST; 307/308 preserve the method (307 keeps POST — rarely wanted for PRG).

## How we use it in an organization: the scenarios

**Scenario 1 — legacy URL migration.** Old paths redirect (301) to new ones so bookmarks, links, and SEO equity transfer:

```java
@GetMapping("/products/item/{oldId}")
public RedirectView legacy(@PathVariable String oldId) {
    return new RedirectView("/products/" + catalog.rebase(oldId), true, false, false);
    // 301 so search engines update their indexes
}
```

**Scenario 2 — login flow redirect-after-auth.** Spring Security's `defaultSuccessUrl("/dashboard", true)` uses `alwaysUse` to redirect to the intended page; `SavedRequest` preserves the originally-requested URL across the login round-trip — the "redirect back where I was" behavior.

**Scenario 3 — short-link service.** A tiny resolver returning a `RedirectView` to the target — the canonical redirect microservice.

**Scenario 4 — server-rendered admin forms.** Every form POST ends in a redirect (PRG) with a flash message — the pattern that keeps admin UIs from double-submitting.

## Why SPAs rarely redirect

In a React/Vue SPA, navigation is client-side — the "redirect" is `router.push('/orders/123')` and the success toast comes from the API response, not flash attributes. For an SPA backend, the pattern translates to: **the POST endpoint returns JSON `{ id: 123 }`** and the client navigates. Keep redirects for server-rendered flows and legacy paths; return data for APIs.

## Pitfalls

- **`redirect:` to an absolute external URL** is allowed but a **open-redirect vector** if the target comes from user input — validate the host against an allow-list.
- **Forward changes nothing in the browser** — a user bookmarking a forwarded URL books the original; forwards are for internal dispatch (e.g., `/` → a default view), not for permanent moves.
- **Flash attributes need a session** — on a stateless JWT API they don't exist; use response data instead.
- **303 vs 302 for PRG** — 302 *may* convert POST to GET (browsers do); 303 mandates GET. Prefer `redirect:` (which uses 302 by default in Spring for non-POST... in fact Spring uses 302) — for strict semantics, set 303 explicitly.
- **Don't redirect after a failed validation** — re-render the form with errors in the same request (a redirect loses the field values).

## Key takeaways

- Forward = internal dispatch (one request, URL unchanged); redirect = client round-trip (URL changes).
- POST/Redirect/GET prevents duplicate submissions — never render directly after a successful POST.
- Flash attributes carry messages across exactly one redirect; never put them in query strings.
- 301 permanent / 302 temporary / 303 PRG; validate external redirect targets.
- SPAs handle "redirects" client-side from API data — redirects belong to server-rendered and legacy flows.
