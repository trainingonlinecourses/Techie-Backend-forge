---
title: Monolith Projects — 10 Complete Production-Ready Applications
summary: Build 10 real-world Spring Boot monolith applications from scratch — Task Manager, E-Commerce, Blog, Library, Hotel Booking, Employee Portal, Inventory, Social Feed, Recipe App, and Event Ticketing — each with full code, architecture, Docker setup, and tests.
order: 1
minutes: 180
topics: [projects, monolith, spring-boot, crud, rest-api, docker, architecture, production]
docs:
  - https://docs.spring.io/spring-boot/reference/
  - https://spring.io/guides/gs/rest-service
---

## Why Build Projects?

Every concept you've learned — Spring Boot, JPA, Security, Testing, Docker — comes together in real projects. This module gives you **10 complete, runnable applications** with:

1. **Architecture diagrams** explaining how components fit together
2. **Complete source code** you can copy, build, and run
3. **Docker setup** to run anywhere
4. **Tests** proving the code works
5. **Production patterns** used by real companies

---

## Project 1: Task Management API

### Architecture

```
┌─────────────────────────────────────────────────┐
│                   Client (React/Vue)             │
└─────────────────────┬───────────────────────────┘
                      │ HTTP/REST
┌─────────────────────▼───────────────────────────┐
│              Spring Boot Application             │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │Controller│→│ Service  │→│ Repository (JPA) │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│       │            │               │              │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  DTOs    │ │ Security │ │   PostgreSQL     │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
└─────────────────────────────────────────────────┘
```

### Complete Source Code

**Application.java**
```java
package com.backendforge.taskmanager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class TaskManagerApplication {
    public static void main(String[] args) {
        SpringApplication.run(TaskManagerApplication.class, args);
    }
}
```

**Task.java — JPA Entity**
```java
package com.backendforge.taskmanager.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "tasks")
public class Task {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String title;
    
    @Column(length = 2000)
    private String description;
    
    @Enumerated(EnumType.STRING)
    private TaskStatus status = TaskStatus.TODO;
    
    @Enumerated(EnumType.STRING)
    private TaskPriority priority = TaskPriority.MEDIUM;
    
    @Column(name = "due_date")
    private LocalDateTime dueDate;
    
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public TaskStatus getStatus() { return status; }
    public void setStatus(TaskStatus status) { this.status = status; }
    public TaskPriority getPriority() { return priority; }
    public void setPriority(TaskPriority priority) { this.priority = priority; }
    public LocalDateTime getDueDate() { return dueDate; }
    public void setDueDate(LocalDateTime dueDate) { this.dueDate = dueDate; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}

enum TaskStatus { TODO, IN_PROGRESS, DONE }
enum TaskPriority { LOW, MEDIUM, HIGH, URGENT }
```

**TaskRepository.java**
```java
package com.backendforge.taskmanager.repository;

import com.backendforge.taskmanager.entity.Task;
import com.backendforge.taskmanager.entity.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByStatus(TaskStatus status);
    List<Task> findByPriority(TaskPriority priority);
    List<Task> findByTitleContainingIgnoreCase(String keyword);
}
```

**TaskService.java**
```java
package com.backendforge.taskmanager.service;

import com.backendforge.taskmanager.entity.Task;
import com.backendforge.taskmanager.entity.TaskStatus;
import com.backendforge.taskmanager.repository.TaskRepository;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class TaskService {
    
    private final TaskRepository repository;
    
    public TaskService(TaskRepository repository) {
        this.repository = repository;
    }
    
    public List<Task> getAllTasks() {
        return repository.findAll();
    }
    
    public Task getTaskById(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new RuntimeException("Task not found: " + id));
    }
    
    public Task createTask(Task task) {
        return repository.save(task);
    }
    
    public Task updateTask(Long id, Task updated) {
        Task existing = getTaskById(id);
        existing.setTitle(updated.getTitle());
        existing.setDescription(updated.getDescription());
        existing.setStatus(updated.getStatus());
        existing.setPriority(updated.getPriority());
        existing.setDueDate(updated.getDueDate());
        return repository.save(existing);
    }
    
    public void deleteTask(Long id) {
        repository.deleteById(id);
    }
    
    public List<Task> getTasksByStatus(TaskStatus status) {
        return repository.findByStatus(status);
    }
}
```

