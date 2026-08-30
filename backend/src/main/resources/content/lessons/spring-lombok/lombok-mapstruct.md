---
title: Lombok & MapStruct — Eliminate Boilerplate Code
summary: What Lombok and MapStruct are, @Data, @Builder, @Value, @Slf4j, MapStruct mappers, and how organizations use them to write clean, maintainable code.
order: 1
minutes: 30
topics: [lombok, mapstruct, @Data, @Builder, @Value, @Slf4j, mappers, boilerplate]
docs:
  - https://projectlombok.org/features/all
  - https://mapstruct.org/documentation/stable/reference/html/
---

## The Concept, From Zero

### What is Lombok?

Lombok is a Java library that **generates boilerplate code at compile time**. Instead of writing getters, setters, constructors, equals/hashCode, toString, and builders by hand, Lombok generates them for you.

```java
// WITHOUT Lombok — you write 100+ lines
public class User {
    private String name;
    private String email;
    private int age;
    
    public User() {}
    public User(String name, String email, int age) {
        this.name = name;
        this.email = email;
        this.age = age;
    }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    @Override public boolean equals(Object o) { /* ... */ }
    @Override public int hashCode() { /* ... */ }
    @Override public String toString() { /* ... */ }
}

// WITH Lombok — you write 5 lines
@Data
@AllArgsConstructor
@NoArgsConstructor
public class User {
    private String name;
    private String email;
    private int age;
}
```

### What is MapStruct?

MapStruct is a code generator that creates **type-safe mapping code** between Java objects. Instead of manually copying fields from one object to another, MapStruct generates the mapping code at compile time.

```java
// WITHOUT MapStruct — manual mapping
public UserDTO toDTO(User user) {
    UserDTO dto = new UserDTO();
    dto.setName(user.getName());
    dto.setEmail(user.getEmail());
    dto.setAge(user.getAge());
    return dto;
}

// WITH MapStruct — one line
@Mapper(componentModel = "spring")
public interface UserMapper {
    UserDTO toDTO(User user);
}
```

---

## Lombok Annotations Deep Dive

### @Data — The All-in-One

```java
import lombok.Data;
import lombok.AllArgsConstructor;
import lombok.NoArgsConstructor;

@Data  // Generates: getters, setters, equals, hashCode, toString
@AllArgsConstructor  // Generates: constructor with all fields
@NoArgsConstructor   // Generates: no-arg constructor
public class Employee {
    private Long id;
    private String name;
    private String department;
    private double salary;
    private LocalDate hireDate;
}

// What Lombok generates (you don't write this):
// public Long getId() { return id; }
// public void setId(Long id) { this.id = id; }
// public boolean equals(Object o) { /* field comparison */ }
// public int hashCode() { /* based on fields */ }
// public String toString() { /* "Employee(id=1, name=John, ...)" */ }
```

### @Builder — Fluent Object Creation

```java
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class Order {
    private Long id;
    private String customerName;
    private List<OrderItem> items;
    private String shippingAddress;
    private PaymentMethod paymentMethod;
    private boolean expedited;
}

// Usage — clean, readable object creation
Order order = Order.builder()
    .id(1L)
    .customerName("John Doe")
    .items(List.of(item1, item2))
    .shippingAddress("123 Main St")
    .paymentMethod(PaymentMethod.CREDIT_CARD)
    .expedited(true)
    .build();

// Partial update with builder
Order updated = order.toBuilder()
    .shippingAddress("456 Oak Ave")
    .build();
```

### @Value — Immutable Objects

```java
import lombok.Value;

@Value  // Like @Data but immutable (all fields are final, no setters)
public class Money {
    BigDecimal amount;
    Currency currency;
    
    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new CurrencyMismatchException();
        }
        return new Money(this.amount.add(other.amount), this.currency);
    }
}

// Usage
Money price = new Money(new BigDecimal("29.99"), Currency.USD);
// price.setAmount(...) — COMPILE ERROR: no setter!
```

### @Slf4j — Automatic Logger

