---
title: Productionizing AI — Costs, Guardrails & MCP
summary: Cost control, caching, fallbacks, guardrails, streaming UX and the MCP ecosystem.
order: 8
minutes: 15
topics: [production, cost, caching, guardrails, mcp]
docs:
  - https://docs.spring.io/spring-ai/reference/api/tools/mcp.html
---

# Productionizing AI — Costs, Guardrails & MCP

## Cost control

LLM calls cost money per token — the org controls it with:

| Lever | Practice |
|---|---|
| **Caching** | Cache identical prompts (Spring Cache + `@Cacheable` on the service) |
| **Model tiers** | cheap model (mini) for simple tasks; expensive only when needed |
| **Context trimming** | Keep only the last N messages; cap retrieved chunks |
| **Token budget** | Enforce a per-request max (`maxTokens`), alert on per-user spend |
| **Rate limits** | Per-user/per-key limits at the API layer |

```java
@Cacheable(cacheNames = "ai.answers", key = "#question", unless = "#result == null")
public String cachedAnswer(String question) { ... }
```

## Fallbacks & resilience

Models fail: rate limits, timeouts, provider outages. The API must survive:

```java
@Service
public class ResilientAssistant {

    public Answer answer(Question q) {
        try {
            return chatClient.prompt().user(q.text()).call().entity(Answer.class);
        } catch (Exception e) {
            log.warn("AI unavailable, using fallback: {}", e.getMessage());
            return fallbackAnswer(q);            // deterministic local answer
        }
    }
}
```

Add: timeouts (`ChatOptions` `requestTimeout`), retries with backoff (Spring Retry), and a circuit breaker (Resilience4j) for sustained outages.

## Guardrails for real users

- **Input**: rate limits, length caps, moderation (see advisors), prompt-injection checks.
- **Output**: moderation, PII redaction, no tool calls on sensitive actions without confirmation.
- **Human in the loop**: AI drafts, human approves (the safest pattern for money/security actions).

## Streaming UX: respond like a chat

Frontends expect token-by-token responses. Backend options:

1. **SSE** — Spring MVC `SseEmitter` + `.stream()` → tokens pushed over `text/event-stream`.
2. **WebFlux** — reactive `Flux<String>` (if you're on WebFlux).
3. **Polling** — generate in a job, poll for the result (batch use cases).

```java
@GetMapping(value = "/api/chat/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter stream(@RequestParam String question) {
    SseEmitter emitter = new SseEmitter(30_000L);
    chatClient.prompt().user(question).stream().content()
            .subscribe(chunk -> send(emitter, chunk), emitter::completeWithError, emitter::complete);
    return emitter;
}
```

## MCP: the ecosystem standard

**MCP** (Model Context Protocol) standardizes how AI tools talk to systems — servers expose tools/resources; clients (Claude, IDEs, your app) consume them. Spring AI has first-class MCP support:

```xml
<dependency>
    <groupId>org.springframework.ai</groupId>
    <artifactId>spring-ai-starter-mcp-client</artifactId>
</dependency>
```

One MCP server can expose your org's tools (search, ticketing, docs) to *any* MCP client — your app, Copilot, Claude Desktop. Spring AI also includes MCP **server** support to expose your `@Tool`s to the ecosystem. This is where the AI-tooling world is standardizing.

## The production AI checklist

- [ ] Timeouts, retries, fallback (never a blank 500 from a model outage)
- [ ] Token/cost metrics per user and feature
- [ ] Rate limits + moderation on inputs
- [ ] Streaming UX (SSE) for chat
- [ ] Caching for repeated questions
- [ ] Golden-set evaluation in CI
- [ ] Audit log of prompts/tools/answers
- [ ] Versioned prompts

> **Why it matters (organizational view)** — AI features ship when they're *operable*: predictable cost, graceful degradation, and auditability. The org playbook: start with fallbacks + caching + metrics, then add streaming and MCP once usage justifies it. Treat the model as an external dependency with an SLA — because that's exactly what it is.

## Key takeaways

- Cache + model tiers + token budgets = controlled cost.
- Timeout, retry, fallback, circuit-break — models are external services.
- SSE for chat UX; moderation + human-in-the-loop for sensitive actions.
- MCP standardizes tool ecosystems — Spring AI supports client and server.

**Official docs:** [MCP support](https://docs.spring.io/spring-ai/reference/api/tools/mcp.html) · [Spring AI reference](https://docs.spring.io/spring-ai/reference/)