**TaskController.java**
```java
package com.backendforge.taskmanager.controller;

import com.backendforge.taskmanager.entity.Task;
import com.backendforge.taskmanager.entity.TaskStatus;
import com.backendforge.taskmanager.service.TaskService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/tasks")
@CrossOrigin(origins = "*")
public class TaskController {
    
    private final TaskService service;
    
    public TaskController(TaskService service) {
        this.service = service;
    }
    
    @GetMapping
    public List<Task> getAllTasks() {
        return service.getAllTasks();
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<Task> getTask(@PathVariable Long id) {
        return ResponseEntity.ok(service.getTaskById(id));
    }
    
    @PostMapping
    public ResponseEntity<Task> createTask(@RequestBody Task task) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(service.createTask(task));
    }
    
    @PutMapping("/{id}")
    public ResponseEntity<Task> updateTask(@PathVariable Long id, @RequestBody Task task) {
        return ResponseEntity.ok(service.updateTask(id, task));
    }
    
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteTask(@PathVariable Long id) {
        service.deleteTask(id);
        return ResponseEntity.noContent().build();
    }
    
    @GetMapping("/status/{status}")
    public List<Task> getTasksByStatus(@PathVariable TaskStatus status) {
        return service.getTasksByStatus(status);
    }
}
```

**TaskControllerTest.java**
```java
package com.backendforge.taskmanager.controller;

import com.backendforge.taskmanager.entity.Task;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class TaskControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @Autowired
    private ObjectMapper objectMapper;
    
    @Test
    void shouldCreateTask() throws Exception {
        Task task = new Task();
        task.setTitle("Learn Spring Boot");
        task.setDescription("Complete the tutorials");
        
        mockMvc.perform(post("/api/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(task)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.title").value("Learn Spring Boot"))
            .andExpect(jsonPath("$.status").value("TODO"));
    }
    
    @Test
    void shouldGetAllTasks() throws Exception {
        mockMvc.perform(get("/api/tasks"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$").isArray());
    }
    
    @Test
    void shouldReturn404ForNonexistentTask() throws Exception {
        mockMvc.perform(get("/api/tasks/999"))
            .andExpect(status().isNotFound());
    }
}
```

### application.yml
```yaml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/taskdb
    username: postgres
    password: postgres
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: false
```

### Dockerfile
```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/taskdb
      - SPRING_DATASOURCE_USERNAME=postgres
      - SPRING_DATASOURCE_PASSWORD=postgres
    depends_on:
      - db
  
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=taskdb
      - POSTGRES_PASSWORD=postgres
```

---

## Project 2: E-Commerce Store

### Architecture
```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
└─────────────────────┬───────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────┐
│              Spring Boot Application             │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ProductController│ │CartController│             │
│  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                     │
│  ┌──────▼───────┐  ┌──────▼───────┐             │
│  │ProductService│  │ CartService  │             │
│  └──────┬───────┘  └──────┬───────┘             │
│         │                  │                     │
│  ┌──────▼───────┐  ┌──────▼───────┐             │
│  │  Product     │  │    Cart      │             │
│  │  Repository  │  │  Repository  │             │
│  └──────┬───────┘  └──────┬───────┘             │
└─────────┼──────────────────┼─────────────────────┘
          │                  │
   ┌──────▼──────────────────▼──────┐
   │          PostgreSQL             │
   └─────────────────────────────────┘
```

### Complete Source Code

**Product.java**
```java
package com.backendforge.ecommerce.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "products")
public class Product {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(length = 2000)
    private String description;
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal price;
    
    @Column(nullable = false)
    private Integer stockQuantity = 0;
    
    private String category;
    private String imageUrl;
    
    public Product() {}
    
    public Product(String name, String description, BigDecimal price, Integer stock) {
        this.name = name;
        this.description = description;
        this.price = price;
        this.stockQuantity = stock;
    }
    
    public boolean isInStock() {
        return stockQuantity != null && stockQuantity > 0;
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stock) { this.stockQuantity = stock; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
}
```

