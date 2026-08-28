---
title: AI Agent Workflows — Autonomous Tool-Using Agents
summary: Building AI agents that call tools, make decisions, and complete multi-step tasks autonomously — function calling, tool definitions, agent loops, and multi-agent orchestration. Beginner-friendly with line-by-line code.
order: 9
minutes: 28
topics: [AI agents, tool calling, function calling, agent loop, autonomous agents, multi-agent, ReAct pattern, tool definitions]
docs:
  - https://docs.spring.io/spring-ai/reference/api/chat/functions/openai-chat-functions.html
  - https://docs.spring.io/spring-ai/reference/api/agents.html
---

# AI Agent Workflows — Autonomous Tool-Using Agents

## What is an AI Agent? (From Zero)

A regular AI chatbot answers questions from its training data. An **AI agent** can **take actions in the real world** — it can look up data in a database, call external APIs, calculate formulas, search the web, or even control other systems. It decides *which tools to use* and *in what order* to accomplish a goal.

Think of it like this:
- **Regular AI**: "According to my knowledge, the capital of France is Paris" (static knowledge)
- **AI Agent**: "Let me check the weather API... it's 22°C in Paris right now" (tool-using, dynamic)

### The Agent Loop (ReAct Pattern)

```
User: "What's the weather in Paris, and should I pack an umbrella?"

Agent thinks: I need to check the weather for Paris.
Agent calls: weatherTool.getForecast("Paris")
Agent sees: "Paris: 22°C, 80% chance of rain"

Agent thinks: 80% rain means yes, bring an umbrella.
Agent responds: "It's 22°C in Paris with an 80% chance of rain.
                 Yes, definitely pack an umbrella!"
```

The pattern is: **Reason → Act → Observe → Repeat** until the goal is achieved.

---

## The Code — Line by Line

### 1. Define a Tool (Function)

```java
// Step 1: Define what the tool does — this is a Java method with annotations
@Component
public class WeatherTools {

    private final RestTemplate weatherApi = new RestTemplate();

    // @Tool tells Spring AI: "This method is available for the AI to call"
    @Tool(description = "Get the current weather and forecast for a city. " +
                         "Returns temperature, humidity, and chance of rain.")
    public WeatherInfo getWeather(
            @ToolParam(description = "The city name, e.g. 'Paris' or 'New York'") String city
    ) {
        // Call a real weather API
        String url = "https://api.weather.example.com/forecast?city=" + city;
        return weatherApi.getForObject(url, WeatherInfo.class);
    }

    @Tool(description = "Search for restaurants in a city by cuisine type. " +
                         "Returns a list of top-rated restaurants.")
    public List<Restaurant> searchRestaurants(
            @ToolParam(description = "The city to search in") String city,
            @ToolParam(description = "Cuisine type, e.g. 'Italian', 'Japanese', 'Indian'") String cuisine
    ) {
        return restaurantService.findByCityAndCuisine(city, cuisine);
    }

    @Tool(description = "Calculate the distance between two cities in kilometers.")
    public double calculateDistance(
            @ToolParam(description = "Origin city") String from,
            @ToolParam(description = "Destination city") String to
    ) {
        return geoService.distanceKm(from, to);
    }
}

// The data classes:
public record WeatherInfo(
    String city,
    double temperatureCelsius,
    int humidityPercent,
    int rainChancePercent,
    String description
) {}

public record Restaurant(
    String name,
    String cuisine,
    double rating,
    String address,
    double priceRange  // 1-4 dollar signs
) {}
```

**Line-by-line explained:**
- `@Tool(description = "...")` — Registers this method as a tool the AI can call. The description is **critical** — the AI reads it to decide which tool to use.
- `@ToolParam(description = "...")` — Describes each parameter so the AI knows what to pass.
- The method implementation is **normal Java code** — call APIs, query databases, do calculations. The AI just triggers it.

### 2. Register Tools with ChatClient

```java
@Service
public class AiAgentService {

    private final ChatClient chatClient;
    private final WeatherTools weatherTools;
    private final RestaurantTools restaurantTools;

    public AiAgentService(ChatModel chatModel,
                          WeatherTools weatherTools,
                          RestaurantTools restaurantTools) {
        this.chatClient = ChatClient.create(chatModel);
        this.weatherTools = weatherTools;
        this.restaurantTools = restaurantTools;
    }

    // Single agent with multiple tools:
    public String askAgent(String question) {
        return chatClient.prompt()
            .system("""
                You are a helpful travel assistant. You have access to tools
                for checking weather, finding restaurants, and calculating distances.
                Use the tools to answer questions accurately. If you need multiple
                pieces of information, call the tools in sequence.
                """)
            .user(question)
            .tools(weatherTools, restaurantTools)         // Register available tools
            .call()
            .content();                                    // AI decides which tools to call
    }
}
```

**Line-by-line explained:**
- `.tools(weatherTools, restaurantTools)` — Makes these tool classes available to the AI. The AI can see the method names and descriptions.
- When the AI calls a tool, Spring AI executes the Java method and feeds the result back to the AI.
- The AI autonomously decides which tools to call and in what order — you don't write the decision logic.

### 3. The Agent Loop in Detail

```java
@Service
public class MultiStepAgent {

    private final ChatClient chatClient;

    // The agent can call tools multiple times in a conversation:
    public String executeTask(String goal) {
        ChatResponse response = chatClient.prompt()
            .system("""
                You are a research agent. Break down complex questions into steps.
                For each step, use the appropriate tool. Gather all information
                before providing a final answer. Show your reasoning.
                """)
            .user(goal)
            .tools(researchTools, calculatorTools, databaseTools)
            .call()
            .chatResponse();                               // Get full response with tool calls

        // The response may contain multiple tool call rounds:
        // Round 1: AI calls searchDatabase("recent studies on X")
        // Round 2: AI calls calculateStatistics(results)
        // Round 3: AI generates final answer with all gathered data

        return response.getResult().getOutput().getText();
    }
}
```

