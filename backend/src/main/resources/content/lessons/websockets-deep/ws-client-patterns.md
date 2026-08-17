---
title: WebSocket Client Patterns — Reconnection, Heartbeats, Backpressure
module: websockets-deep
order: 3
minutes: 23
topics: ["reconnection", "heartbeats", "backpressure", "client design", "SockJS"]
docs:
  - title: "SockJS client"
    url: "https://github.com/sockjs/sockjs-client"
---

# WebSocket Client Patterns — Reconnection, Heartbeats, Backpressure

## The Concept: The Client Is Where Reliability Happens

Servers treat sockets as disposable — they restart, deploy, and drain instances constantly (see the scaling lesson). The **client** decides whether users *feel* any of that. A WebSocket client without reconnection, heartbeats, and flow control is a live feature that silently dies:

- Network blips drop the socket → the UI freezes, updates stop.
- Proxies close idle sockets → the "connection" is dead but the UI thinks it's alive.
- A fast server floods a slow client → the browser queues unbounded messages.

The three client-side patterns that make real-time features actually reliable:

1. **Reconnection with exponential backoff** — try again, wait longer between attempts.
2. **Heartbeats (ping/pong)** — prove liveness, keep proxies from killing idle sockets.
3. **Backpressure / buffering discipline** — don't let the message queue grow unbounded.

## Pattern 1 — Reconnection with Backoff

```javascript
class ReliableSocket {
  constructor(url, { maxRetries = Infinity, baseDelay = 1000, maxDelay = 30000 } = {}) {
    this.url = url;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
    this.maxDelay = maxDelay;
    this.retries = 0;
    this.listeners = new Set();
    this.connect();
  }

  connect() {
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;                       // success resets the backoff
      this.emit('open');
      this.startHeartbeat();
    };

    ws.onmessage = (e) => this.emit('message', e.data);

    ws.onclose = () => {
      this.stopHeartbeat();
      this.scheduleReconnect();
    };

    ws.onerror = () => ws.close();            // errors surface as close
  }

  scheduleReconnect() {
    if (this.retries >= this.maxRetries) { this.emit('dead'); return; }

    // Exponential backoff with jitter: 1s, 2s, 4s, 8s... capped at 30s
    const delay = Math.min(this.baseDelay * 2 ** this.retries, this.maxDelay)
                + Math.random() * 250;
    this.retries++;
    setTimeout(() => this.connect(), delay);
  }

  startHeartbeat() {
    this.heartbeat = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send('ping');                 // or a STOMP-level ping
      }
    }, 30000);
  }

  stopHeartbeat() { clearInterval(this.heartbeat); }

  on(event, fn) { this.listeners.add([event, fn]); return this; }
  emit(event, data) { for (const [e, f] of this.listeners) if (e === event) f(data); }
}
```

### Walking Through Each Part

**Reconnection** — `onclose` (not `onerror`!) triggers a reconnect: the socket died, so schedule another attempt. The backoff is **exponential with jitter**: `baseDelay * 2^retries`, capped (`maxDelay`), plus random jitter. Without jitter, thousands of clients all retry in lockstep — a reconnect stampede that can take the server down with it (the same lesson as retry storms in the resilience module).

**Reset on success** — `onopen` resets `retries = 0`: after a successful reconnect, the next failure starts from a short delay again.

**The `dead` event** — after `maxRetries`, the client gives up and tells the UI ("show reconnect button" instead of silently failing forever).

## Pattern 2 — Heartbeats

Why the heartbeat matters: load balancers and proxies close connections that are idle for their timeout (often 60s). A chat that's quiet for a minute gets its socket silently killed — the UI still shows "connected" while nothing works.

The fix: the client (or server) sends a **ping every ~30s** and expects a pong. WebSocket has protocol-level ping/pong frames (handled transparently by the browser), or STOMP has its own heartbeat negotiation. The code above sends an application-level ping; the server (or proxy) responds, proving both directions are alive. **If a heartbeat goes unanswered, close and reconnect** — dead sockets must not linger.

Spring's server side: `setHeartbeatValue` in the STOMP config, or a `TextWebSocketHandler` responding to pings. The principle is the same on both ends: *periodic liveness proof, and reconnect when it fails*.

## Pattern 3 — Backpressure and Buffering

A server can push faster than a client can render. Without care, the browser's message queue grows without bound — memory spikes, the UI lags, the app crawls.

```javascript
class BoundedBuffer {
  constructor(limit = 100) { this.queue = []; this.limit = limit; this.processing = false; }

  push(item) {
    if (this.queue.length >= this.limit) {
      // Oldest-first drop: better than unbounded growth for real-time feeds
      this.queue.shift();
      this.overflows++;                     // count drops for diagnostics
    }
    this.queue.push(item);
    this.drain();
  }

  drain() {
    if (this.processing) return;            // one drain loop at a time
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      render(item);                          // the actual UI work
    }
    this.processing = false;
  }
}
```

The concepts:

- **Bound the queue** — a fixed-size buffer, not an endless array.
- **Drop policy** — for real-time feeds, dropping *oldest* (or *newest*) is better than unbounded memory growth. (For reliable data — payments, order updates — never drop; use request/response or a durable queue instead.)
- **Single drain loop** — one consumer at a time, so render work doesn't interleave.
- **Count overflows** — measure the drops; if `overflows` grows, the client is too slow for the feed rate — a signal to batch, throttle, or reduce the server's rate.

## The SockJS Angle

SockJS (from the STOMP lesson) bundles *some* of this: it provides HTTP fallbacks when WebSocket is unavailable. But **SockJS does not auto-reconnect with backoff** — you still implement the reconnection pattern on top. Treat SockJS as a transport layer, not a reliability layer.

## The Complete Client Checklist

- [ ] Reconnect with exponential backoff + jitter; reset on success.
- [ ] Heartbeat every ~30s; treat missed pongs as death → reconnect.
- [ ] Bound the inbound queue; drop policy + overflow counters.
- [ ] Buffer outbound sends when disconnected (queue them, flush on reconnect) — or drop + notify, per use case.
- [ ] Surface state to the UI: "connecting…", "live", "reconnecting…", "offline".
- [ ] Re-subscribe after reconnect (STOMP subscriptions die with the socket).
- [ ] Idempotent handling of redelivered messages (at-least-once delivery).

## Common Beginner Pitfalls

1. **No reconnection** — a blip kills the feature until a page reload.
2. **Fixed-interval reconnect** — a stampede after an outage; exponential + jitter.
3. **No heartbeat** — proxies kill idle sockets silently; the UI lies about being connected.
4. **Unbounded buffering** — a bursty server OOMs the browser tab.
5. **No re-subscribe on reconnect** — the socket is back but the client hears nothing (STOMP subscriptions are per-connection).
6. **No state surfaced to the UI** — users can't tell "live" from "silently dead".

## Key Takeaways

- Reliability lives on the client: reconnection, heartbeats, and bounded buffers.
- Exponential backoff with jitter prevents reconnect stampedes.
- Heartbeats keep sockets alive through proxies and prove liveness.
- Bound inbound queues; drop-oldest for real-time feeds; count overflows.
- Re-subscribe after reconnect; treat messages as at-least-once (idempotent handlers).
- Surface connection state to the UI — "connected" should be true.