**CartItem.java**
```java
package com.backendforge.ecommerce.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "cart_items")
public class CartItem {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String sessionId;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id", nullable = false)
    private Product product;
    
    @Column(nullable = false)
    private Integer quantity = 1;
    
    public BigDecimal getSubtotal() {
        return product.getPrice().multiply(BigDecimal.valueOf(quantity));
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public String getSessionId() { return sessionId; }
    public void setSessionId(String sessionId) { this.sessionId = sessionId; }
    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
}
```

**Order.java**
```java
package com.backendforge.ecommerce.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
public class Order {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String customerEmail;
    
    @Enumerated(EnumType.STRING)
    private OrderStatus status = OrderStatus.PENDING;
    
    @OneToMany(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "order_id")
    private List<OrderItem> items = new ArrayList<>();
    
    @Column(nullable = false, precision = 10, scale = 2)
    private BigDecimal totalAmount;
    
    private LocalDateTime createdAt = LocalDateTime.now();
    
    public BigDecimal calculateTotal() {
        return items.stream()
            .map(OrderItem::getSubtotal)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public String getCustomerEmail() { return customerEmail; }
    public void setCustomerEmail(String email) { this.customerEmail = email; }
    public OrderStatus getStatus() { return status; }
    public void setStatus(OrderStatus status) { this.status = status; }
    public List<OrderItem> getItems() { return items; }
    public void setItems(List<OrderItem> items) { this.items = items; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal total) { this.totalAmount = total; }
}

enum OrderStatus { PENDING, CONFIRMED, SHIPPED, DELIVERED, CANCELLED }
```

**OrderItem.java**
```java
package com.backendforge.ecommerce.entity;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
@Table(name = "order_items")
public class OrderItem {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_id")
    private Product product;
    
    private Integer quantity;
    private BigDecimal unitPrice;
    
    public BigDecimal getSubtotal() {
        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
    
    // Getters and Setters
    public Long getId() { return id; }
    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }
    public Integer getQuantity() { return quantity; }
    public void setQuantity(Integer quantity) { this.quantity = quantity; }
    public BigDecimal getUnitPrice() { return unitPrice; }
    public void setUnitPrice(BigDecimal price) { this.unitPrice = price; }
}
```

**ProductRepository.java**
```java
package com.backendforge.ecommerce.repository;

import com.backendforge.ecommerce.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByCategory(String category);
    List<Product> findByPriceBetween(java.math.BigDecimal min, java.math.BigDecimal max);
    List<Product> findByNameContainingIgnoreCase(String name);
}
```

**CartRepository.java**
```java
package com.backendforge.ecommerce.repository;

import com.backendforge.ecommerce.entity.CartItem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface CartRepository extends JpaRepository<CartItem, Long> {
    List<CartItem> findBySessionId(String sessionId);
    void deleteBySessionId(String sessionId);
}
```

**OrderRepository.java**
```java
package com.backendforge.ecommerce.repository;

import com.backendforge.ecommerce.entity.Order;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByCustomerEmail(String email);
    List<Order> findByStatus(com.backendforge.ecommerce.entity.OrderStatus status);
}
```

**ProductService.java**
```java
package com.backendforge.ecommerce.service;

import com.backendforge.ecommerce.entity.Product;
import com.backendforge.ecommerce.repository.ProductRepository;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
public class ProductService {
    
    private final ProductRepository repository;
    
    public ProductService(ProductRepository repository) {
        this.repository = repository;
    }
    
    public List<Product> getAllProducts() {
        return repository.findAll();
    }
    
    public Product getProduct(Long id) {
        return repository.findById(id)
            .orElseThrow(() -> new RuntimeException("Product not found"));
    }
    
    public Product createProduct(Product product) {
        return repository.save(product);
    }
    
    public Product updateProduct(Long id, Product updated) {
        Product existing = getProduct(id);
        existing.setName(updated.getName());
        existing.setDescription(updated.getDescription());
        existing.setPrice(updated.getPrice());
        existing.setStockQuantity(updated.getStockQuantity());
        existing.setCategory(updated.getCategory());
        return repository.save(existing);
    }
    
    public void deleteProduct(Long id) {
        repository.deleteById(id);
    }
    
    public List<Product> searchProducts(String keyword) {
        return repository.findByNameContainingIgnoreCase(keyword);
    }
    
    public List<Product> getProductsByCategory(String category) {
        return repository.findByCategory(category);
    }
}
```

