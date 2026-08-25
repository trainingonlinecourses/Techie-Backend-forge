---
title: @PatchMapping — Partial Updates in REST APIs
summary: PUT vs PATCH semantics, partial updates with nullable DTOs, JSON Merge Patch (RFC 7396), and safe field-by-field updates.
order: 21
minutes: 14
topics: [patch-mapping, partial-update, put-vs-patch, json-merge-patch, rest-api-design]
docs:
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html
  - https://www.javaguides.net/2019/08/spring-boot-restful-web-services-crud-example.html
---

# @PatchMapping — Partial Updates in REST APIs

## What Is PATCH?

In REST APIs, there are different ways to update a resource:

| Method | Purpose | Body Contains |
|--------|---------|---------------|
| `PUT` | **Replace** the entire resource | ALL fields (even unchanged ones) |
| `PATCH` | **Partially update** a resource | ONLY the fields that changed |

**Example:**

```json
// Original user
{ "id": 1, "name": "Alice", "email": "alice@example.com", "age": 25 }

// PUT /api/users/1 — must send ALL fields
{ "name": "Alice", "email": "alice@newdomain.com", "age": 25 }
// Result: email updated, everything else stays the same (because we sent it)

// PATCH /api/users/1 — only send what changed
{ "email": "alice@newdomain.com" }
// Result: only email updated, name and age untouched
```

---

## @PatchMapping in Spring Boot

### Basic Usage

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    @PatchMapping("/{id}")
    public ResponseEntity<UserResponse> patchUser(
            @PathVariable Long id,
            @RequestBody Map<String, Object> updates) {

        User user = userService.findById(id);

        // Apply only the fields that were sent
        if (updates.containsKey("name")) {
            user.setName((String) updates.get("name"));
        }
        if (updates.containsKey("email")) {
            user.setEmail((String) updates.get("email"));
        }
        if (updates.containsKey("age")) {
            user.setAge((Integer) updates.get("age"));
        }

        User updated = userService.save(user);
        return ResponseEntity.ok(toResponse(updated));
    }
}
```

### With a Dedicated Request DTO (Better)

```java
// Request DTO with nullable fields
public record PatchUserRequest(
    String name,      // null means "don't change"
    String email,     // null means "don't change"
    Integer age       // null means "don't change"
) {}

@RestController
@RequestMapping("/api/users")
public class UserController {

    @PatchMapping("/{id}")
    public ResponseEntity<UserResponse> patchUser(
            @PathVariable Long id,
            @RequestBody PatchUserRequest request) {

        User user = userService.findById(id);

        // Only apply non-null fields
        if (request.name() != null) user.setName(request.name());
        if (request.email() != null) user.setEmail(request.email());
        if (request.age() != null) user.setAge(request.age());

        User updated = userService.save(user);
        return ResponseEntity.ok(toResponse(updated));
    }
}
```

---

## PUT vs PATCH

```java
// PUT — replace the entire resource
@PutMapping("/{id}")
public ResponseEntity<UserResponse> replaceUser(
        @PathVariable Long id,
        @RequestBody CreateUserRequest request) {

    User user = new User(id, request.name(), request.email(), request.age());
    User updated = userService.replace(id, user);
    return ResponseEntity.ok(toResponse(updated));
}

