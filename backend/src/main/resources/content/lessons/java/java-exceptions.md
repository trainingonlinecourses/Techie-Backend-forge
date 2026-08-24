---
title: Java Exception Handling — try/catch, throw/throws, and Recovery Strategies
summary: The exception hierarchy explained for beginners: checked vs unchecked, try-with-resources, custom exceptions, multi-catch, and how organizations use exception handling for retry logic, circuit breakers, and audit trails.
order: 4
minutes: 30
topics: [exceptions, try-catch, checked-unchecked, custom-exceptions, try-with-resources, exception-hierarchy, throw-throws, multi-catch]
docs:
  - https://docs.oracle.com/javase/tutorial/essential/exceptions/
  - https://docs.oracle.com/javase/tutorial/essential/exceptions/catchOrDeclare.html
---

# Java Exception Handling — try/catch, throw/throws, and Recovery Strategies

## What is an exception?

An **exception** is Java's way of saying "something went wrong." When an error occurs (file not found, network timeout, divide by zero), Java creates an exception object and "throws" it. If nobody catches it, the program crashes.

**Beginner mental model:** An exception is like a fire alarm. When something goes wrong (fire), the alarm goes off (exception is thrown). If someone handles it (catches it), the situation is managed. If nobody catches it, the whole building shuts down (program crashes).

```java
// This code will CRASH if the file doesn't exist:
FileReader reader = new FileReader("config.txt");  // throws FileNotFoundException if file missing
// Without try/catch, the program stops here with an ugly error message

// This code HANDLES the error gracefully:
try {
    FileReader reader = new FileReader("config.txt");  // might throw exception
    // ... use the file
} catch (FileNotFoundException e) {                     // catch the specific exception
    System.out.println("Config file not found, using defaults");  // recover gracefully
    // program continues running instead of crashing
}
```

## The Exception Hierarchy — why there are two types

```
Throwable
├── Error (JVM problems — don't catch these)
│   ├── OutOfMemoryError
│   ├── StackOverflowError
│   └── VirtualMachineError
└── Exception (program problems — catch these!)
    ├── RuntimeException (UNCHECKED — compiler doesn't force you to catch)
    │   ├── NullPointerException
    │   ├── IllegalArgumentException
    │   ├── ArrayIndexOutOfBoundsException
    │   └── ClassCastException
    └── IOException (CHECKED — compiler forces you to handle or declare)
        ├── FileNotFoundException
        ├── SocketTimeoutException
        └── SQLException
```

### Checked vs Unchecked — the critical difference

**Checked exceptions** (IOException, SQLException, etc.):
- The compiler FORCES you to either catch them or declare them with `throws`.
- They represent recoverable errors (file not found, network timeout).
- You MUST handle them — the code won't compile otherwise.

```java
// CHECKED exception — compiler requires handling
public void readFile(String path) throws IOException {  // OPTION 1: declare with throws
    FileReader reader = new FileReader(path);  // FileReader constructor throws checked IOException
    // If you don't add "throws IOException" above, this won't compile
}

// OPTION 2: catch and handle
public void readFile(String path) {
    try {
        FileReader reader = new FileReader(path);  // might throw IOException
        // ... use the file
    } catch (IOException e) {                       // MUST catch it — compiler enforces this
        System.out.println("Failed to read: " + e.getMessage());
    }
}
```

**Unchecked exceptions** (RuntimeException and its subclasses):
- The compiler does NOT force you to catch them.
- They represent programming bugs (null pointer, array index, illegal argument).
- You CAN catch them, but the convention is to fix the bug instead.

```java
// UNCHECKED exception — compiler doesn't force you to catch
public int divide(int a, int b) {
    return a / b;  // ArithmeticException if b == 0 — but compiler doesn't force try/catch
    // The convention: check for zero before dividing, don't catch the exception
}

// BETTER: prevent the exception
public int divide(int a, int b) {
    if (b == 0) {
        throw new ArithmeticException("Cannot divide by zero");  // explicit message
    }
    return a / b;
}
```

## try-catch-finally — the basic structure

