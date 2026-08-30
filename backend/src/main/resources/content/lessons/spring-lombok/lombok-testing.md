---
title: Lombok with Testing — Mockito, Jackson, and JPA
summary: How Lombok annotations interact with testing frameworks, common pitfalls with @MockBean, JSON serialization, and JPA entity mapping.
order: 4
minutes: 15
topics: [lombok-testing, jackson, jpa, mockito, deserialization, entity-mapping]
docs:
  - https://projectlombok.org/features/all
---

## The Concept, From Zero

Lombok works great with testing frameworks, but there are specific gotchas with Jackson (JSON), JPA (entities), and Mockito (mocking). Here's how to avoid them.

```java
// ✅ Good: DTO with Jackson
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class UserDto {
    private String name;
    private int age;
}

// ❌ Bad: JPA entity with @Data
@Data  // generates equals/hashCode based on ALL fields including @Id
@Entity
public class User {
    @Id @GeneratedValue
    private Long id;
    private String name;
}
```

---

## Line-by-Line Walkthrough

```java
import lombok.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

public class LombokTestingDemo {

    // 1. DTO: @Data + @Builder + @NoArgsConstructor + @AllArgsConstructor
    @Data @Builder @NoArgsConstructor @AllArgsConstructor
    public static class CreateUserRequest {
        private String name;
        private String email;
        private int age;
    }

    // 2. Response DTO with Jackson
    @Data @Builder
    public static class UserResponse {
        private Long id;
        private String name;
        @JsonProperty("email_address")  // Jackson annotation on Lombok field
        private String email;
    }

    // 3. JPA Entity: selective annotations
    @Getter @Setter @ToString(exclude = "password")  // exclude sensitive field
    @NoArgsConstructor
    @AllArgsConstructor
    public static class UserEntity {
        @Setter(AccessLevel.NONE)  // id set by JPA, not by caller
        private Long id;
        private String name;
        private String email;
        @ToString.Exclude
        private String password;

        @Builder
        private UserEntity(String name, String email, String password) {
            this.name = name;
            this.email = email;
            this.password = password;
        }
    }

    // 4. JSON serialization test
    @Test
    void testJsonSerialization() throws Exception {
        ObjectMapper mapper = new ObjectMapper();

        CreateUserRequest request = CreateUserRequest.builder()
            .name("Alice")
            .email("alice@example.com")
            .age(30)
            .build();

        String json = mapper.writeValueAsString(request);
        System.out.println(json);
        // {"name":"Alice","email":"alice@example.com","age":30}

        CreateUserRequest deserialized = mapper.readValue(json, CreateUserRequest.class);
        assertEquals("Alice", deserialized.getName());
    }

    // 5. Builder + equals test
    @Test
    void testBuilderEquality() {
        UserDto a = UserDto.builder().name("Alice").age(30).build();
        UserDto b = UserDto.builder().name("Alice").age(30).build();
        assertEquals(a, b);  // @Data generates equals
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Test data builder

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class TestOrder {
    private Long id;
    private String productId;
    private int quantity;
    private OrderStatus status;
}

// Test fixture
public class TestData {
    public static TestOrder.OrderBuilder anOrder() {
        return TestOrder.builder()
            .productId("PROD-001")
            .quantity(1)
            .status(TestOrder.OrderStatus.PENDING);
    }
}

// In tests
TestOrder order = TestData.anOrder().id(1L).build();
```

### Scenario 2: JPA entity with Lombok

```java
@Entity
@Getter @Setter
@EqualsAndHashCode(of = "id")  // only use ID for equality
@ToString(exclude = {"password", "sessionToken"})
@NoArgsConstructor
@AllArgsConstructor(access = AccessLevel.PRIVATE)
@Builder
public class User {
    @Id @GeneratedValue
    private Long id;

    @Column(nullable = false, unique = true)
    private String email;

    private String name;

    @ToString.Exclude
    private String password;

    @Enumerated(EnumType.STRING)
    private Role role;
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| @Data on JPA entities | equals/hashCode includes mutable fields | Use @Getter @Setter @EqualsAndHashCode(of = "id") |
| Forgetting @NoArgsConstructor | Jackson deserialization fails | Add @NoArgsConstructor to entities |
| @ToString on password field | Password in logs | Use @ToString.Exclude |
| Using @Builder on entity without @NoArgsConstructor | JPA proxy creation fails | Always add @NoArgsConstructor |