// PATCH — partial update
@PatchMapping("/{id}")
public ResponseEntity<UserResponse> patchUser(
        @PathVariable Long id,
        @RequestBody PatchUserRequest request) {

    User user = userService.findById(id);

    // Only update what was sent
    Optional.ofNullable(request.name()).ifPresent(user::setName);
    Optional.ofNullable(request.email()).ifPresent(user::setEmail);
    Optional.ofNullable(request.age()).ifPresent(user::setAge);

    User updated = userService.save(user);
    return ResponseEntity.ok(toResponse(updated));
}
```

---

## JSON Merge Patch (RFC 7396)

A more formal approach to PATCH — the client sends a JSON object with only the fields to change, and null means "remove this field":

```java
// PatchUserRequest with special handling for null
public record PatchUserRequest(
    String name,
    String email,
    Integer age
) {
    // A flag to distinguish "not sent" from "sent as null"
    private boolean nameExplicitlySet;
    private boolean emailExplicitlySet;
    private boolean ageExplicitlySet;
}
```

```java
// Simple approach: use a Map and check for key existence
@PatchMapping(value = "/{id}", consumes = "application/merge-patch+json")
public ResponseEntity<UserResponse> mergePatchUser(
        @PathVariable Long id,
        @RequestBody Map<String, Object> patch) {

    User user = userService.findById(id);

    // If key exists in the JSON, update the field
    // If key is missing, leave the field unchanged
    // If value is null, set the field to null
    patch.forEach((key, value) -> {
        switch (key) {
            case "name" -> user.setName((String) value);
            case "email" -> user.setEmail((String) value);
            case "age" -> user.setAge(value != null ? (Integer) value : null);
        }
    });

    User updated = userService.save(user);
    return ResponseEntity.ok(toResponse(updated));
}
```

---

## In an Organization

### Scenario 1: Profile Settings (Partial Update)

```java
public record PatchProfileRequest(
    String displayName,
    String avatarUrl,
    Boolean emailNotifications,
    Boolean smsNotifications,
    String timezone
) {}

@RestController
@RequestMapping("/api/profile")
public class ProfileController {

    @PatchMapping
    public ResponseEntity<ProfileResponse> updateProfile(@RequestBody PatchProfileRequest request) {
        Profile profile = profileService.getCurrentUserProfile();

        // Only update fields that were sent
        Optional.ofNullable(request.displayName()).ifPresent(profile::setDisplayName);
        Optional.ofNullable(request.avatarUrl()).ifPresent(profile::setAvatarUrl);
        Optional.ofNullable(request.emailNotifications()).ifPresent(profile::setEmailNotifications);
        Optional.ofNullable(request.smsNotifications()).ifPresent(profile::setSmsNotifications);
        Optional.ofNullable(request.timezone()).ifPresent(profile::setTimezone);

        Profile updated = profileService.save(profile);
        return ResponseEntity.ok(toResponse(updated));
    }
}
```

### Scenario 2: Order Status Update

```java
public record PatchOrderRequest(
    String status,
    String cancellationReason,
    String shippingAddress
) {}

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PatchMapping("/{id}/status")
    public ResponseEntity<OrderResponse> updateOrderStatus(
            @PathVariable Long id,
            @RequestBody PatchOrderRequest request) {

        Order order = orderService.findById(id);

        // Validate state transition
        if (request.status() != null) {
            orderService.validateTransition(order.getStatus(), request.status());
            order.setStatus(request.status());
        }

        if (request.cancellationReason() != null) {
            order.setCancellationReason(request.cancellationReason());
        }

        if (request.shippingAddress() != null) {
            order.setShippingAddress(request.shippingAddress());
        }

        Order updated = orderService.save(order);
        return ResponseEntity.ok(toResponse(updated));
    }
}
```

### Scenario 3: Product Price Update

```java
@PatchMapping("/{id}/price")
public ResponseEntity<ProductResponse> updatePrice(
        @PathVariable Long id,
        @RequestBody Map<String, BigDecimal> body) {

    Product product = productService.findById(id);
    BigDecimal newPrice = body.get("price");

    // Audit the price change
    PriceHistory history = new PriceHistory(
        product.getId(),
        product.getPrice(),
        newPrice,
        SecurityContext.username()
    );
    priceHistoryRepository.save(history);

    product.setPrice(newPrice);
    Product updated = productService.save(product);
    return ResponseEntity.ok(toResponse(updated));
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Using PUT for partial updates | Replaces entire resource, might lose data | Use PATCH for partial updates |
| Not validating partial data | Invalid data sneaks through | Validate only the fields that are present |
| Using `Map<String, Object>` everywhere | No type safety, hard to maintain | Create dedicated Patch DTOs |
| Not checking for null | Accidentally nullifying fields | Use `Optional.ofNullable().ifPresent()` |
| Mixing PATCH and PUT semantics | Confusing API behavior | Keep PUT for full replacement, PATCH for partial |
| Forgetting to handle `null` vs "not sent" | Different semantics | Use a wrapper type or check key existence |