```java
try {
    // Code that MIGHT throw an exception
    String data = readFile("important.txt");
    int value = Integer.parseInt(data);
    System.out.println("Value: " + value);

} catch (FileNotFoundException e) {
    // Runs if FileNotFoundException is thrown
    // 'e' is the exception object — contains error message and stack trace
    System.out.println("File not found: " + e.getMessage());
    useDefaultValue();  // recover with a default

} catch (NumberFormatException e) {
    // Runs if Integer.parseInt throws NumberFormatException
    // You can catch multiple different exceptions
    System.out.println("Invalid number format: " + e.getMessage());

} catch (IOException e) {
    // Runs if any other IOException occurs
    System.out.println("IO error: " + e.getMessage());

} finally {
    // ALWAYS runs — whether an exception occurred or not
    // Used for cleanup: closing files, releasing resources
    System.out.println("Cleanup complete");
    // This runs even if you return, break, or throw in the catch block
}
```

## Multi-catch — handling multiple exceptions the same way

```java
// OLD WAY: duplicate code for each exception type
try {
    processData();
} catch (FileNotFoundException e) {
    log.error("File error: " + e.getMessage());
    alertAdmin();
} catch (SocketException e) {
    log.error("Network error: " + e.getMessage());   // same code!
    alertAdmin();                                      // same code!
} catch (SQLException e) {
    log.error("Database error: " + e.getMessage());   // same code!
    alertAdmin();                                      // same code!
}

// MODERN WAY: multi-catch (Java 7+) — one block for multiple exceptions
try {
    processData();
} catch (FileNotFoundException | SocketException | SQLException e) {
    // Runs for ANY of these three exception types
    log.error("Error: " + e.getMessage());
    alertAdmin();
}
```

## try-with-resources — automatic cleanup

```java
// OLD WAY: manual close — if an exception occurs, close() might not run
BufferedReader reader = null;
try {
    reader = new BufferedReader(new FileReader("data.txt"));
    String line = reader.readLine();
    // If readLine() throws, reader.close() is NEVER called — resource leak!
} catch (IOException e) {
    System.out.println("Error");
} finally {
    if (reader != null) {
        try {
            reader.close();  // ugly, verbose, error-prone
        } catch (IOException e) {
            // swallow close exception — messy!
        }
    }
}

// MODERN WAY: try-with-resources (Java 7+) — auto-closes, even on exception
try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
    String line = reader.readLine();
    // If readLine() throws, reader.close() is AUTOMATICALLY called
    // No finally block needed — Java handles it
} catch (IOException e) {
    System.out.println("Error: " + e.getMessage());
}

// Multiple resources — closed in reverse order
try (var connection = dataSource.getConnection();
     var stmt = connection.prepareStatement("SELECT * FROM users");
     var rs = stmt.executeQuery()) {
    while (rs.next()) {
        System.out.println(rs.getString("name"));
    }
}  // rs closes first, then stmt, then connection — automatically
```

## throw vs throws — the difference

```java
// THROWS: declares that a method MIGHT throw this exception (in the method signature)
public void connect(String url) throws IOException {   // "throws" = declaration
    // ... connection logic that might fail
}

// THROW: actually creates and throws an exception (in the method body)
public void setAge(int age) {
    if (age < 0) {
        throw new IllegalArgumentException("Age cannot be negative: " + age);  // "throw" = action
    }
    this.age = age;
}
```

**Beginner rule of thumb:**
- `throws` = promise: "I might let this exception escape my method"
- `throw` = action: "I'm throwing this exception RIGHT NOW"

## Custom exceptions — creating your own error types

```java
// Custom CHECKED exception — for recoverable business errors
public class InsufficientFundsException extends Exception {
    private final String accountId;
    private final BigDecimal attemptedAmount;
    private final BigDecimal currentBalance;

    public InsufficientFundsException(String accountId, BigDecimal attempted, BigDecimal current) {
        super("Cannot withdraw " + attempted + " from account " + accountId
              + " — balance is only " + current);
        this.accountId = accountId;
        this.attemptedAmount = attempted;
        this.currentBalance = current;
    }

    // Getters for programmatic access to error details
    public String getAccountId() { return accountId; }
    public BigDecimal getAttemptedAmount() { return attemptedAmount; }
    public BigDecimal getCurrentBalance() { return currentBalance; }
}

// Custom UNCHECKED exception — for programming errors / validation failures
public class InvalidOrderStateException extends RuntimeException {
    public InvalidOrderStateException(String message) {
        super(message);
    }

    // Factory method for readable construction
    public static InvalidOrderStateException cannotShip(String orderId, String currentState) {
        return new InvalidOrderStateException(
            "Order " + orderId + " cannot be shipped — current state: " + currentState);
    }
}

// Using custom exceptions:
public class AccountService {
    public void withdraw(String accountId, BigDecimal amount) throws InsufficientFundsException {
        Account account = repository.findById(accountId);
        if (amount.compareTo(account.getBalance()) > 0) {
            throw new InsufficientFundsException(accountId, amount, account.getBalance());
            // Caller can catch this specific exception and handle it appropriately
        }
        account.debit(amount);
        repository.save(account);
    }
}
```