### 4. Tool Call Monitoring

```java
@Component
public class AgentAuditListener {

    // Listen for tool invocations (for logging, monitoring, safety):
    @EventListener
    public void onToolCall(ToolCallEvent event) {
        log.info("AI Agent called tool: {} with args: {} (result: {})",
            event.getToolName(),
            event.getArguments(),
            event.getResultPreview());
    }

    // Safety: reject dangerous tool calls:
    @EventListener
    public void onDangerousToolCall(ToolCallEvent event) {
        if ("deleteDatabase".equals(event.getToolName())) {
            throw new SecurityException("AI agent attempted dangerous operation!");
        }
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Customer Support Agent

```java
@Service
public class SupportAgent {

    @Tool(description = "Look up customer order status by order ID")
    public OrderStatus getOrderStatus(String orderId) {
        return orderService.getStatus(orderId);
    }

    @Tool(description = "Process a refund for an order. Requires order ID and reason.")
    public RefundResult processRefund(
            @ToolParam(description = "The order ID to refund") String orderId,
            @ToolParam(description = "Reason for refund") String reason
    ) {
        return refundService.process(orderId, reason);
    }

    @Tool(description = "Escalate to a human agent with a summary of the issue")
    public Escalation escalateToHuman(
            @ToolParam(description = "Summary of the customer issue") String summary,
            @ToolParam(description = "Urgency level: low, medium, high, critical") String urgency
    ) {
        return escalationService.create(summary, urgency);
    }

    public String handleCustomerRequest(String message) {
        return chatClient.prompt()
            .system("""
                You are a customer support agent for an e-commerce company.
                You can look up orders, process refunds, and escalate to humans.
                Always be helpful and empathetic. Only process refunds when the
                customer is clearly entitled (wrong item, damaged, etc.).
                Escalate to human if the issue is complex or the customer is upset.
                """)
            .user(message)
            .tools(this)                                   // All @Tool methods in this class
            .call()
            .content();
    }
}
```

### Scenario 2: Data Analysis Agent

```java
@Service
public class DataAnalysisAgent {

    @Tool(description = "Execute a SQL SELECT query against the analytics database. " +
                         "Only SELECT queries allowed — no INSERT, UPDATE, or DELETE.")
    public List<Map<String, Object>> queryDatabase(String sql) {
        if (!sql.trim().toUpperCase().startsWith("SELECT")) {
            throw new IllegalArgumentException("Only SELECT queries allowed");
        }
        return jdbcTemplate.queryForList(sql);
    }

    @Tool(description = "Create a chart from data. Accepts a title, chart type " +
                         "(bar, line, pie), and data points.")
    public String createChart(String title, String chartType, List<DataPoint> data) {
        return chartService.generate(title, chartType, data);
    }

    public String analyzeData(String question) {
        return chatClient.prompt()
            .system("""
                You are a data analyst. Use the database to query data,
                then create visualizations to answer the user's questions.
                Always explain your findings in plain language.
                """)
            .user(question)
            .tools(this)
            .call()
            .content();
    }
}
```

### Scenario 3: Multi-Agent Orchestration

```java
@Service
public class MultiAgentOrchestrator {

    // Agent 1: Research specialist
    private final ChatClient researchAgent;

    // Agent 2: Writing specialist
    private final ChatClient writingAgent;

    // Agent 3: Review specialist
    private final ChatClient reviewAgent;

    public String orchestrate(String task) {
        // Step 1: Research agent gathers information
        String research = researchAgent.prompt()
            .system("You are a research specialist. Find comprehensive information.")
            .user(task)
            .tools(searchTools, webScraperTools)
            .call()
            .content();

        // Step 2: Writing agent creates a draft
        String draft = writingAgent.prompt()
            .system("You are a professional writer. Create well-structured content.")
            .user("Based on this research: " + research + "\n\nWrite: " + task)
            .call()
            .content();

        // Step 3: Review agent checks quality
        String review = reviewAgent.prompt()
            .system("You are an editor. Review for accuracy, clarity, and completeness.")
            .user("Review and improve this draft: " + draft)
            .call()
            .content();

        return review;
    }
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Vague tool descriptions | AI picks the wrong tool or passes wrong args | Write clear, specific descriptions with examples |
| No safety guardrails | AI calls dangerous tools (delete, admin) | Add validation in tool methods, restrict tool access |
| No tool call limits | Agent loops forever calling tools | Set max tool call rounds (e.g., 10) |
| Not logging tool calls | Can't debug or audit AI decisions | Listen for ToolCallEvent and log everything |
| Exposing internal APIs as tools | AI can access sensitive data | Only expose safe, well-tested tools |
| No timeout on tools | AI hangs waiting for a slow tool | Set timeouts on all tool implementations |

---

## Key Takeaways

- **`@Tool` + `@ToolParam`** — annotate Java methods to make them available to AI agents.
- **The AI decides which tools to use** — you write the tools, the AI orchestrates the calls.
- **ReAct pattern**: Reason → Act (call tool) → Observe (get result) → Repeat until done.
- **Safety first**: validate tool inputs, log all calls, set limits on tool invocations.
- **Multi-agent orchestration** = chain multiple specialized agents for complex workflows.

Official docs: [Function Calling (Spring AI)](https://docs.spring.io/spring-ai/reference/api/chat/functions/openai-chat-functions.html) · [Agents (Spring AI)](https://docs.spring.io/spring-ai/reference/api/agents.html)
