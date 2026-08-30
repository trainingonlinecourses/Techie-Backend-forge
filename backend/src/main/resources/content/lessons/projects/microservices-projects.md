---
title: Microservices Projects — 10 Complete Distributed Systems
summary: Build 10 real-world Spring Boot microservices — Order Processing, Auth Service, Notification, File Storage, Search, Payment Gateway, Chat System, API Gateway, Circuit Breaker Demo, and Event-Driven System — each with Docker, Kubernetes, and testing.
order: 2
minutes: 200
topics: [microservices, docker-compose, kubernetes, api-gateway, circuit-breaker, event-driven, kafka]
docs:
  - https://docs.spring.io/spring-boot/reference/microservices.html
  - https://docs.spring.io/spring-cloud/reference/
---

## Why Microservices?

Microservices split a large application into small, independent services that communicate over the network. Each service:
- Has its own database
- Can be deployed independently
- Is owned by a small team
- Fails independently

### When to Use Microservices

| Use Case | Monolith | Microservices |
|----------|----------|---------------|
| Small team (< 10) | ✅ Better | ❌ Overhead |
| Large team (> 20) | ❌ Slow | ✅ Independent |
| Simple domain | ✅ Simpler | ❌ Unnecessary |
| Complex domain | ❌ Hard to scale | ✅ Per-service scaling |
| Rapid growth | ❌ Bottleneck | ✅ Flexible |

---

## Project 11: Order Processing System

### Architecture
```
┌──────────────────────────────────────────────────────────┐
│                     API Gateway                           │
│                    (Spring Cloud Gateway)                 │
└─────────┬────────────┬────────────┬──────────────────────┘
          │            │            │
    ┌─────▼─────┐ ┌────▼─────┐ ┌───▼──────┐
    │  Order    │ │Inventory │ │ Payment  │
    │  Service  │ │ Service  │ │ Service  │
    └─────┬─────┘ └────┬─────┘ └───┬──────┘
          │            │            │
    ┌─────▼─────────────▼────────────▼──────┐
    │         PostgreSQL (per service)       │
    └────────────────────────────────────────┘
```

### Order Service

**Order.java**
```java
package com.backendforge.orderservice.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Entity
@Table(name = "orders")
public class Order {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String userId;
    
    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private List<OrderItem> items;
    
    @Enumerated(EnumType.STRING)
    private OrderStatus status = OrderStatus.CREATED;
    
    private BigDecimal totalAmount;
    private LocalDateTime createdAt = LocalDateTime.now();
    
    public enum OrderStatus {
        CREATED, CONFIRMED, PAID, SHIPPED, DELIVERED, CANCELLED
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public List<OrderItem> getItems() { return items; }
    public void setItems(List<OrderItem> items) { this.items = items; }
    public OrderStatus getStatus() { return status; }
    public void setStatus(OrderStatus status) { this.status = status; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal total) { this.totalAmount = total; }
}
```

**OrderService.java**
```java
package com.backendforge.orderservice.service;

import com.backendforge.orderservice.entity.Order;
import com.backendforge.orderservice.repository.OrderRepository;
import com.backendforge.orderservice.client.InventoryClient;
import com.backendforge.orderservice.client.PaymentClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;

@Service
public class OrderService {
    
    private final OrderRepository repository;
    private final InventoryClient inventoryClient;
    private final PaymentClient paymentClient;
    
    public OrderService(OrderRepository repo, InventoryClient inv, PaymentClient pay) {
        this.repository = repo;
        this.inventoryClient = inv;
        this.paymentClient = pay;
    }
    
    @Transactional
    public Order createOrder(Order order) {
        // 1. Check inventory
        for (var item : order.getItems()) {
            boolean available = inventoryClient.checkStock(
                item.getProductId(), item.getQuantity());
            if (!available) {
                throw new RuntimeException("Out of stock: " + item.getProductId());
            }
        }
        
        // 2. Calculate total
        order.setTotalAmount(order.getItems().stream()
            .map(i -> i.getPrice().multiply(BigDecimal.valueOf(i.getQuantity())))
            .reduce(BigDecimal.ZERO, BigDecimal::add));
        
        // 3. Save order
        order.setStatus(Order.OrderStatus.CREATED);
        Order saved = repository.save(order);
        
        // 4. Process payment
        paymentClient.processPayment(saved.getId(), saved.getTotalAmount());
        saved.setStatus(Order.OrderStatus.PAID);
        
        // 5. Reduce inventory
        for (var item : order.getItems()) {
            inventoryClient.reduceStock(item.getProductId(), item.getQuantity());
        }
        
        return repository.save(saved);
    }
    
    public Order getOrder(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new RuntimeException("Order not found"));
    }
}
```

