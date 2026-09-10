---
title: Java Exception Handling — try/catch, throw/throws, and Recovery Strategies
summary: The exception hierarchy explained for beginners: checked vs unchecked, try-with-resources, custom exceptions, multi-catch, and how organizations use exception handling for retry logic, circuit breakers, and audit trails.
order: 33
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


**What this code does — step by step:**

1. This code will CRASH if the file doesn't exist:
2. `FileReader reader = new FileReader("config.txt");` — throws FileNotFoundException if file missing
3. Without try/catch, the program stops here with an ugly error message
4. This code HANDLES the error gracefully:
5. `FileReader reader = new FileReader("config.txt");` — might throw exception. ... use the file
6. `} catch (FileNotFoundException e) {` — catch the specific exception
7. `System.out.println("Config file not found, using defaults");` — recover gracefully. Program continues running instead of crashing

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        FileReader reader = new FileReader("config.txt");

        try {
            FileReader reader = new FileReader("config.txt");
        } catch (FileNotFoundException e) {
            System.out.println("Config file not found, using defaults");
        }
    }
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


**What this code does — step by step:**

1. CHECKED exception — compiler requires handling
2. `public void readFile(String path) throws IOException {` — OPTION 1: declare with throws
3. `FileReader reader = new FileReader(path);` — FileReader constructor throws checked IOException. If you don't add "throws IOException" above, this won't compile
4. OPTION 2: catch and handle
5. `FileReader reader = new FileReader(path);` — might throw IOException. ... use the file
6. `} catch (IOException e) {` — MUST catch it — compiler enforces this

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        public void readFile(String path) throws IOException {
            FileReader reader = new FileReader(path);
        }

        public void readFile(String path) {
            try {
                FileReader reader = new FileReader(path);
            } catch (IOException e) {
                System.out.println("Failed to read: " + e.getMessage());
            }
        }
    }
}
```

**Unchecked exceptions** (RuntimeException and its subclasses):
- The compiler does NOT force you to catch them.
- They represent programming bugs (null pointer, array index, illegal argument).
- You CAN catch them, but the convention is to fix the bug instead.


**What this code does — step by step:**

1. UNCHECKED exception — compiler doesn't force you to catch
2. `return a / b;` — ArithmeticException if b == 0 — but compiler doesn't force try/catch. The convention: check for zero before dividing, don't catch the exception
3. BETTER: prevent the exception
4. `throw new ArithmeticException("Cannot divide by zero");` — explicit message

The same code, clean:

```java
public int divide(int a, int b) {
    return a / b;
}

public int divide(int a, int b) {
    if (b == 0) {
        throw new ArithmeticException("Cannot divide by zero");
    }
    return a / b;
}
```

## try-catch-finally — the basic structure


**What this code does — step by step:**

1. Code that MIGHT throw an exception
2. Runs if FileNotFoundException is thrown. 'e' is the exception object — contains error message and stack trace
3. `useDefaultValue();` — recover with a default
4. Runs if Integer.parseInt throws NumberFormatException. You can catch multiple different exceptions
5. Runs if any other IOException occurs
6. ALWAYS runs — whether an exception occurred or not. Used for cleanup: closing files, releasing resources
7. This runs even if you return, break, or throw in the catch block

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        try {
            String data = readFile("important.txt");
            int value = Integer.parseInt(data);
            System.out.println("Value: " + value);

        } catch (FileNotFoundException e) {
            System.out.println("File not found: " + e.getMessage());
            useDefaultValue();

        } catch (NumberFormatException e) {
            System.out.println("Invalid number format: " + e.getMessage());

        } catch (IOException e) {
            System.out.println("IO error: " + e.getMessage());

        } finally {
            System.out.println("Cleanup complete");
        }
    }
}
```

## Multi-catch — handling multiple exceptions the same way


**What this code does — step by step:**

1. OLD WAY: duplicate code for each exception type
2. `log.error("Network error: " + e.getMessage());` — same code!
3. `alertAdmin();` — same code!
4. `log.error("Database error: " + e.getMessage());` — same code!
5. `alertAdmin();` — same code!
6. MODERN WAY: multi-catch (Java 7+) — one block for multiple exceptions
7. Runs for ANY of these three exception types

The same code, clean:

```java
try {
    processData();
} catch (FileNotFoundException e) {
    log.error("File error: " + e.getMessage());
    alertAdmin();
} catch (SocketException e) {
    log.error("Network error: " + e.getMessage());
    alertAdmin();
} catch (SQLException e) {
    log.error("Database error: " + e.getMessage());
    alertAdmin();
}

try {
    processData();
} catch (FileNotFoundException | SocketException | SQLException e) {
    log.error("Error: " + e.getMessage());
    alertAdmin();
}
```

## try-with-resources — automatic cleanup


**What this code does — step by step:**