```java
import lombok.extern.slf4j.Slf4j;

@Slf4j  // Generates: private static final Logger log = LoggerFactory.getLogger(UserService.class);
public class UserService {
    
    public User createUser(String name, String email) {
        log.info("Creating user with email: {}", email);
        
        User user = new User(name, email);
        userRepository.save(user);
        
        log.debug("User created with ID: {}", user.getId());
        return user;
    }
    
    public void deleteUser(Long id) {
        log.warn("Deleting user with ID: {}", id);
        userRepository.deleteById(id);
        log.info("User deleted: {}", id);
    }
}
```

### @ToString — Debug-Friendly Output

```java
import lombok.ToString;

@ToString(exclude = {"password", "creditCard"})  // Exclude sensitive fields
public class Customer {
    private String name;
    private String email;
    private String password;
    private String creditCard;
    
    // toString() outputs: "Customer(name=John, email=john@example.com)"
    // password and creditCard are NOT included
}
```

### @EqualsAndHashCode — Proper Object Comparison

```java
import lombok.EqualsAndHashCode;

@EqualsAndHashCode(callSuper = true)  // Include parent class fields
public class PremiumCustomer extends Customer {
    private int loyaltyPoints;
    private String membershipTier;
}

// Two PremiumCustomer objects are equal if ALL fields match
// (including inherited fields from Customer)
```

---

## Line-by-Line Walkthrough

```java
import lombok.*;
import lombok.extern.slf4j.Slf4j;

// Line 1: Complete Lombok-annotated entity
@Data                    // getters, setters, equals, hashCode, toString
@Builder                 // fluent builder pattern
@AllArgsConstructor      // constructor with all fields
@NoArgsConstructor       // no-arg constructor
@ToString(exclude = {"password"})  // exclude sensitive field from toString
@Slf4j                   // automatic logger
public class User {
    
    @NonNull              // Generates null check in constructor/setter
    private String name;
    
    @NonNull
    private String email;
    
    private String password;
    
    @Builder.Default       // Default value when using builder
    private UserRole role = UserRole.USER;
    
    @EqualsAndHashCode.Exclude  // Don't include in equals/hashCode
    private LocalDateTime lastLogin;
    
    // Line 2: Custom method alongside generated code
    public boolean isAdmin() {
        return this.role == UserRole.ADMIN;
    }
}

// Line 3: Using the builder
User admin = User.builder()
    .name("Admin User")
    .email("admin@example.com")
    .password("secret123")
    .role(UserRole.ADMIN)     // Override default
    .build();

// Line 4: Using the all-args constructor
User regular = new User(
    "Regular User",
    "user@example.com",
    "password456",
    UserRole.USER,
    null
);

// Line 5: toString excludes password
System.out.println(admin);
// Output: User(name=Admin User, email=admin@example.com, role=ADMIN, lastLogin=null)

// Line 6: equals/hashCode work automatically
Set<User> users = new HashSet<>();
users.add(admin);
users.add(regular);
System.out.println(users.size());  // 2 — different users

// Line 7: Lombok with inheritance
@Data
@EqualsAndHashCode(callSuper = true)
public class PremiumUser extends User {
    private int loyaltyPoints;
    private String membershipTier;
}

// Line 8: Lombok with static factory methods
@RequiredArgsConstructor(staticName = "of")
public class Pair<A, B> {
    private final A first;
    private final B second;
}

Pair<String, Integer> pair = Pair.of("age", 25);
```

---

## MapStruct Deep Dive

### Basic Mapping

