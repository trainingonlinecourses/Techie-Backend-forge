---
title: Advanced Projects — CQRS, Event Sourcing, Saga, and Distributed Patterns
summary: Build 5 advanced distributed system projects — CQRS Order System, Event Sourcing Bank, Saga Orchestration, Distributed Configuration, and Service Mesh — each demonstrating production-grade patterns for complex domains.
order: 3
minutes: 150
topics: [cqrs, event-sourcing, saga, distributed-config, service-mesh, advanced-patterns]
docs:
  - https://microservices.io/patterns/
  - https://docs.spring.io/spring-cloud/reference/
---

## Project 21: CQRS Order System

### What is CQRS?

**CQRS (Command Query Responsibility Segregation)** separates read and write operations into different models:

```
Commands (Write)          Queries (Read)
┌──────────────┐         ┌──────────────┐
│  Place Order │         │ View Order   │
│  Cancel Order│         │ List Orders  │
│  Update Stock│         │ Search       │
└──────┬───────┘         └──────┬───────┘
       │                        │
┌──────▼───────┐         ┌──────▼───────┐
│ Write Model  │────────▶│ Read Model   │
│ (PostgreSQL) │ Events  │ (Elasticsearch│
└──────────────┘         └──────────────┘
```

### Command Side

**PlaceOrderCommand.java**
```java
package com.backendforge.cqrs.command;

import java.math.BigDecimal;
import java.util.List;

public class PlaceOrderCommand {
    private String userId;
    private List<OrderItemCommand> items;
    private String shippingAddress;
    
    // Getters and Setters
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public List<OrderItemCommand> getItems() { return items; }
    public void setItems(List<OrderItemCommand> items) { this.items = items; }
    public String getShippingAddress() { return shippingAddress; }
    public void setShippingAddress(String addr) { this.shippingAddress = addr; }
    
    public static class OrderItemCommand {
        private Long productId;
        private int quantity;
        private BigDecimal price;
        
        public Long getProductId() { return productId; }
        public void setProductId(Long id) { this.productId = id; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int qty) { this.quantity = qty; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
    }
}
```

**OrderAggregate.java**
```java
package com.backendforge.cqrs.command;

import com.backendforge.cqrs.common.DomainEvent;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class OrderAggregate {
    private String orderId;
    private String userId;
    private List<OrderItem> items = new ArrayList<>();
    private OrderStatus status;
    private BigDecimal totalAmount;
    private List<DomainEvent> events = new ArrayList<>();
    
    public enum OrderStatus {
        CREATED, CONFIRMED, PAID, SHIPPED, DELIVERED, CANCELLED
    }
    
    // Factory method — creates aggregate and emits event
    public static OrderAggregate create(PlaceOrderCommand command) {
        OrderAggregate order = new OrderAggregate();
        order.orderId = java.util.UUID.randomUUID().toString();
        order.userId = command.getUserId();
        order.status = OrderStatus.CREATED;
        
        for (var item : command.getItems()) {
            order.items.add(new OrderItem(
                item.getProductId(), item.getQuantity(), item.getPrice()));
        }
        
        order.totalAmount = order.items.stream()
            .map(i -> i.getPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        order.events.add(new OrderCreatedEvent(order.orderId, order.userId, order.totalAmount));
        return order;
    }
    
    // Command handler — validates and emits events
    public void confirm() {
        if (status != OrderStatus.CREATED) {
            throw new IllegalStateException("Cannot confirm order in status: " + status);
        }
        this.status = OrderStatus.CONFIRMED;
        events.add(new OrderConfirmedEvent(orderId));
    }
    
    public void cancel() {
        if (status == OrderStatus.SHIPPED || status == OrderStatus.DELIVERED) {
            throw new IllegalStateException("Cannot cancel shipped/delivered order");
        }
        this.status = OrderStatus.CANCELLED;
        events.add(new OrderCancelledEvent(orderId));
    }
    
    // Getters
    public String getOrderId() { return orderId; }
    public String getUserId() { return userId; }
    public List<OrderItem> getItems() { return items; }
    public OrderStatus getStatus() { return status; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public List<DomainEvent> getEvents() { return events; }
    public void clearEvents() { events.clear(); }
    
    public static class OrderItem {
        private Long productId;
        private int quantity;
        private BigDecimal price;
        
        public OrderItem(Long productId, int quantity, BigDecimal price) {
            this.productId = productId;
            this.quantity = quantity;
            this.price = price;
        }
        
        public Long getProductId() { return productId; }
        public int getQuantity() { return quantity; }
        public BigDecimal getPrice() { return price; }
    }
}
```