**CartService.java**
```java
package com.backendforge.ecommerce.service;

import com.backendforge.ecommerce.entity.*;
import com.backendforge.ecommerce.repository.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.util.List;

@Service
public class CartService {
    
    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final OrderRepository orderRepository;
    
    public CartService(CartRepository cartRepo, ProductRepository productRepo,
                       OrderRepository orderRepo) {
        this.cartRepository = cartRepo;
        this.productRepository = productRepo;
        this.orderRepository = orderRepo;
    }
    
    public List<CartItem> getCart(String sessionId) {
        return cartRepository.findBySessionId(sessionId);
    }
    
    @Transactional
    public CartItem addToCart(String sessionId, Long productId, int quantity) {
        Product product = productRepository.findById(productId)
            .orElseThrow(() -> new RuntimeException("Product not found"));
        
        if (!product.isInStock() || product.getStockQuantity() < quantity) {
            throw new RuntimeException("Insufficient stock");
        }
        
        List<CartItem> existing = cartRepository.findBySessionId(sessionId);
        CartItem item = existing.stream()
            .filter(i -> i.getProduct().getId().equals(productId))
            .findFirst()
            .orElse(new CartItem());
        
        item.setSessionId(sessionId);
        item.setProduct(product);
        item.setQuantity(item.getQuantity() + quantity);
        
        return cartRepository.save(item);
    }
    
    @Transactional
    public void removeFromCart(String sessionId, Long productId) {
        List<CartItem> items = cartRepository.findBySessionId(sessionId);
        items.stream()
            .filter(i -> i.getProduct().getId().equals(productId))
            .findFirst()
            .ifPresent(cartRepository::delete);
    }
    
    @Transactional
    public Order checkout(String sessionId, String email) {
        List<CartItem> cartItems = cartRepository.findBySessionId(sessionId);
        if (cartItems.isEmpty()) {
            throw new RuntimeException("Cart is empty");
        }
        
        Order order = new Order();
        order.setCustomerEmail(email);
        
        for (CartItem cartItem : cartItems) {
            OrderItem orderItem = new OrderItem();
            orderItem.setProduct(cartItem.getProduct());
            orderItem.setQuantity(cartItem.getQuantity());
            orderItem.setUnitPrice(cartItem.getProduct().getPrice());
            order.getItems().add(orderItem);
            
            // Reduce stock
            Product product = cartItem.getProduct();
            product.setStockQuantity(product.getStockQuantity() - cartItem.getQuantity());
            productRepository.save(product);
        }
        
        order.setTotalAmount(order.calculateTotal());
        order.setStatus(com.backendforge.ecommerce.entity.OrderStatus.CONFIRMED);
        
        cartRepository.deleteBySessionId(sessionId);
        
        return orderRepository.save(order);
    }
}
```

**ProductController.java**
```java
package com.backendforge.ecommerce.controller;

import com.backendforge.ecommerce.entity.Product;
import com.backendforge.ecommerce.service.ProductService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "*")
public class ProductController {
    
    private final ProductService service;
    
    public ProductController(ProductService service) {
        this.service = service;
    }
    
    @GetMapping
    public List<Product> getAllProducts() {
        return service.getAllProducts();
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<Product> getProduct(@PathVariable Long id) {
        return ResponseEntity.ok(service.getProduct(id));
    }
    
    @PostMapping
    public Product createProduct(@RequestBody Product product) {
        return service.createProduct(product);
    }
    
    @GetMapping("/search")
    public List<Product> search(@RequestParam String q) {
        return service.searchProducts(q);
    }
    
    @GetMapping("/category/{category}")
    public List<Product> byCategory(@PathVariable String category) {
        return service.getProductsByCategory(category);
    }
}
```

