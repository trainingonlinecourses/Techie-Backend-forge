---
title: Module Services — ServiceLoader and Provides/Uses
summary: How JPMS services work, the provides/uses mechanism, ServiceLoader integration, and how to create pluggable architectures with modules.
order: 3
minutes: 20
topics: [services, service-loader, provides, uses, spi, pluggable]
docs:
  - https://docs.oracle.com/en/java/javase/17/language/module-system.html
---

## The Concept, From Zero

JPMS services let modules expose implementations through interfaces without revealing the implementation class. This is the module system's version of the Service Provider Interface (SPI).

```java
// Module A: defines the service interface
module payment.api {
    exports com.payment.api;
}

// Module B: provides an implementation
module payment.stripe {
    requires payment.api;
    provides com.payment.api.PaymentProvider
        with com.stripe.StripePaymentProvider;
}

// Module C: uses the service
module checkout {
    requires payment.api;
    uses com.payment.api.PaymentProvider;
}
```

---

## Line-by-Line Walkthrough

```java
// --- Module A: payment-api/src/module-info.java ---
module payment.api {
    exports com.payment.api;
}

// --- PaymentProvider.java (in payment-api) ---
package com.payment.api;
public interface PaymentProvider {
    boolean charge(double amount, String currency);
    String getName();
}

// --- Module B: payment-stripe/src/module-info.java ---
module payment.stripe {
    requires payment.api;
    provides com.payment.api.PaymentProvider
        with com.stripe.StripePaymentProvider;
}

// --- StripePaymentProvider.java (in payment-stripe) ---
package com.stripe;
import com.payment.api.PaymentProvider;

public class StripePaymentProvider implements PaymentProvider {
    @Override
    public boolean charge(double amount, String currency) {
        System.out.println("Stripe charging " + amount + " " + currency);
        return true;
    }

    @Override
    public String getName() { return "Stripe"; }
}

// --- Module C: checkout/src/module-info.java ---
module checkout {
    requires payment.api;
    uses com.payment.api.PaymentProvider;
}

// --- CheckoutService.java (in checkout) ---
package com.checkout;
import com.payment.api.PaymentProvider;
import java.util.ServiceLoader;

public class CheckoutService {
    public void checkout(double amount) {
        ServiceLoader<PaymentProvider> providers = ServiceLoader.load(PaymentProvider.class);
        PaymentProvider provider = providers.findFirst()
            .orElseThrow(() -> new RuntimeException("No payment provider available"));

        provider.charge(amount, "USD");
        System.out.println("Paid via: " + provider.getName());
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Pluggable logging

```java
module logging.api {
    exports com.logging.api;
}

module logging.logback {
    requires logging.api;
    provides com.logging.api.LoggerProvider
        with com.logging.logback.LogbackLoggerProvider;
}

module logging.log4j {
    requires logging.api;
    provides com.logging.api.LoggerProvider
        with com.logging.log4j.Log4jLoggerProvider;
}
```

### Scenario 2: Multiple providers

```java
// Get all providers, not just the first
ServiceLoader<PaymentProvider> providers = ServiceLoader.load(PaymentProvider.class);
for (PaymentProvider provider : providers) {
    System.out.println("Available: " + provider.getName());
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `uses` in consumer module | ServiceLoader finds nothing | Add `uses com.example.Service` |
| Wrong class name in `provides` | ServiceLoader throws ServiceConfigurationError | Verify FQCN matches |
| Not having module-info.java | Module not recognized | Create module-info.java |
| Forgetting `requires` on service API module | Compilation error | Add `requires service.api` |