**InventoryClient.java**
```java
package com.backendforge.orderservice.client;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.*;

@FeignClient(name = "inventory-service", url = "${inventory-service.url}")
public interface InventoryClient {
    
    @GetMapping("/api/inventory/{productId}")
    boolean checkStock(@PathVariable Long productId, @RequestParam int quantity);
    
    @PostMapping("/api/inventory/{productId}/reduce")
    void reduceStock(@PathVariable Long productId, @RequestParam int quantity);
}
```

### Inventory Service

**InventoryService.java**
```java
package com.backendforge.inventoryservice.service;

import com.backendforge.inventoryservice.entity.Stock;
import com.backendforge.inventoryservice.repository.StockRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryService {
    
    private final StockRepository repository;
    
    public InventoryService(StockRepository repository) {
        this.repository = repository;
    }
    
    public boolean checkStock(Long productId, int quantity) {
        Stock stock = repository.findByProductId(productId)
            .orElse(new Stock(productId, 0));
        return stock.getQuantity() >= quantity;
    }
    
    @Transactional
    public void reduceStock(Long productId, int quantity) {
        Stock stock = repository.findByProductId(productId)
            .orElseThrow(() -> new RuntimeException("Product not in inventory"));
        
        if (stock.getQuantity() < quantity) {
            throw new RuntimeException("Insufficient stock");
        }
        
        stock.setQuantity(stock.getQuantity() - quantity);
        repository.save(stock);
    }
    
    public void addStock(Long productId, int quantity) {
        Stock stock = repository.findByProductId(productId)
            .orElse(new Stock(productId, 0));
        stock.setQuantity(stock.getQuantity() + quantity);
        repository.save(stock);
    }
}
```

### Payment Service

**PaymentService.java**
```java
package com.backendforge.paymentservice.service;

import com.backendforge.paymentservice.entity.Payment;
import com.backendforge.paymentservice.repository.PaymentRepository;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.UUID;

@Service
public class PaymentService {
    
    private final PaymentRepository repository;
    
    public PaymentService(PaymentRepository repository) {
        this.repository = repository;
    }
    
    public Payment processPayment(Long orderId, BigDecimal amount) {
        Payment payment = new Payment();
        payment.setOrderId(orderId);
        payment.setAmount(amount);
        payment.setTransactionId(UUID.randomUUID().toString());
        payment.setStatus(Payment.PaymentStatus.COMPLETED);
        
        return repository.save(payment);
    }
    
    public Payment getPaymentByOrderId(Long orderId) {
        return repository.findByOrderId(orderId)
            .orElseThrow(() -> new RuntimeException("Payment not found"));
    }
}
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  gateway:
    build: ./gateway
    ports:
      - "8080:8080"
    depends_on:
      - order-service
      - inventory-service
      - payment-service
  
  order-service:
    build: ./order-service
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://order-db:5432/orders
      - INVENTORY_SERVICE_URL=http://inventory-service:8081
      - PAYMENT_SERVICE_URL=http://payment-service:8082
    depends_on:
      - order-db
  
  inventory-service:
    build: ./inventory-service
    ports:
      - "8081:8081"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://inventory-db:5432/inventory
    depends_on:
      - inventory-db
  
  payment-service:
    build: ./payment-service
    ports:
      - "8082:8082"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://payment-db:5432/payments
    depends_on:
      - payment-db
  
  order-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=orders
  
  inventory-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=inventory
  
  payment-db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=payments
```

---

## Project 12: User Authentication Service (OAuth2 + JWT)

### Key Features
- User registration and login
- JWT token generation and validation
- Refresh token rotation
- Role-based access control
- OAuth2 integration (Google, GitHub)

### AuthController.java
```java
package com.backendforge.authservice.controller;

import com.backendforge.authservice.dto.*;
import com.backendforge.authservice.service.AuthService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {
    
    private final AuthService service;
    
    public AuthController(AuthService service) {
        this.service = service;
    }
    
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@RequestBody RegisterRequest request) {
        return ResponseEntity.ok(service.register(request));
    }
    
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@RequestBody LoginRequest request) {
        return ResponseEntity.ok(service.login(request));
    }
    
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(@RequestBody RefreshRequest request) {
        return ResponseEntity.ok(service.refreshToken(request.getRefreshToken()));
    }
    
    @GetMapping("/validate")
    public ResponseEntity<Void> validateToken(@RequestHeader("Authorization") String token) {
        if (service.validateToken(token.replace("Bearer ", ""))) {
            return ResponseEntity.ok().build();
        }
        return ResponseEntity.unauthorized().build();
    }
}
```