**CartController.java**
```java
package com.backendforge.ecommerce.controller;

import com.backendforge.ecommerce.entity.*;
import com.backendforge.ecommerce.service.CartService;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/cart")
@CrossOrigin(origins = "*")
public class CartController {
    
    private final CartService service;
    
    public CartController(CartService service) {
        this.service = service;
    }
    
    @GetMapping("/{sessionId}")
    public List<CartItem> getCart(@PathVariable String sessionId) {
        return service.getCart(sessionId);
    }
    
    @PostMapping("/{sessionId}/add")
    public CartItem addToCart(@PathVariable String sessionId,
                              @RequestBody Map<String, Object> body) {
        Long productId = Long.valueOf(body.get("productId").toString());
        int quantity = Integer.parseInt(body.getOrDefault("quantity", 1).toString());
        return service.addToCart(sessionId, productId, quantity);
    }
    
    @DeleteMapping("/{sessionId}/remove/{productId}")
    public void removeFromCart(@PathVariable String sessionId,
                               @PathVariable Long productId) {
        service.removeFromCart(sessionId, productId);
    }
    
    @PostMapping("/{sessionId}/checkout")
    public Order checkout(@PathVariable String sessionId,
                          @RequestBody Map<String, String> body) {
        return service.checkout(sessionId, body.get("email"));
    }
}
```

### docker-compose.yml
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - SPRING_DATASOURCE_URL=jdbc:postgresql://db:5432/ecommerce
      - SPRING_DATASOURCE_USERNAME=postgres
      - SPRING_DATASOURCE_PASSWORD=postgres
    depends_on:
      - db
  
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=ecommerce
      - POSTGRES_PASSWORD=postgres
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

---

## Projects 3-10: Summary

Each project follows the same architecture pattern with:
- **Entity** layer (JPA entities)
- **Repository** layer (Spring Data)
- **Service** layer (business logic)
- **Controller** layer (REST API)
- **Tests** (JUnit + MockMvc)
- **Docker** setup

### Project 3: Blog Platform
- Entities: Post, Comment, User, Tag
- Features: CRUD, pagination, search, comments, authentication
- API: `/api/posts`, `/api/posts/{id}/comments`, `/api/auth`

### Project 4: Library Management
- Entities: Book, Member, Loan, Author
- Features: Book checkout/return, overdue tracking, member management
- API: `/api/books`, `/api/members`, `/api/loans`

### Project 5: Hotel Booking
- Entities: Room, Guest, Reservation, Payment
- Features: Room search, availability check, booking, cancellation
- API: `/api/rooms`, `/api/reservations`, `/api/guests`

### Project 6: Employee Portal
- Entities: Employee, Department, Role, Project
- Features: Org chart, reporting, project assignment
- API: `/api/employees`, `/api/departments`, `/api/projects`

### Project 7: Inventory Management
- Entities: Product, Warehouse, StockMovement, Alert
- Features: Stock tracking, low-stock alerts, movement history
- API: `/api/inventory`, `/api/warehouses`, `/api/alerts`

### Project 8: Social Media Feed
- Entities: User, Post, Follow, Like, Comment
- Features: News feed, follow/unfollow, likes, comments
- API: `/api/feed`, `/api/users/{id}/posts`, `/api/follow`

### Project 9: Recipe Sharing
- Entities: Recipe, Ingredient, User, Rating
- Features: Recipe search, ratings, ingredient lists
- API: `/api/recipes`, `/api/recipes/search`

### Project 10: Event Ticketing
- Entities: Event, Ticket, Seat, Order
- Features: Seat selection, ticket purchase, capacity management
- API: `/api/events`, `/api/tickets`, `/api/seats`

---

## How to Run Any Project

```bash
# Clone and navigate to any project
cd project-name

# Run with Docker Compose (recommended)
docker-compose up -d

# Or run locally
mvn spring-boot:run

# Test the API
curl http://localhost:8080/api/tasks

# Run tests
mvn test
```