1. OLD WAY: manual close — if an exception occurs, close() might not run
2. If readLine() throws, reader.close() is NEVER called — resource leak!
3. `reader.close();` — ugly, verbose, error-prone
4. swallow close exception — messy!
5. MODERN WAY: try-with-resources (Java 7+) — auto-closes, even on exception
6. If readLine() throws, reader.close() is AUTOMATICALLY called. No finally block needed — Java handles it
7. Multiple resources — closed in reverse order
8. `}` — rs closes first, then stmt, then connection — automatically

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new FileReader("data.txt"));
            String line = reader.readLine();
        } catch (IOException e) {
            System.out.println("Error");
        } finally {
            if (reader != null) {
                try {
                    reader.close();
                } catch (IOException e) {
                }
            }
        }

        try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
            String line = reader.readLine();
        } catch (IOException e) {
            System.out.println("Error: " + e.getMessage());
        }

        try (var connection = dataSource.getConnection();
             var stmt = connection.prepareStatement("SELECT * FROM users");
             var rs = stmt.executeQuery()) {
            while (rs.next()) {
                System.out.println(rs.getString("name"));
            }
        }
    }
}
```

## throw vs throws — the difference


**What this code does — step by step:**

1. THROWS: declares that a method MIGHT throw this exception (in the method signature)
2. `public void connect(String url) throws IOException {` — "throws" = declaration. ... connection logic that might fail
3. THROW: actually creates and throws an exception (in the method body)
4. `throw new IllegalArgumentException("Age cannot be negative: " + age);` — "throw" = action

The same code, clean:

```java
public void connect(String url) throws IOException {
}

public void setAge(int age) {
    if (age < 0) {
        throw new IllegalArgumentException("Age cannot be negative: " + age);
    }
    this.age = age;
}
```

**Beginner rule of thumb:**
- `throws` = promise: "I might let this exception escape my method"
- `throw` = action: "I'm throwing this exception RIGHT NOW"

## Custom exceptions — creating your own error types


**What this code does — step by step:**

1. Custom CHECKED exception — for recoverable business errors
2. Getters for programmatic access to error details
3. Custom UNCHECKED exception — for programming errors / validation failures
4. Factory method for readable construction
5. Using custom exceptions:
6. Caller can catch this specific exception and handle it appropriately

The same code, clean:

```java
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

    public String getAccountId() { return accountId; }
    public BigDecimal getAttemptedAmount() { return attemptedAmount; }
    public BigDecimal getCurrentBalance() { return currentBalance; }
}

public class InvalidOrderStateException extends RuntimeException {
    public InvalidOrderStateException(String message) {
        super(message);
    }

    public static InvalidOrderStateException cannotShip(String orderId, String currentState) {
        return new InvalidOrderStateException(
            "Order " + orderId + " cannot be shipped — current state: " + currentState);
    }
}

public class AccountService {
    public void withdraw(String accountId, BigDecimal amount) throws InsufficientFundsException {
        Account account = repository.findById(accountId);
        if (amount.compareTo(account.getBalance()) > 0) {
            throw new InsufficientFundsException(accountId, amount, account.getBalance());
        }
        account.debit(amount);
        repository.save(account);
    }
}
```

## How we use it in organizations

### Scenario 1: Layered exception handling in a web application


**What this code does — step by step:**

1. CONTROLLER layer: catches all exceptions, returns HTTP responses
2. Return 400 Bad Request with the error message
3. Return 402 Payment Required
4. Unexpected error — return 500 but DON'T expose internal details
5. SERVICE layer: throws business exceptions, doesn't catch them
6. Validation — throw specific exception with context
7. Business logic — let exceptions propagate to controller

The same code, clean:

```java
@RestController
public class OrderController {

    @PostMapping("/orders")
    public ResponseEntity<?> createOrder(@RequestBody CreateOrderRequest req) {
        try {
            Order order = orderService.create(req);
            return ResponseEntity.ok(order);
        } catch (InvalidOrderException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        } catch (InsufficientFundsException e) {
            return ResponseEntity.status(402).body(Map.of(
                "error", "Insufficient funds",
                "attempted", e.getAttemptedAmount(),
                "available", e.getCurrentBalance()
            ));
        } catch (Exception e) {
            log.error("Unexpected error creating order", e);
            return ResponseEntity.status(500).body(Map.of("error", "Internal server error"));
        }
    }
}

@Service
public class OrderService {
    public Order create(CreateOrderRequest req) throws InvalidOrderException, InsufficientFundsException {
        if (req.items() == null || req.items().isEmpty()) {
            throw new InvalidOrderException("Order must have at least one item");
        }

        Money total = calculateTotal(req.items());
        accountService.debit(req.accountId(), total);
        return orderRepository.save(new Order(req, total));
    }
}
```

### Scenario 2: Retry logic with exception classification


**What this code does — step by step:**

1. `return httpClient.execute(request);` — might throw
2. TRANSIENT error — worth retrying
3. `long delay = (long) Math.pow(2, attempt) * 1000;` — exponential backoff: 2s, 4s
4. TRANSIENT — server might be restarting
5. PERMANENT error — don't retry

The same code, clean:

```java
public class ResilientHttpClient {

    private static final int MAX_RETRIES = 3;

    public String executeWithRetry(HttpRequest request) {
        int attempt = 0;
        while (attempt < MAX_RETRIES) {
            try {
                return httpClient.execute(request);
            } catch (SocketTimeoutException e) {
                attempt++;
                long delay = (long) Math.pow(2, attempt) * 1000;
                log.warn("Timeout on attempt {}/{} — retrying in {}ms", attempt, MAX_RETRIES, delay);
                Thread.sleep(delay);
            } catch (ConnectException e) {
                attempt++;
                Thread.sleep(2000);
            } catch (IOException e) {
                throw new ExternalServiceException("Request failed: " + e.getMessage(), e);
            }
        }
        throw new ExternalServiceException("Max retries (" + MAX_RETRIES + ") exceeded");
    }
}
```

### Scenario 3: Exception logging with context


**What this code does — step by step:**

1. Custom exception that carries context for debugging
2. Usage — exception carries all debugging context
3. `order.getId(),` — which order
4. `"PAYMENT",` — which step failed
5. `e` — original cause — preserves stack trace
6. The log shows: "Payment failed for order 12345" with full context. No need to dig through code to figure out which order and which step failed

The same code, clean:

```java
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

try {
    paymentGateway.charge(order);
} catch (PaymentException e) {
    throw new OrderProcessingException(
        order.getId(),
        "PAYMENT",
        "Payment failed for order " + order.getId(),
        e
    );
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

