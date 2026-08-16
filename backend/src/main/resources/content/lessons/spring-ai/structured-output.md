---
title: Structured Output & Function Calling
summary: Getting typed results from models with BeanOutputConverter, and letting the model call your Java methods as tools.
order: 3
minutes: 18
topics: [structured-output, function-calling, tools, beanoutputconverter]
docs:
  - https://docs.spring.io/spring-ai/reference/api/structured-output-converter.html
  - https://docs.spring.io/spring-ai/reference/api/functions.html
---

# Structured Output & Function Calling

## Why typed output

LLMs return text. Production code needs `record`s. Spring AI's converters turn model output into Java types.

## BeanOutputConverter: JSON → typed object

```java
public record FraudDecision(boolean approved, String riskLevel, List<String> reasons) {}

BeanOutputConverter<FraudDecision> converter = new BeanOutputConverter<>(FraudDecision.class);

String response = chatClient.prompt()
        .user(u -> u
                .text("""
                        Classify this transaction as approved or rejected, with reasons.
                        Transaction: {txn}
                        {format}
                        """)
                .param("txn", txn.toString())
                .param("format", converter.getFormat()))     // "Respond in JSON with this schema..."
        .call()
        .content();

FraudDecision decision = converter.convert(response);         // parse + validate
```

The converter injects the JSON schema into the prompt and parses the model's answer into the record. Guard with validation (`@Valid`) — models can return fields that don't exist.

## MapOutputConverter: when you just need key/values

```java
MapOutputConverter converter = new MapOutputConverter();
Map<String, Object> summary = converter.convert(response);
```

## Function calling: the model calls YOUR code

The model can invoke registered Java methods as **tools**. This is how assistants take real actions: look up an order, compute a price, write to a log.

```java
@Component
public class OrderTools {

    private final OrderRepository orders;

    @Tool(description = "Returns the status and total of an order given its order id")
    public String orderStatus(String orderId) {
        return orders.findById(orderId)
                .map(o -> "Order %s is %s, total %s".formatted(o.getId(), o.getStatus(), o.getTotal()))
                .orElse("Order not found: " + orderId);
    }
}
```

```java
@Configuration
public class AiConfig {
    @Bean
    ChatClient chatClient(ChatClient.Builder builder, OrderTools tools) {
        return builder
                .defaultSystem("You are an order assistant. Use the orderStatus tool to answer questions about orders.")
                .defaultTools(ToolCallbacks.from(tools))          // register the tool
                .build();
    }
}
```

Now: *"What's the status of order 1042?"* → the model calls `orderStatus("1042")`, gets the result, and answers from it.

## How function calling works (the loop)

```
1. Prompt + tool definitions → model
2. Model returns: "call orderStatus(orderId=1042)"  (not the final answer)
3. Spring AI invokes your method with the parsed args
4. Result returned to the model
5. Model produces the final answer grounded in the tool result
```

Spring AI handles steps 2–4 for you via `ToolCallbacks`.

## Tool design rules

| Rule | Why |
|---|---|
| Sharp, narrow `@Tool` descriptions | Models pick tools by description — vague = wrong tool |
| Idempotent tools | The model may call twice or retry |
| No secrets in results | Tool output goes back into the prompt (and logs) |
| Validate args in the tool | Model-generated args can be garbage |
| Default system prompt names the tools | Guides the model to use them |

> **Why it matters (organizational view)** — Structured output + tools are how AI leaves the chat window and enters the business: a support bot that can actually check order status, an assistant that drafts then *creates* a ticket via a tool. Org standards: typed records for every model call, tool methods reviewed like public APIs (they ARE called by an unpredictable actor), and logging of every tool invocation for audit.

## Key takeaways

- `BeanOutputConverter<T>` = schema-injected prompt + typed parse; validate results.
- `@Tool` methods + `ToolCallbacks.from(...)` = the model can call your code.
- Descriptions guide tool selection; keep them precise.
- Tools are public surface — idempotent, validated, logged.

**Official docs:** [Structured output](https://docs.spring.io/spring-ai/reference/api/structured-output-converter.html) · [Function calling](https://docs.spring.io/spring-ai/reference/api/functions.html)
