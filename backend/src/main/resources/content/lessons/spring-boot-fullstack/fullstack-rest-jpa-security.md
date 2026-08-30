---
title: Building a Full-Stack Spring Boot Application — REST + JPA + Security
summary: Step-by-step guide to building a production-ready application with REST controllers, JPA persistence, Spring Security, validation, exception handling, and testing.
order: 2
minutes: 30
topics: [fullstack, rest-api, jpa-repository, spring-security, validation, exception-handling]
docs:
  - https://spring.io/guides/gs/rest-service
  - https://spring.io/guides/gs/securing-web
---

## The Concept, From Zero

A "full-stack" Spring Boot application combines multiple layers into a working product:

```
[Browser/Mobile Client]
        ↓ HTTP
[REST Controller] ← handles requests, returns JSON
        ↓
[Service Layer] ← business logic, validation
        ↓
[JPA Repository] ← database queries
        ↓
[Database] ← PostgreSQL, MySQL, H2
```

Plus cross-cutting concerns:
- **Spring Security** — authentication and authorization
- **Validation** — reject bad input before it hits the database
- **Exception Handling** — convert errors to meaningful HTTP responses
- **Testing** — unit tests, integration tests, API tests

---

## Complete Application: Task Manager API

### Step 1: Project Setup

```xml
<!-- pom.xml dependencies -->
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-security</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
    <dependency>
        <groupId>com.h2database</groupId>
        <artifactId>h2</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

### Step 2: Entity — The Database Model

```java
@Entity
@Table(name = "tasks")
public class Task {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank(message = "Task title is required")
    @Size(max = 200, message = "Title must be under 200 characters")
    @Column(nullable = false)
    private String title;
    
    @Column(length = 2000)
    private String description;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Priority priority = Priority.MEDIUM;
    
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.TODO;
    
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;
    
    @CreationTimestamp
    private LocalDateTime createdAt;
    
    @UpdateTimestamp
    private LocalDateTime updatedAt;
    
    // Constructors
    public Task() {}
    
    public Task(String title, String description, Priority priority) {
        this.title = title;
        this.description = description;
        this.priority = priority;
    }
    
    // Getters and setters
    public Long getId() { return id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Priority getPriority() { return priority; }
    public void setPriority(Priority priority) { this.priority = priority; }
    public Status getStatus() { return status; }
    public void setStatus(Status status) { this.status = status; }
    public User getAssignee() { return assignee; }
    public void setAssignee(User assignee) { this.assignee = assignee; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    
    public enum Priority { LOW, MEDIUM, HIGH, CRITICAL }
    public enum Status { TODO, IN_PROGRESS, IN_REVIEW, DONE }
}
```

### Step 3: User Entity

```java
@Entity
@Table(name = "users")
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank
    @Column(unique = true, nullable = false)
    private String username;
    
    @NotBlank
    @Column(nullable = false)
    private String password;  // BCrypt hashed
    
    @Email
    @Column(unique = true)
    private String email;
    
    @Enumerated(EnumType.STRING)
    private Role role = Role.USER;
    
    @OneToMany(mappedBy = "assignee", cascade = CascadeType.ALL)
    private List<Task> tasks = new ArrayList<>();
    
    // Getters, setters...
    
    public enum Role { USER, MANAGER, ADMIN }
}
```

### Step 4: Repository

```java
@Repository
public interface TaskRepository extends JpaRepository<Task, Long> {
    
    // Spring Data JPA derives queries from method names
    List<Task> findByStatus(Task.Status status);
    List<Task> findByAssigneeUsername(String username);
    List<Task> findByPriorityAndStatus(Task.Priority priority, Task.Status status);
    
    // Custom JPQL query
    @Query("SELECT t FROM Task t WHERE t.createdAt >= :since ORDER BY t.priority DESC")
    List<Task> findRecentTasks(@Param("since") LocalDateTime since);
    
    // Native SQL query
    @Query(value = "SELECT COUNT(*) FROM tasks WHERE status = :status", nativeQuery = true)
    long countByStatus(@Param("status") String status);
}

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
}
```

### Step 5: DTOs — Never Expose Entities Directly

```java
// Request DTO — what the client sends
public record CreateTaskRequest(
    @NotBlank String title,
    @Size(max = 2000) String description,
    Task.Priority priority,
    Long assigneeId
) {}

public record UpdateTaskRequest(
    @Size(max = 200) String title,
    @Size(max = 2000) String description,
    Task.Priority priority,
    Task.Status status
) {}

// Response DTO — what the client receives
public record TaskResponse(
    Long id,
    String title,
    String description,
    String priority,
    String status,
    String assignee,
    LocalDateTime createdAt,
    LocalDateTime updatedAt
) {
    // Static factory method — converts entity to DTO
    public static TaskResponse from(Task task) {
        return new TaskResponse(
            task.getId(),
            task.getTitle(),
            task.getDescription(),
            task.getPriority().name(),
            task.getStatus().name(),
            task.getAssignee() != null ? task.getAssignee().getUsername() : null,
            task.getCreatedAt(),
            task.getUpdatedAt()
        );
    }
}
```

### Step 6: Service Layer — Business Logic

```java
@Service
@Transactional
public class TaskService {
    