### Event Store

**EventStore.java**
```java
package com.backendforge.cqrs.eventstore;

import com.backendforge.cqrs.common.DomainEvent;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public class EventStore {
    
    private final EventRepository repository;
    
    public EventStore(EventRepository repository) {
        this.repository = repository;
    }
    
    public void saveEvents(String aggregateId, List<DomainEvent> events) {
        int version = repository.findByAggregateId(aggregateId).size();
        for (DomainEvent event : events) {
            version++;
            EventEntity entity = new EventEntity();
            entity.setAggregateId(aggregateId);
            entity.setEventType(event.getClass().getSimpleName());
            entity.setEventData(serialize(event));
            entity.setVersion(version);
            repository.save(entity);
        }
    }
    
    public List<DomainEvent> getEvents(String aggregateId) {
        return repository.findByAggregateIdOrderByVersionAsc(aggregateId)
            .stream()
            .map(e -> deserialize(e.getEventType(), e.getEventData()))
            .toList();
    }
}
```

### Query Side

**OrderQueryService.java**
```java
package com.backendforge.cqrs.query;

import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class OrderQueryService {
    
    private final OrderReadRepository readRepository;
    
    public OrderQueryService(OrderReadRepository readRepository) {
        this.readRepository = readRepository;
    }
    
    public OrderView getOrder(String orderId) {
        return readRepository.findById(orderId)
            .orElseThrow(() -> new RuntimeException("Order not found"));
    }
    
    public List<OrderView> getOrdersByUser(String userId) {
        return readRepository.findByUserId(userId);
    }
    
    public List<OrderView> searchOrders(String keyword) {
        return readRepository.findByKeyword(keyword);
    }
    
    // Update read model when events are received
    public void onOrderCreated(OrderCreatedEvent event) {
        OrderView view = new OrderView();
        view.setOrderId(event.getOrderId());
        view.setUserId(event.getUserId());
        view.setTotalAmount(event.getTotalAmount());
        view.setStatus("CREATED");
        readRepository.save(view);
    }
    
    public void onOrderConfirmed(OrderConfirmedEvent event) {
        OrderView view = readRepository.findById(event.getOrderId())
            .orElseThrow();
        view.setStatus("CONFIRMED");
        readRepository.save(view);
    }
}
```

---

## Project 22: Event Sourcing Bank

### What is Event Sourcing?

Instead of storing current state, store **every change** as an event:

```
Traditional:        Event Sourcing:
┌──────────┐       ┌──────────────────────┐
│ Account  │       │ Events               │
│ balance: │       │ ──────────────────── │
│ $1000    │       │ AccountCreated $0    │
│          │       │ MoneyDeposited $500  │
│          │       │ MoneyDeposited $500  │
│          │       │ Total: $1000         │
└──────────┘       └──────────────────────┘
```

### BankAccount Aggregate