### JwtService.java
```java
package com.backendforge.authservice.service;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import java.security.Key;
import java.util.Date;
import java.util.List;

@Service
public class JwtService {
    
    private final Key signingKey;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;
    
    public JwtService(@Value("${jwt.secret}") String secret,
                      @Value("${jwt.access-expiration}") long accessExp,
                      @Value("${jwt.refresh-expiration}") long refreshExp) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes());
        this.accessTokenExpiration = accessExp;
        this.refreshTokenExpiration = refreshExp;
    }
    
    public String generateAccessToken(String userId, List<String> roles) {
        return Jwts.builder()
            .setSubject(userId)
            .claim("roles", roles)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + accessTokenExpiration))
            .signWith(signingKey, SignatureAlgorithm.HS256)
            .compact();
    }
    
    public String generateRefreshToken(String userId) {
        return Jwts.builder()
            .setSubject(userId)
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + refreshTokenExpiration))
            .signWith(signingKey, SignatureAlgorithm.HS256)
            .compact();
    }
    
    public Claims extractClaims(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(signingKey)
            .build()
            .parseClaimsJws(token)
            .getBody();
    }
    
    public boolean validateToken(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (JwtException e) {
            return false;
        }
    }
    
    public String getUserId(String token) {
        return extractClaims(token).getSubject();
    }
    
    public boolean isTokenExpired(String token) {
        return extractClaims(token).getExpiration().before(new Date());
    }
}
```

---

## Project 13: Notification Service (Email, SMS, Push)

### Architecture
```
┌─────────────────────────────────────────┐
│          Notification Service            │
│                                          │
│  ┌─────────────┐  ┌─────────────────┐  │
│  │Notification  │  │ Notification    │  │
│  │  Router      │→│  Channels       │  │
│  └─────────────┘  └─────────────────┘  │
│        │              │    │    │        │
│        │         ┌────┘    │    └───┐   │
│        │    ┌────▼───┐ ┌───▼──┐ ┌──▼──┐│
│        │    │ Email  │ │ SMS  │ │Push ││
│        │    │(SMTP)  │ │(Twilio│ │(FCM)││
│        │    └────────┘ └──────┘ └─────┘│
│  ┌─────▼──────────────────────────────┐│
│  │     Notification Repository        ││
│  └────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

### NotificationService.java
```java
package com.backendforge.notification.service;

import com.backendforge.notification.entity.Notification;
import com.backendforge.notification.repository.NotificationRepository;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    
    private final NotificationRepository repository;
    private final EmailChannel emailChannel;
    private final SmsChannel smsChannel;
    private final PushChannel pushChannel;
    
    public NotificationService(NotificationRepository repo, EmailChannel email,
                               SmsChannel sms, PushChannel push) {
        this.repository = repo;
        this.emailChannel = email;
        this.smsChannel = sms;
        this.pushChannel = push;
    }
    
    @Async
    public void send(Notification notification) {
        // Save to database
        notification.setStatus(Notification.Status.PENDING);
        repository.save(notification);
        
        try {
            switch (notification.getChannel()) {
                case EMAIL -> emailChannel.send(notification);
                case SMS -> smsChannel.send(notification);
                case PUSH -> pushChannel.send(notification);
            }
            notification.setStatus(Notification.Status.SENT);
        } catch (Exception e) {
            notification.setStatus(Notification.Status.FAILED);
            notification.setErrorMessage(e.getMessage());
        }
        
        repository.save(notification);
    }
}
```

---

## Projects 14-20: Summary

### Project 14: File Storage Service
- Upload/download files to S3-compatible storage
- Metadata management, file sharing, access control
- Multipart upload, chunked download

### Project 15: Search Service (Elasticsearch)
- Full-text search with Elasticsearch
- Index management, faceted search, autocomplete
- Spring Data Elasticsearch integration

### Project 16: Payment Gateway Integration
- Stripe and PayPal integration
- Webhook handling, refund processing
- Idempotent payment creation

### Project 17: Real-time Chat System
- WebSocket/STOMP messaging
- Chat rooms, direct messages
- Message history with MongoDB

### Project 18: API Gateway
- Spring Cloud Gateway configuration
- Rate limiting, circuit breaker
- JWT validation, request routing

### Project 19: Circuit Breaker Demo
- Resilience4j circuit breaker
- Fallback methods, retry with backoff
- Bulkhead pattern for isolation

### Project 20: Event-Driven Order System
- Kafka producer/consumer
- Event sourcing with outbox pattern
- Saga orchestration for distributed transactions

---

## How to Run Microservices

```bash
# Clone the full project
git clone <repo-url>
cd microservices-demo

# Start everything with Docker Compose
docker-compose up -d

# Check all services
docker-compose ps

# View logs
docker-compose logs -f order-service

# Test the flow
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "user1", "items": [{"productId": 1, "quantity": 2}]}'

# Run tests
docker-compose run order-service mvn test
```