```java
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.factory.Mappers;

// Line 1: Simple one-to-one mapping
@Mapper(componentModel = "spring")  // Creates Spring bean
public interface UserMapper {
    
    UserMapper INSTANCE = Mappers.getMapper(UserMapper.class);  // For non-Spring
    
    // Line 2: DTO to Entity
    @Mapping(target = "id", ignore = true)  // Don't map ID (generated by DB)
    @Mapping(target = "createdAt", ignore = true)  // Don't map createdAt
    User toEntity(UserDTO dto);
    
    // Line 3: Entity to DTO
    UserDTO toDTO(User entity);
    
    // Line 4: Custom field mapping
    @Mapping(source = "firstName", target = "name")
    @Mapping(source = "emailAddress", target = "email")
    UserProfileDTO toProfileDTO(User user);
}

// Line 5: What MapStruct generates (you don't write this):
// @Component
// public class UserMapperImpl implements UserMapper {
//     @Override
//     public User toEntity(UserDTO dto) {
//         User user = new User();
//         user.setName(dto.getName());
//         user.setEmail(dto.getEmail());
//         // id and createdAt are ignored
//         return user;
//     }
// }
```

### Complex Mappings

```java
@Mapper(componentModel = "spring")
public interface OrderMapper {
    
    // Line 1: Nested object mapping
    @Mapping(source = "customer.name", target = "customerName")
    @Mapping(source = "customer.email", target = "customerEmail")
    @Mapping(source = "items", target = "orderItems")
    OrderDTO toDTO(Order order);
    
    // Line 2: List mapping
    List<OrderDTO> toDTOList(List<Order> orders);
    
    // Line 3: Custom mapping method
    @Mapping(target = "status", expression = "java(mapStatus(order.getStatus()))")
    OrderSummaryDTO toSummary(Order order);
    
    default String mapStatus(OrderStatus status) {
        return status.name().toLowerCase();
    }
    
    // Line 4: Date formatting
    @Mapping(source = "createdAt", target = "createdDate", dateFormat = "yyyy-MM-dd")
    OrderDTO toDTOWithDates(Order order);
    
    // Line 5: Default values
    @Mapping(target = "discount", defaultValue = "0.0")
    OrderDTO toDTOWithDefaults(Order order);
}
```

### Reverse Mapping

```java
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface ProductMapper {
    
    // Line 1: Both directions
    ProductDTO toDTO(Product product);
    
    @InheritInverseConfiguration  // Reuse mappings from toDTO
    Product toEntity(ProductDTO dto);
    
    // Line 2: Custom reverse mapping
    @Mapping(target = "category", expression = "java(dto.getCategoryId() != null ? categoryRepository.findById(dto.getCategoryId()).orElse(null) : null)")
    Product toEntity(ProductDTO dto);
}
```

---

## Real-World Scenarios

### Scenario 1: Complete REST API with Lombok & MapStruct

```java
// Entity
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(nullable = false, unique = true)
    private String email;
    
    @Column(nullable = false)
    private String password;
    
    @Enumerated(EnumType.STRING)
    private UserRole role;
    
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }
    
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

// DTO
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserDTO {
    private Long id;
    private String name;
    private String email;
    private String role;
    private String createdAt;
    private String updatedAt;
}

// Mapper
@Mapper(componentModel = "spring")
public interface UserMapper {
    
    @Mapping(target = "id", ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    User toEntity(CreateUserRequest request);
    
    UserDTO toDTO(User entity);
    
    List<UserDTO> toDTOList(List<User> users);
    
    default String map(LocalDateTime dateTime) {
        return dateTime != null ? dateTime.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME) : null;
    }
    
    default String mapEnum(UserRole role) {
        return role != null ? role.name() : null;
    }
}

// Service
@Service
@RequiredArgsConstructor  // Lombok: constructor injection
@Slf4j
public class UserService {
    
    private final UserRepository userRepository;
    private final UserMapper userMapper;
    
    public UserDTO createUser(CreateUserRequest request) {
        log.info("Creating user with email: {}", request.getEmail());
        
        User user = userMapper.toEntity(request);
        user.setPassword(passwordEncoder.encode(request.getPassword()));
        
        User saved = userRepository.save(user);
        log.info("User created with ID: {}", saved.getId());
        
        return userMapper.toDTO(saved);
    }
    
    public List<UserDTO> getAllUsers() {
        return userMapper.toDTOList(userRepository.findAll());
    }
}

// Controller
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    
    private final UserService userService;
    
    @PostMapping
    public ResponseEntity<UserDTO> createUser(@RequestBody @Valid CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
            .body(userService.createUser(request));
    }
    
    @GetMapping
    public ResponseEntity<List<UserDTO>> getAllUsers() {
        return ResponseEntity.ok(userService.getAllUsers());
    }
}
```