**BankAccount.java**
```java
package com.backendforge.bankservice.aggregate;

import com.backendforge.bankservice.event.*;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class BankAccount {
    private String accountId;
    private String ownerName;
    private BigDecimal balance = BigDecimal.ZERO;
    private AccountStatus status;
    private List<DomainEvent> changes = new ArrayList<>();
    
    public enum AccountStatus { ACTIVE, FROZEN, CLOSED }
    
    public static BankAccount open(String accountId, String ownerName, BigDecimal initialDeposit) {
        BankAccount account = new BankAccount();
        account.accountId = accountId;
        account.ownerName = ownerName;
        account.status = AccountStatus.ACTIVE;
        account.balance = initialDeposit;
        
        account.changes.add(new AccountOpenedEvent(accountId, ownerName, initialDeposit));
        account.changes.add(new MoneyDepositedEvent(accountId, initialDeposit));
        return account;
    }
    
    public void deposit(BigDecimal amount) {
        if (status != AccountStatus.ACTIVE) {
            throw new IllegalStateException("Account is not active");
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Deposit must be positive");
        }
        balance = balance.add(amount);
        changes.add(new MoneyDepositedEvent(accountId, amount));
    }
    
    public void withdraw(BigDecimal amount) {
        if (status != AccountStatus.ACTIVE) {
            throw new IllegalStateException("Account is not active");
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Withdrawal must be positive");
        }
        if (balance.compareTo(amount) < 0) {
            throw new IllegalStateException("Insufficient funds");
        }
        balance = balance.subtract(amount);
        changes.add(new MoneyWithdrawnEvent(accountId, amount));
    }
    
    public void transfer(BankAccount target, BigDecimal amount) {
        withdraw(amount);
        target.deposit(amount);
        changes.add(new TransferCompletedEvent(accountId, target.accountId, amount));
    }
    
    public void freeze() {
        status = AccountStatus.FROZEN;
        changes.add(new AccountFrozenEvent(accountId));
    }
    
    // Rebuild from events (how we get current state)
    public static BankAccount rebuild(List<DomainEvent> events) {
        BankAccount account = new BankAccount();
        for (DomainEvent event : events) {
            account.apply(event);
        }
        return account;
    }
    
    private void apply(DomainEvent event) {
        switch (event) {
            case AccountOpenedEvent e -> {
                accountId = e.getAccountId();
                ownerName = e.getOwnerName();
                balance = e.getInitialDeposit();
                status = AccountStatus.ACTIVE;
            }
            case MoneyDepositedEvent e -> balance = balance.add(e.getAmount());
            case MoneyWithdrawnEvent e -> balance = balance.subtract(e.getAmount());
            case AccountFrozenEvent e -> status = AccountStatus.FROZEN;
            default -> {}
        }
    }
    
    // Getters
    public String getAccountId() { return accountId; }
    public String getOwnerName() { return ownerName; }
    public BigDecimal getBalance() { return balance; }
    public AccountStatus getStatus() { return status; }
    public List<DomainEvent> getChanges() { return changes; }
    public void clearChanges() { changes.clear(); }
}
```

---

## Project 23: Saga Orchestration

### What is a Saga?

A Saga coordinates distributed transactions across multiple services. If one step fails, compensating transactions undo previous steps:

```
Order Saga:
1. Create Order     → ✓
2. Reserve Inventory → ✓
3. Process Payment   → ✗ FAILED
4. Compensate: Cancel Order     → ✓
5. Compensate: Release Inventory → ✓
```

### Saga Orchestrator