    private final TaskRepository taskRepo;
    private final UserRepository userRepo;
    
    // Constructor injection — preferred over @Autowired
    public TaskService(TaskRepository taskRepo, UserRepository userRepo) {
        this.taskRepo = taskRepo;
        this.userRepo = userRepo;
    }
    
    public TaskResponse createTask(CreateTaskRequest request) {
        Task task = new Task(request.title(), request.description(), request.priority());
        
        // Assign user if provided
        if (request.assigneeId() != null) {
            User assignee = userRepo.findById(request.assigneeId())
                .orElseThrow(() -> new ResourceNotFoundException("User not found: " + request.assigneeId()));
            task.setAssignee(assignee);
        }
        
        Task saved = taskRepo.save(task);
        return TaskResponse.from(saved);
    }
    
    public TaskResponse updateTask(Long id, UpdateTaskRequest request) {
        Task task = taskRepo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Task not found: " + id));
        
        // Only update non-null fields
        if (request.title() != null) task.setTitle(request.title());
        if (request.description() != null) task.setDescription(request.description());
        if (request.priority() != null) task.setPriority(request.priority());
        if (request.status() != null) task.setStatus(request.status());
        
        Task saved = taskRepo.save(task);
        return TaskResponse.from(saved);
    }
    
    public List<TaskResponse> getTasksByStatus(Task.Status status) {
        return taskRepo.findByStatus(status).stream()
            .map(TaskResponse::from)
            .toList();
    }
    
    public void deleteTask(Long id) {
        if (!taskRepo.existsById(id)) {
            throw new ResourceNotFoundException("Task not found: " + id);
        }
        taskRepo.deleteById(id);
    }
}
```

### Step 7: REST Controller

```java
@RestController
@RequestMapping("/api/tasks")
@Validated
public class TaskController {
    
    private final TaskService taskService;
    
    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }
    
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TaskResponse createTask(@Valid @RequestBody CreateTaskRequest request) {
        return taskService.createTask(request);
    }
    
    @PutMapping("/{id}")
    public TaskResponse updateTask(@PathVariable Long id, @Valid @RequestBody UpdateTaskRequest request) {
        return taskService.updateTask(id, request);
    }
    
    @GetMapping("/status/{status}")
    public List<TaskResponse> getByStatus(@PathVariable Task.Status status) {
        return taskService.getTasksByStatus(status);
    }
    
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTask(@PathVariable Long id) {
        taskService.deleteTask(id);
    }
}
```

### Step 8: Security Configuration

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())  // REST APIs don't use cookies
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/tasks/**").authenticated()
                .anyRequest().denyAll()
            )
            .httpBasic(Customizer.withDefaults());
        
        return http.build();
    }
    
    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
```

### Step 9: Global Exception Handler

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ResourceNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleNotFound(ResourceNotFoundException ex) {
        return new ErrorResponse(404, ex.getMessage());
    }
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .collect(Collectors.joining(", "));
        return new ErrorResponse(400, message);
    }
    
    @ExceptionHandler(Exception.class)
    @ResponseStatus(HttpStatus.INTERNAL_SERVER_ERROR)
    public ErrorResponse handleGeneral(Exception ex) {
        return new ErrorResponse(500, "Internal server error");
    }
    
    public record ErrorResponse(int status, String message) {}
}
```

---

## Testing the Application

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
class TaskControllerTest {
    
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    
    @Test
    void shouldCreateTask() throws Exception {
        CreateTaskRequest request = new CreateTaskRequest("Fix bug", "Login page broken", Task.Priority.HIGH, null);
        
        mockMvc.perform(post("/api/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.title").value("Fix bug"))
            .andExpect(jsonPath("$.priority").value("HIGH"))
            .andExpect(jsonPath("$.status").value("TODO"));
    }
    
    @Test
    void shouldRejectBlankTitle() throws Exception {
        CreateTaskRequest request = new CreateTaskRequest("", null, Task.Priority.LOW, null);
        
        mockMvc.perform(post("/api/tasks")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.containsString("required")));
    }
}
```

---

## Common Mistakes

| Mistake | Why It's Wrong | Fix |
|---------|---------------|-----|
| Exposing JPA entities in controller | Leaks DB structure, circular references | Use DTOs with `from()` factory methods |
| `@Autowired` on fields | Hard to test, hidden dependencies | Use constructor injection |
| No transaction on service methods | Data inconsistency on partial failures | Add `@Transactional` on service class or methods |
| Catching all exceptions in controller | Hides bugs | Use `@RestControllerAdvice` with specific handlers |
| Storing passwords in plain text | Security breach | Always use `BCryptPasswordEncoder` |
| N+1 queries in JPA | Performance disaster | Use `@EntityGraph` or `JOIN FETCH` |
