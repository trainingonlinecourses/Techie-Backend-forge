---
title: Testing Async Code — Awaitility, Polling and Eventually-True Assertions
summary: Why fixed sleeps fail, Awaitility's await().until() model, and the async-testing scenarios (consumers, jobs, caches) with deterministic waits.
order: 8
minutes: 15
topics: [awaitility, async-testing, polling, eventually, kafka-consumer, scheduled-jobs, flaky-tests]
docs:
  - https://github.com/awaitility/awaitility
---

# Testing Async Code — Awaitility, Polling and Eventually-True Assertions

## The concept: async means "eventually"

Code that runs on another thread — a Kafka consumer, a `@Scheduled` job, a `CompletableFuture`, an `@Async` method, a cache that fills lazily — doesn't complete synchronously with the test's assertion. The naive fix is `Thread.sleep(2000)` before asserting, and it's the **#1 source of flaky tests**: too short a sleep fails on slow CI; too long wastes minutes and still fails under load. The correct tool waits *until a condition becomes true*, polling with a timeout:

```java
@Test
void consumerProcessesMessageEventually() {
    kafkaTemplate.send("orders", orderJson);          // fire the event

    await().atMost(5, TimeUnit.SECONDS)
           .untilAsserted(() -> assertThat(orderRepo.count()).isEqualTo(1));
}
```

Awaitility polls the condition (default ~100ms intervals), re-evaluates until it passes or the deadline hits. **Deterministic, fast when things work, and fails with a clear timeout message.**

## The Awaitility API you'll use

```java
// Core shape: await().<timeout>.<polling>.<condition>
await().atMost(10, TimeUnit.SECONDS)
       .pollInterval(200, TimeUnit.MILLISECONDS)     // how often to re-check
       .until(() -> statusService.isReady());         // condition as a boolean supplier

// Assertion-style (preferred — gives you the actual failure):
await().atMost(5, TimeUnit.SECONDS)
       .untilAsserted(() -> assertThat(cache.get("k")).isEqualTo(expected));

// With data (poll a value until it matches):
await().atMost(5, TimeUnit.SECONDS)
       .until(() -> counter.get(), greaterThan(10));  // Hamcrest matcher on a supplier

// Ignore transient exceptions during the wait (e.g., the repo throws until a row exists):
await().atMost(5, TimeUnit.SECONDS)
       .ignoreExceptions()                            // retry through them
       .until(() -> reportService.generate().rows() > 0);
```

The golden rule: **assert inside the wait** (via `untilAsserted` or a matcher) instead of sleeping, then asserting once — the wait *is* the assertion.

## How we use it in an organization: the scenarios

**Scenario 1 — Kafka/Rabbit consumer test.** Send a message, wait until the consumer processed it (a DB row appears, an event fires):

```java
await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
    assertThat(orderRepo.findByRef("ref-1")).isPresent();
});
```

**Scenario 2 — scheduled job test.** Trigger the job (or wait for the cron tick in a fast test schedule), then `await()` until the outcome is visible.

**Scenario 3 — cache warm-up / async cache fill.** After `cacheManager.getCache("products").clear()`, request an item (the cache fills asynchronously), then await until the second read hits the populated cache.

**Scenario 4 — email/webhook assertion.** `@Async` email sender: send the order, await until the mock emailer's `sent()` list has one entry, then assert its content. The mock *records* asynchronously; Awaitility waits for the record.

**Scenario 5 — eventual consistency tests.** After a write to a primary store, await until the read replica (or the search index, or the outbox consumer's target) reflects it — with a timeout that matches the real propagation SLA.

## Wait — should your test await at all?

Sometimes the async behavior *shouldn't* be waited on in the test: if the test isn't about the async outcome (e.g., "the endpoint returns 202 immediately"), assert the synchronous contract (202 + job id) and test the async processing separately with Awaitility. Waiting for async work you don't care about slows the suite and couples tests to internal timing.

## Pitfalls

- **`Thread.sleep` in tests — banned in review** — it's a race, not a wait. If you see `sleep` in test code, the question is always "why aren't you using Awaitility?".
- **Timeouts too tight** — CI machines are slow; a 2s timeout that passes locally and fails in CI is a config bug. Give async tests generous-but-bounded timeouts (5-15s).
- **Polling without timeout** — `await().until(...)` with no `atMost` defaults to 10s (configurable globally via `awaitility.timeout`); always set an explicit `atMost` for clarity.
- **Asserting after the wait** — `await().until(someFlag)` then `assertThat(...)` is a race if the flag isn't the final state; prefer `untilAsserted(() -> assertThat(actualState))` so the *assertion itself* is the condition.
- **Ignore transient exceptions deliberately** — `ignoreExceptions()` can mask real failures; scope it and always have the `until` condition fail on genuine errors.
- **Shared state across tests** — async tests that mutate the DB/cache must clean up; use `@DirtiesContext` or transactional resets so a late consumer from test A doesn't corrupt test B.

## Key takeaways

- Async outcomes need *eventually-true* waits, not sleeps — Awaitility polls until the condition passes.
- `await().atMost(t).untilAsserted(() -> assertThat(...))` is the canonical shape.
- Use it for consumers, jobs, caches, async senders, and eventual-consistency checks.
- Bounded, generous timeouts; assert inside the wait; scope `ignoreExceptions`.
- Ban `Thread.sleep` in tests — it's a race, not a wait.