**OrderSagaOrchestrator.java**
```java
package com.backendforge.saga.orchestrator;

import com.backendforge.saga.service.*;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.util.UUID;

@Component
public class OrderSagaOrchestrator {
    
    private final OrderService orderService;
    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    private final ShippingService shippingService;
    private final SagaLogRepository sagaLog;
    
    public OrderSagaOrchestrator(OrderService order, InventoryService inv,
                                   PaymentService pay, ShippingService ship,
                                   SagaLogRepository log) {
        this.orderService = order;
        this.inventoryService = inv;
        this.paymentService = pay;
        this.shippingService = ship;
        this.sagaLog = log;
    }
    
    @Transactional
    public void executeOrderSaga(CreateOrderCommand command) {
        String sagaId = UUID.randomUUID().toString();
        
        try {
            // Step 1: Create order
            Order order = orderService.createPendingOrder(command);
            logStep(sagaId, "ORDER_CREATED", order.getId());
            
            // Step 2: Reserve inventory
            inventoryService.reserve(order.getId(), command.getItems());
            logStep(sagaId, "INVENTORY_RESERVED", order.getId());
            
            // Step 3: Process payment
            paymentService.charge(order.getId(), order.getTotalAmount());
            logStep(sagaId, "PAYMENT_PROCESSED", order.getId());
            
            // Step 4: Confirm order
            orderService.confirmOrder(order.getId());
            logStep(sagaId, "ORDER_CONFIRMED", order.getId());
            
            // Step 5: Schedule shipping
            shippingService.schedule(order.getId());
            logStep(sagaId, "SHIPPING_SCHEDULED", order.getId());
            
        } catch (Exception e) {
            // Compensate — undo in reverse order
            compensate(sagaId, command);
            throw new SagaFailedException("Order saga failed: " + e.getMessage(), e);
        }
    }
    
    private void compensate(String sagaId, CreateOrderCommand command) {
        var completedSteps = sagaLog.findBySagaId(sagaId);
        
        for (var step : completedSteps.reversed()) {
            try {
                switch (step.getAction()) {
                    case "SHIPPING_SCHEDULED" -> shippingService.cancel(step.getEntityId());
                    case "PAYMENT_PROCESSED" -> paymentService.refund(step.getEntityId());
                    case "INVENTORY_RESERVED" -> inventoryService.release(step.getEntityId());
                    case "ORDER_CREATED" -> orderService.cancelOrder(step.getEntityId());
                }
                logStep(sagaId, step.getAction() + "_COMPENSATED", step.getEntityId());
            } catch (Exception ex) {
                logStep(sagaId, step.getAction() + "_COMPENSATION_FAILED", step.getEntityId());
            }
        }
    }
    
    private void logStep(String sagaId, String action, Long entityId) {
        SagaLogEntry entry = new SagaLogEntry(sagaId, action, entityId);
        sagaLog.save(entry);
    }
}
```

---

## Project 24: Distributed Configuration

### Spring Cloud Config Server

**ConfigServerApplication.java**
```java
package com.backendforge.configserver;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.config.server.EnableConfigServer;

@SpringBootApplication
@EnableConfigServer
public class ConfigServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(ConfigServerApplication.class, args);
    }
}
```

### Config Client

**application.yml (client)**
```yaml
spring:
  application:
    name: order-service
  config:
    import: optional:configserver:http://localhost:8888
  cloud:
    config:
      fail-fast: true
      retry:
        max-attempts: 5
```

---

## Project 25: Service Mesh Demo

### Architecture
```
┌─────────────────────────────────────────┐
│           Service Mesh (Istio)           │
│                                          │
│  ┌─────────┐    ┌─────────┐             │
│  │ Service │←──▶│ Sidecar │             │
│  │   A     │    │ Proxy   │             │
│  └─────────┘    └────┬────┘             │
│                      │ mTLS              │
│  ┌─────────┐    ┌────▼────┐             │
│  │ Service │←──▶│ Sidecar │             │
│  │   B     │    │ Proxy   │             │
│  └─────────┘    └─────────┘             │
│                                          │
│  Features:                               │
│  - Automatic mTLS                        │
│  - Load balancing                        │
│  - Circuit breaking                      │
│  - Distributed tracing                   │
│  - Rate limiting                         │
└─────────────────────────────────────────┘
```

### Istio Configuration

**VirtualService.yaml**
```yaml
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts:
    - order-service
  http:
    - route:
        - destination:
            host: order-service
            subset: v1
          weight: 90
        - destination:
            host: order-service
            subset: v2
          weight: 10
```

---

## How to Run Advanced Projects

```bash
# CQRS Order System
cd cqrs-order-system
docker-compose up -d
# Write: curl -X POST http://localhost:8080/api/orders -d '...'
# Read: curl http://localhost:8081/api/orders/123

# Event Sourcing Bank
cd event-sourcing-bank
docker-compose up -d
# Open account: curl -X POST http://localhost:8080/api/accounts -d '...'
# Deposit: curl -X POST http://localhost:8080/api/accounts/123/deposit -d '...'
# View history: curl http://localhost:8080/api/accounts/123/events

# Saga Orchestration
cd saga-orchestration
docker-compose up -d
# Place order (triggers saga): curl -X POST http://localhost:8080/api/orders -d '...'
# Check saga status: curl http://localhost:8080/api/sagas/abc-123
```