### Scenario 2: Lombok with Spring Data JPA

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "products")
@NamedQueries({
    @NamedQuery(name = "Product.findByCategory",
        query = "SELECT p FROM Product p WHERE p.category = :category")
})
public class Product {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank(message = "Product name is required")
    private String name;
    
    @Size(max = 1000)
    private String description;
    
    @NotNull
    @DecimalMin(value = "0.0", inclusive = false)
    private BigDecimal price;
    
    @Min(0)
    private Integer stockQuantity;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;
    
    @Builder.Default  // Default to empty list
    private List<Tag> tags = new ArrayList<>();
    
    public boolean isInStock() {
        return stockQuantity != null && stockQuantity > 0;
    }
    
    public void reduceStock(int quantity) {
        if (stockQuantity < quantity) {
            throw new InsufficientStockException(id, stockQuantity, quantity);
        }
        this.stockQuantity -= quantity;
    }
}

// Repository
@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {
    
    List<Product> findByCategoryName(String categoryName);
    
    @Query("SELECT p FROM Product p WHERE p.price BETWEEN :min AND :max")
    List<Product> findByPriceRange(@Param("min") BigDecimal min, @Param("max") BigDecimal max);
    
    @Query("SELECT p FROM Product p WHERE p.stockQuantity > 0 ORDER BY p.name")
    List<Product> findAvailableProducts();
}

// Service using Lombok
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class ProductService {
    
    private final ProductRepository productRepository;
    private final ProductMapper productMapper;
    
    public ProductDTO createProduct(CreateProductRequest request) {
        Product product = Product.builder()
            .name(request.getName())
            .description(request.getDescription())
            .price(request.getPrice())
            .stockQuantity(request.getStockQuantity())
            .build();
        
        Product saved = productRepository.save(product);
        log.info("Product created: {} (ID: {})", saved.getName(), saved.getId());
        
        return productMapper.toDTO(saved);
    }
    
    public List<ProductDTO> getProductsByCategory(String categoryName) {
        return productRepository.findByCategoryName(categoryName).stream()
            .map(productMapper::toDTO)
            .collect(Collectors.toList());
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using `@Data` on entities | Generates setters for immutable fields | Use `@Getter` only or `@Value` for immutable |
| Forgetting `@Builder.Default` | Default values ignored when using builder | Add `@Builder.Default` annotation |
| MapStruct null pointer | Nested objects not mapped | Use `@Mapping(source = "nested.field", target = "field")` |
| Lombok with JPA | `@ToString` causes lazy loading | Use `@ToString(exclude = {"lazyField"})` |
| MapStruct circular reference | Stack overflow on bidirectional mapping | Use `@Mapping(target = "parent", ignore = true)` |
| Not using `@RequiredArgsConstructor` | Constructor injection verbose | Replace with `@RequiredArgsConstructor` |
| MapStruct `unmappedTargetPolicy` | Compile error for unmapped fields | Set `ReportingPolicy.IGNORE` or map all fields |
| Lombok `@EqualsAndHashCode` with JPA | Natural keys not considered | Override equals/hashCode with business key |

---

## When to Use What

```java
// Entity: @Data + @Builder + @NoArgsConstructor + @AllArgsConstructor
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Entity
public class Order { ... }

// Value Object: @Value (immutable)
@Value
public class Money {
    BigDecimal amount;
    Currency currency;
}

// DTO: @Data + @Builder
@Data
@Builder
public class OrderDTO { ... }

// Service: @RequiredArgsConstructor + @Slf4j
@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService { ... }

// Config: @Value (Lombok) or @ConfigurationProperties
@Configuration
@RequiredArgsConstructor
public class AppConfig {
    @Value("${app.name}")
    private final String appName;
}
```