## How we use it in organizations

### Scenario 1: Layered exception handling in a web application

```java
// CONTROLLER layer: catches all exceptions, returns HTTP responses
@RestController
public class OrderController {

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(@RequestBody CreateOrderRequest req) {
        try {
            Order order = orderService.create(req);
            return ResponseEntity.ok(order);
        } catch (InvalidOrderException e) {
            // Return 400 Bad Request with the error message
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (InsufficientFundsException e) {
            // Return 402 Payment Required
            return ResponseEntity.status(402).body(Map.of(
                "error", "Insufficient funds",
                "attempted", e.getAttemptedAmount(),
                "available", e.getCurrentBalance()
            ));
        } catch (Exception e) {
            // Unexpected error — return 500 but DON'T expose internal details
            log.error("Unexpected error creating order", e);
            return ResponseEntity.status(500).body(Map.of("error", "Internal server error"));
        }
    }
}

// SERVICE layer: throws business exceptions, doesn't catch them
@Service
public class OrderService {
    public Order create(CreateOrderRequest req) throws InvalidOrderException, InsufficientFundsException {
        // Validation — throw specific exception with context
        if (req.items() == null || req.items().isEmpty()) {
            throw new InvalidOrderException("Order must have at least one item");
        }

        // Business logic — let exceptions propagate to controller
        Money total = calculateTotal(req.items());
        accountService.debit(req.accountId(), total);
        return orderRepository.save(new Order(req, total));
    }
}
```

### Scenario 2: Retry logic with exception classification

```java
public class ResilientHttpClient {

    private static final int MAX_RETRIES = 3;

    public String executeWithRetry(HttpRequest request) {
        int attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                return httpClient.execute(request);  // might throw
            } catch (SocketTimeoutException e) {
                // TRANSIENT error — worth retrying
                attempt++;
                long delay = (long) Math.pow(2, attempt) * 1000;  // exponential backoff: 2s, 4s
                log.warn("Timeout on attempt {}/{} — retrying in {}ms", attempt, MAX_RETRIES, delay);
                Thread.sleep(delay);
            } catch (ConnectException e) {
                // TRANSIENT — server might be restarting
                attempt++;
                Thread.sleep(2000);
            } catch (IOException e) {
                // PERMANENT error — don't retry
                throw new ExternalServiceException("Request failed: " + e.getMessage(), e);
            }
        }
        throw new ExternalServiceException("Max retries (" + MAX_RETRIES + ") exceeded");
    }
}
```

### Scenario 3: Exception logging with context

```java
// Custom exception that carries context for debugging
public class OrderProcessingException extends RuntimeException {
    private final String orderId;
    private final String step;
    private final Map<String, Object> context;

    public OrderProcessingException(String orderId, String step, String message, Throwable cause) {
        super(message, cause);
        this.orderId = orderId;
        this.step = step;
        this.context = Map.of(
            "orderId", orderId,
            "step", step,
            "timestamp", Instant.now()
        );
    }
}

// Usage — exception carries all debugging context
try {
    paymentGateway.charge(order);
} catch (PaymentException e) {
    throw new OrderProcessingException(
        order.getId(),           // which order
        "PAYMENT",               // which step failed
        "Payment failed for order " + order.getId(),
        e                        // original cause — preserves stack trace
    );
    // The log shows: "Payment failed for order 12345" with full context
    // No need to dig through code to figure out which order and which step failed
}
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Catching `Exception` or `Throwable` | Hides bugs — catches everything including NPE | Catch specific exceptions |
| Swallowing exceptions (empty catch block) | Silent failures — bugs invisible | Always log or rethrow |
| Using exceptions for flow control | Slow — exception creation is expensive | Use if/else for expected cases |
| Throwing checked exceptions from utilities | Forces every caller to handle or declare | Use unchecked for programming errors |
| Not closing resources in finally/try-with-resources | Resource leaks — file handles, DB connections | Always use try-with-resources |
| Catching Exception after specific exceptions | Specific catch blocks become unreachable | Order from most specific to most general |
