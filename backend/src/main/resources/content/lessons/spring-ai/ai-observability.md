---
title: Observability & Evaluation for AI Apps
summary: Tracing prompts, tracking tokens and cost, evaluating answer quality, and regression-testing AI features.
order: 7
minutes: 15
topics: [observability, evaluation, tracing, tokens]
docs:
  - https://docs.spring.io/spring-ai/reference/observability/index.html
  - https://docs.spring.io/spring-ai/reference/testing.html
---

# Observability & Evaluation for AI Apps

## The new things to observe

LLM apps add dimensions traditional apps don't have: **prompts**, **tokens**, **cost**, **latency**, **model**, and **quality**. Spring AI instruments all of it with Micrometer.

## Tracing & metrics out of the box

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry</groupId>
    <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

With the bridge on the classpath, Spring AI emits **spans** for model calls — request/response, tokens, model, and embedding/vector-store operations. Attach a trace id to every chat turn:

```java
// propagate the request's trace id into the prompt logging:
String traceId = TraceContextHolder.getCurrentSpanContext().getTraceId();
log.info("chat trace={} question={}", traceId, question);
```

## Tokens & cost: measure money

```java
ChatResponse response = chatClient.prompt().user(q).call().chatResponse();
TokenUsage usage = response.getMetadata().getUsage();
// usage.getPromptTokens(), usage.getCompletionTokens(), usage.getTotalTokens()

registry.counter("ai.tokens", "type", "prompt").increment(usage.getPromptTokens());
registry.counter("ai.tokens", "type", "completion").increment(usage.getCompletionTokens());
registry.counter("ai.cost", "model", modelName).increment(estimateCost(usage));
```

Track tokens per user (abuse detection), per feature (cost attribution), per model.

## Latency & errors

```java
Timer.Sample sample = Timer.start(registry);
try {
    return chatClient.prompt()...call().content();
} finally {
    sample.stop(registry.timer("ai.call.duration", "model", modelName));
}
// alert on: p95 latency, error rate, cost/day
```

## Evaluation: does it actually answer well?

Quality isn't a metric endpoint — it's a **test discipline**:

```java
@Test
void rag_answers_from_context_not_hallucination() {
    String answer = ragService.ask("What does spring-boot-starter-web include?");

    assertThat(answer).contains("Tomcat");
    assertThat(answer).contains("Jackson");
}
```

The org-standard layers:

1. **Golden set** — 20–50 curated Q/A pairs per feature.
2. **Retrieval eval** — did `similaritySearch` surface the right doc? (hit rate)
3. **Answer eval** — LLM-as-judge or human review: faithfulness (does it stay in context?), relevance, tone.
4. **CI regression** — golden-set runs in CI with a pinned model/version; alerts when quality drops.

```java
// LLM-as-judge: score faithfulness on a scale
String score = judgeClient.prompt()
        .user("""
                Answer: {answer}
                Context: {context}
                Score 1-5 how faithful the answer is to the context, and explain.
                """)
        .call().content();
```

## Prompt versioning

Prompts are code that changes behavior:

```java
public final class Prompts {
    public static final String SUPPORT_V1 = "You are...";   // keep old versions around
    public static final String SUPPORT_V2 = "You are... (revised)";
}
```

Version prompts, log which version produced which answer, and A/B before shipping a prompt change.

> **Why it matters (organizational view)** — AI features fail *softly* (confident wrong answers), so they need the same discipline as any feature: traces, cost dashboards, and automated evaluation. The org bar: every AI feature ships with (1) traces for every model call, (2) token/cost per feature, (3) a golden set in CI. That's how "AI is a black box" becomes "AI is an observable, testable component."

## Key takeaways

- Micrometer/OTel tracing covers model calls by default; add it and see the spans.
- Measure tokens + cost per feature and user; alert on p95 latency.
- Golden sets + retrieval eval + LLM-as-judge = quality regression tests.
- Version prompts and log which version answered.

**Official docs:** [Observability](https://docs.spring.io/spring-ai/reference/observability/index.html) · [Testing](https://docs.spring.io/spring-ai/reference/testing.html)
