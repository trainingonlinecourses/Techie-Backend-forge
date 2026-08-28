---
title: Prompt Engineering — Designing Effective AI Prompts
summary: System prompts, few-shot examples, chain-of-thought, structured output prompts, prompt templates, and the techniques that make AI responses accurate and consistent. Beginner-friendly with line-by-line code.
order: 11
minutes: 22
topics: [prompt engineering, system prompt, few-shot, chain-of-thought, prompt templates, output formatting, temperature, token management]
docs:
  - https://docs.spring.io/spring-ai/reference/api/chatclient.html
  - https://docs.spring.io/spring-ai/reference/api/prompt-template.html
---

# Prompt Engineering — Designing Effective AI Prompts

## What is Prompt Engineering? (From Zero)

The same AI model can give wildly different answers depending on how you ask the question. **Prompt engineering** is the art and science of crafting prompts that consistently produce accurate, useful, and well-formatted responses.

Think of it like giving instructions to a new employee:
- Bad: "Do the report" (vague, unpredictable result)
- Good: "Create a sales report for Q3 2024, include revenue by region, format as a table, highlight any region with >20% growth" (specific, predictable result)

### The Key Elements

| Element | What It Does | Example |
|---|---|---|
| **System prompt** | Sets the AI's role, constraints, and behavior | "You are a Java tutor..." |
| **User prompt** | The actual question or task | "Explain HashMap..." |
| **Few-shot examples** | Show the AI what good output looks like | "Here's an example: ..." |
| **Temperature** | Controls randomness (0=deterministic, 1=creative) | 0.3 for factual, 0.8 for creative |

---

## The Code — Line by Line

### 1. System Prompt Patterns

```java
@Service
public class PromptPatterns {

    private final ChatClient chatClient;

    // Pattern 1: Role + Constraints + Format
    public String explainConcept(String topic) {
        return chatClient.prompt()
            .system("""
                ROLE: You are a senior Java developer with 10 years of experience.
                CONSTRAINTS:
                - Explain concepts as if teaching a junior developer
                - Use real-world analogies before technical explanations
                - Always include a code example
                - Never use jargon without defining it first
                FORMAT:
                1. Analogy (2-3 sentences)
                2. Technical explanation (3-5 sentences)
                3. Code example with comments
                4. Common mistake to avoid
                """)
            .user("Explain " + topic)
            .call()
            .content();
    }

    // Pattern 2: Chain of Thought (step-by-step reasoning)
    public String solveProblem(String problem) {
        return chatClient.prompt()
            .system("""
                You are a problem solver. Think step by step:
                1. Identify the key information
                2. Consider edge cases
                3. Work through the solution step by step
                4. Verify your answer
                Show your reasoning process, not just the final answer.
                """)
            .user(problem)
            .call()
            .content();
    }

    // Pattern 3: Output format control
    public String generateStructured(String task) {
        return chatClient.prompt()
            .system("""
                Generate output in EXACTLY this JSON format:
                {
                    "title": "string",
                    "summary": "string (max 100 words)",
                    "keyPoints": ["string", "string", "string"],
                    "codeExample": "string (valid Java code)",
                    "difficulty": "BEGINNER|INTERMEDIATE|ADVANCED"
                }
                Return ONLY the JSON, no markdown or explanation.
                """)
            .user(task)
            .call()
            .content();
    }
}
```

### 2. Few-Shot Examples

```java
// Show the AI what good output looks like:
public String classifyCode(String codeSnippet) {
    return chatClient.prompt()
        .system("""
            Classify Java code snippets by their design pattern.
            Here are examples of correct classifications:

            Example 1:
            Input: "public class Singleton { private static Singleton instance; private Singleton(){} public static Singleton getInstance(){ if(instance==null) instance=new Singleton(); return instance; } }"
            Output: {"pattern": "Singleton", "confidence": 0.95, "explanation": "Private constructor + static getInstance = classic Singleton"}

            Example 2:
            Input: "public interface Observer { void update(String event); } public class EventBus { private List<Observer> observers = new ArrayList<>(); public void notify(String event) { observers.forEach(o -> o.update(event)); } }"
            Output: {"pattern": "Observer", "confidence": 0.90, "explanation": "Subject maintains list of observers, notifies on events"}

            Now classify this code:
            """)
            .user(codeSnippet)
            .call()
            .content();
    }
```

### 3. Prompt Templates with Variables

