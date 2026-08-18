---
title: Async Requests — Callable, DeferredResult, StreamingResponseBody and SSE
summary: When async HTTP helps, Callable vs DeferredResult vs StreamingResponseBody, thread-pool implications, and the streaming/SSE scenarios in production.
order: 10
minutes: 18
topics: [async, callable, deferredresult, streamingresponsebody, sse, servlet-async, non-blocking]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/async.html
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html
---

# Async Requests — Callable, DeferredResult, StreamingResponseBody and SSE

## The concept: freeing the servlet thread

A servlet container (Tomcat) has a **bounded pool of request threads** (default 200). A classic handler holds one thread for the *entire* request — including the seconds waiting on a slow database, an external API, or a long computation. Under load, slow handlers **exhaust the pool**: threads are all busy waiting, and new requests queue or 503.

**Async requests** release the servlet thread while the work runs elsewhere, so the container can serve other requests with it. When the work finishes, the response is completed on a different thread. Spring MVC's async support comes in increasing-control flavors:

1. `Callable<T>` — return a `Callable`; Spring runs it on a task executor.
2. `DeferredResult<T>` — the handler returns immediately; *you* complete the result later, from any thread (event, callback, message).
3. `StreamingResponseBody` / `ResponseBodyEmitter` — stream the response body incrementally.
4. `SseEmitter` — server-sent events, one-way push.

## Callable — the simplest async handler

```java
@GetMapping("/api/report")
public Callable<Report> report() {
    return () -> reportService.generate();   // Spring runs this on a task executor
}
```

The servlet thread returns immediately; Spring's `WebMvcAsyncTask` runs the `Callable` on its async executor and completes the response when it finishes. **The catch:** you've moved the thread from the servlet pool to *another* pool — total threads in play may actually *rise* if the executor is unbounded. Async helps latency *under load* only when work is I/O-bound and the executor is sized sensibly.

## DeferredResult — completion from anywhere

```java
@GetMapping("/api/order/{id}/status")
public DeferredResult<OrderStatus> status(@PathVariable Long id) {
    DeferredResult<OrderStatus> result = new DeferredResult<>(30_000L);  // timeout 30s
    orderStatusService.subscribe(id, status -> result.setResult(status)); // callback fires later
    return result;    // returns immediately; no thread is held while waiting
}
```

This is the pattern for **long-polling**, event-driven completion (message consumer, webhook, another service's callback), and queues: the servlet thread is released, and `setResult` (from *any* thread) completes the response. A timeout value prevents a hung handler from holding the connection forever; `onTimeout`/`onError` handlers let you react.

## Streaming and Server-Sent Events

```java
@GetMapping("/api/export.csv")
public StreamingResponseBody export() {
    return out -> {
        try (var rows = reportService.streamRows()) {   // lazy source
            rows.forEach(row -> {
                try { out.write(row.toCsv().getBytes()); out.flush(); }
                catch (IOException e) { throw new UncheckedIOException(e); }
            });
        }
    };
}

@GetMapping("/api/feed")
public SseEmitter feed() {
    SseEmitter emitter = new SseEmitter(60_000L);
    feedService.register(emitter);           // emitter.send(event) pushes to the client
    return emitter;
}
```

- `StreamingResponseBody` streams a large generated body (CSV/JSON-lines/PDF) without buffering it all in memory — a big win for exports of millions of rows.
- `SseEmitter` is one-way push: the client opens a normal HTTP connection and the server pushes events (`data:` lines). Perfect for notifications, job progress, price ticks — anything where the server has new data to send as it appears. (Bidirectional push = WebSockets; SSE is simpler and rides on plain HTTP.)

## How we use it in an organization: the scenarios

**Scenario 1 — CSV export without OOM.** A 5M-row export as a normal handler builds a giant string in memory. `StreamingResponseBody` writes rows as they're produced, keeping memory flat and letting the client see the first rows immediately.

**Scenario 2 — job-status long polling.** Submit a job (202 + job id); the status endpoint returns a `DeferredResult` that completes when the worker thread/queue says "done". Clients poll, the servlet pool isn't blocked by waiters.

**Scenario 3 — notification feed with SSE.** A UI shows live order updates: one `SseEmitter` per connected client, server pushes events; reconnect uses `Last-Event-ID` to resume missed events.

**Scenario 4 — fan-out of slow external calls.** Instead of one handler calling three slow APIs sequentially (holding a thread 3×), parallelize with `CompletableFuture` and complete a `DeferredResult` when all three land:

```java
CompletableFuture.allOf(callA, callB, callC)
    .thenApply(v -> combine(callA.join(), callB.join(), callC.join()))
    .whenComplete((r, ex) -> {
        if (ex != null) result.setErrorResult(ex); else result.setResult(r);
    });
```

## Pitfalls

- **Async isn't free** — it trades servlet threads for executor threads; unbounded executors and unclosed emitters leak. Size the async executor (`spring.mvc.async.request-timeout` + a task executor bean) deliberately.
- **Thread-locals don't propagate** — the security context, request attributes, and locale are **not** automatically carried onto async threads (the `SecurityContext` is propagated with care by Spring Security's `DelegatingSecurityContextExecutor`; plain threads lose it). Know which context your async code needs.
- **Timeouts leak connections** — every `DeferredResult`/`SseEmitter` should have a timeout and an `onTimeout` cleanup that unsubscribes.
- **`Callable` exceptions become 500s** — handle exceptions inside the `Callable` or map `onError`.
- **SSE behind proxies** needs buffering disabled (`X-Accel-Buffering: no` for Nginx); a buffering proxy turns your real-time feed into delayed batches.
- **Don't make everything async** — for fast handlers the overhead outweighs the benefit. Profile under load first: async is for slow I/O under concurrency.

## Key takeaways

- Async releases the servlet thread for slow work — but moves the cost to another pool; size executors deliberately.
- `Callable` = run on an executor; `DeferredResult` = complete from any thread (long-poll, events, queues).
- `StreamingResponseBody` streams large bodies without buffering; `SseEmitter` is one-way push over HTTP.
- Set timeouts and cleanup on every deferred/emitter; know your thread-local propagation.
- Use async where slow I/O meets concurrency — not as a default for every endpoint.