```java
@Service
public class PromptTemplateService {

    private final ChatClient chatClient;

    // Template with placeholders:
    public String generateLesson(LessonRequest request) {
        return chatClient.prompt()
            .system("""
                You are a {topic} expert teaching {audience} students.
                The lesson should be approximately {minutes} minutes long.
                Difficulty level: {difficulty}.
                """)
            .user("""
                Create a lesson on: {topic}
                Include:
                1. Concept explanation
                2. Code examples (Java)
                3. Real-world scenario
                4. Practice exercise
                """)
            .param("topic", request.topic())               // Fill in template variables
            .param("audience", request.audience())
            .param("minutes", request.minutes())
            .param("difficulty", request.difficulty())
            .call()
            .content();
    }

    // Template for code review:
    public String reviewCode(String code, String standards) {
        return chatClient.prompt()
            .system("""
                You are a code reviewer. Review against these standards:
                {standards}

                Rate each finding: LOW, MEDIUM, HIGH, CRITICAL
                Format: line number, severity, description, suggestion
                """)
            .user("Review this code:\n```java\n{code}\n```")
            .param("standards", standards)
            .param("code", code)
            .call()
            .content();
    }
}
```

### 4. Temperature and Model Selection

```java
@Configuration
public class AiModelConfig {

    // Factual tasks: low temperature (deterministic)
    @Bean
    public ChatModel factualModel() {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .model("gpt-4o")
            .temperature(0.1)               // Very deterministic — same input = same output
            .build();
    }

    // Creative tasks: higher temperature (more variety)
    @Bean
    public ChatModel creativeModel() {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .model("gpt-4o")
            .temperature(0.8)               // More creative — different outputs each time
            .build();
    }

    // Code generation: very low temperature
    @Bean
    public ChatModel codeModel() {
        return OpenAiChatModel.builder()
            .apiKey(apiKey)
            .model("gpt-4o")
            .temperature(0.0)               // Maximum determinism for code
            .build();
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Consistent API Response Generation

```java
// Generate consistent, structured responses for an AI tutor:
public LessonResponse generateLesson(String topic) {
    return chatClient.prompt()
        .system("""
            You are BackendForge Academy's AI tutor. Always respond with:
            - Title: Clear, descriptive lesson title
            - Summary: 2-3 sentence overview
            - Concepts: List of key concepts covered
            - Code Example: Working Java code with line-by-line comments
            - Exercise: Practice problem with hints

            Tone: Professional, encouraging, beginner-friendly.
            Never use outdated Java (always Java 17+).
            Never skip error handling in examples.
            """)
        .user("Create a lesson on: " + topic)
        .call()
        .entity(LessonResponse.class);     // Parse into structured object
}
```

### Scenario 2: Code Review with Specific Standards

```java
public String reviewWithStandards(String code, List<String> standards) {
    String standardsText = standards.stream()
        .map(s -> "- " + s)
        .collect(Collectors.joining("\n"));

    return chatClient.prompt()
        .system("""
            You are a senior code reviewer. Review code against these standards:
            {standards}

            For each issue found:
            1. Line number (approximate)
            2. Severity: LOW | MEDIUM | HIGH | CRITICAL
            3. Category: Security | Performance | Maintainability | Bug
            4. Description of the issue
            5. Suggested fix with code

            If no issues found, respond: "Code meets all standards. No issues found."
            """)
        .param("standards", standardsText)
        .user("Review this code:\n```java\n" + code + "\n```")
        .call()
        .content();
}
```

### Scenario 3: Multi-Language Content Generation

```java
public String generateMultilingual(String content, String targetLanguage) {
    return chatClient.prompt()
        .system("""
            You are a professional translator specializing in technical content.
            Rules:
            - Preserve all code blocks unchanged
            - Keep technical terms in English with translated explanation in parentheses
            - Maintain the same formatting and structure
            - For Java terms, provide both translated and English: "HashMap (哈希映射)"
            """)
        .user("Translate to " + targetLanguage + ":\n" + content)
        .call()
        .content();
}
```

---

## Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Vague system prompts | Inconsistent, unpredictable responses | Be specific about role, format, and constraints |
| No examples (few-shot) | AI doesn't know your expected format | Include 2-3 examples of desired output |
| Temperature too high for factual tasks | AI hallucinates or gives inconsistent answers | Use 0.0-0.2 for factual tasks |
| No output format control | Response is unstructured, hard to parse | Specify JSON/markdown format explicitly |
| Prompt injection vulnerability | User input overrides system instructions | Sanitize input, use delimiters, separate system/user prompts |
| Ignoring token limits | Long conversations get truncated | Monitor token count, summarize old messages |

---

## Key Takeaways

- **System prompts** set the AI's role, constraints, and output format — always use them.
- **Few-shot examples** teach the AI your expected format — include 2-3 examples.
- **Chain-of-thought** ("think step by step") improves accuracy for complex problems.
- **Temperature**: 0.0-0.2 for factual/code, 0.5-0.7 for balanced, 0.8-1.0 for creative.
- **Prompt templates with variables** make prompts reusable and maintainable.
- **Always specify output format** — JSON, markdown, or structured text.

Official docs: [ChatClient (Spring AI)](https://docs.spring.io/spring-ai/reference/api/chatclient.html) · [Prompt Templates](https://docs.spring.io/spring-ai/reference/api/prompt-template.html)
