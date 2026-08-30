---
title: "Spring Boot Full-Stack — Building Complete Web Applications"
order: 1
minutes: 35
topics: ["spring-boot", "fullstack", "thymeleaf", "spring-data-jpa", "spring-security", "server-side-rendering", "mvc", "form-handling", "error-handling"]
summary: "Build a complete full-stack application with Spring Boot: server-side rendering with Thymeleaf, database persistence with JPA, and security with Spring Security."
docs:
  - title: "Getting Started with Spring Boot"
    url: "https://spring.io/guides/gs/serving-web-content"
  - title: "Spring Boot Reference Documentation"
    url: "https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/"
---

# Spring Boot Full-Stack — Building Complete Web Applications

## The Concept, From Zero

Most Spring Boot tutorials teach you to build REST APIs. But what if you need a complete web application — with HTML pages, forms, database persistence, user login, and security? That's **full-stack** development with Spring Boot.

Spring Boot makes full-stack development surprisingly simple:
1. **Thymeleaf** renders HTML templates server-side (no separate React/Vue needed)
2. **Spring Data JPA** handles database operations with minimal code
3. **Spring Security** provides authentication and authorization
4. **Spring MVC** routes requests to controllers

The result: a single Spring Boot application that serves both the API and the HTML pages. No separate frontend build, no CORS issues, no deployment complexity.

## The Code Walkthrough

### Step 1: The Domain Model

```java
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

@Entity                                                    // (1) This is a JPA entity
@Table(name = "tasks")                                     // (2) Maps to "tasks" table
public class Task {

    @Id                                                    // (3) Primary key
    @GeneratedValue(strategy = GenerationType.IDENTITY)    // (4) Auto-increment
    private Long id;

    @NotBlank(message = "Title is required")               // (5) Bean Validation
    @Size(max = 100, message = "Title must be under 100 characters")
    private String title;

    @Column(length = 500)                                  // (6) Column constraint
    private String description;

    @Enumerated(EnumType.STRING)                           // (7) Store enum as String, not ordinal
    private Priority priority = Priority.MEDIUM;

    private boolean completed = false;

    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    // No-arg constructor (required by JPA)
    protected Task() {}

    // All-args constructor for convenience
    public Task(String title, String description, Priority priority) {
        this.title = title;
        this.description = description;
        this.priority = priority;
    }

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Priority getPriority() { return priority; }
    public void setPriority(Priority priority) { this.priority = priority; }
    public boolean isCompleted() { return completed; }
    public void setCompleted(boolean completed) { this.completed = completed; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    // Helper method for display
    public String getPriorityColor() {
        return switch (priority) {
            case HIGH -> "danger";
            case MEDIUM -> "warning";
            case LOW -> "success";
        };
    }
}

public enum Priority {
    LOW, MEDIUM, HIGH
}
```

**Line-by-line explanation:**

| Annotation | What it does | Why it matters |
|-----------|-------------|----------------|
| `@Entity` | Tells JPA this class maps to a database table | Without it, JPA ignores the class |
| `@Table(name = "tasks")` | Explicit table name | Default is class name; explicit is clearer |
| `@Id` + `@GeneratedValue` | Primary key with auto-increment | Database generates IDs automatically |
| `@NotBlank` + `@Size` | Bean Validation constraints | Spring validates before saving; returns error messages |
| `@Enumerated(EnumType.STRING)` | Stores enum name as text | `ordinal` is fragile — inserting a new enum shifts all ordinals |

### Step 2: The Repository (Data Access Layer)

```java
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

@Repository                                                 // (1) Marks this as a Spring bean
public interface TaskRepository extends JpaRepository<Task, Long> {

    // (2) Spring Data derives the query from the method name!
    List<Task> findByCompleted(boolean completed);

    // (3) Custom JPQL query
    @Query("SELECT t FROM Task t WHERE t.title LIKE %:keyword% OR t.description LIKE %:keyword%")
    List<Task> search(String keyword);

    // (4) Count by priority
    long countByPriority(Priority priority);

    // (5) Find top N recent tasks
    List<Task> findTop5ByOrderByCreatedAtDesc();
}
```

**Line-by-line explanation:**

| Line | What it does | Why it matters |
|------|-------------|----------------|
| `extends JpaRepository<Task, Long>` | Inherits save(), findAll(), findById(), delete(), etc. | No need to write basic CRUD — it's free |
| `findByCompleted(boolean)` | Spring Data parses this method name → generates SQL | `SELECT * FROM tasks WHERE completed = ?` — zero SQL written |
| `@Query("SELECT t FROM Task t WHERE ...")` | Custom JPQL when method names aren't expressive enough | JPQL uses entity names, not table names |
| `countByPriority(Priority)` | Another derived query | Returns a single count — useful for dashboards |
| `findTop5ByOrderByCreatedAtDesc()` | Derived query with sorting and limiting | `ORDER BY created_at DESC LIMIT 5` |

### Step 3: The Service Layer

```java
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service                                                     // (1) Spring manages this bean
@Transactional                                               // (2) All methods run in a transaction
public class TaskService {

    private final TaskRepository taskRepository;

    // (3) Constructor injection — Spring auto-wires the repository
    public TaskService(TaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    public Task getById(Long id) {
        return taskRepository.findById(id)
            .orElseThrow(() -> new TaskNotFoundException(id));
    }

    public Task createTask(Task task) {
        return taskRepository.save(task);                      // (4) save() handles INSERT
    }

    public Task updateTask(Long id, Task updated) {
        Task existing = getById(id);
        existing.setTitle(updated.getTitle());
        existing.setDescription(updated.getDescription());
        existing.setPriority(updated.getPriority());
        return taskRepository.save(existing);                  // (5) save() handles UPDATE when id exists
    }

    @Transactional                                            // (6) Override class-level for specific behavior
    public void toggleComplete(Long id) {
        Task task = getById(id);
        task.setCompleted(!task.isCompleted());
        // No explicit save() needed — dirty checking auto-saves
    }

    public void deleteTask(Long id) {
        taskRepository.deleteById(id);
    }

    public long getStats() {
        return taskRepository.count();                         // (7) Simple count query
    }
}

// Custom exception
public class TaskNotFoundException extends RuntimeException {
    public TaskNotFoundException(Long id) {
        super("Task not found with id: " + id);
    }
}
```

### Step 4: The Controller (Web Layer)

```java
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;

@Controller                                                   // (1) Returns view names, not JSON
@RequestMapping("/tasks")                                     // (2) All routes start with /tasks
public class TaskController {

    private final TaskService taskService;

    public TaskController(TaskService taskService) {
        this.taskService = taskService;
    }

    @GetMapping                                                // (3) GET /tasks → show list
    public String listTasks(Model model) {
        model.addAttribute("tasks", taskService.getAllTasks());  // (4) Pass data to template
        model.addAttribute("stats", taskService.getStats());
        return "task-list";                                     // (5) Returns task-list.html
    }

    @GetMapping("/new")                                        // (6) GET /tasks/new → show form
    public String showCreateForm(Model model) {
        model.addAttribute("task", new Task());                 // (7) Empty task for form binding
        model.addAttribute("priorities", Priority.values());   // (8) For dropdown options
        return "task-form";
    }

    @PostMapping                                               // (9) POST /tasks → save
    public String createTask(@Valid @ModelAttribute Task task,
                             BindingResult result) {
        if (result.hasErrors()) {                               // (10) Validation failed → re-show form
            return "task-form";
        }
        taskService.createTask(task);
        return "redirect:/tasks";                              // (11) PRG pattern — redirect after POST
    }

    @GetMapping("/{id}/edit")
    public String showEditForm(@PathVariable Long id, Model model) {
        model.addAttribute("task", taskService.getById(id));
        model.addAttribute("priorities", Priority.values());
        return "task-form";                                    // (12) Reuse same form for edit
    }

    @PostMapping("/{id}")
    public String updateTask(@PathVariable Long id,
                             @Valid @ModelAttribute Task task,
                             BindingResult result) {
        if (result.hasErrors()) return "task-form";
        taskService.updateTask(id, task);
        return "redirect:/tasks";
    }

    @PostMapping("/{id}/toggle")
    public String toggleComplete(@PathVariable Long id) {
        taskService.toggleComplete(id);
        return "redirect:/tasks";
    }

    @PostMapping("/{id}/delete")
    public String deleteTask(@PathVariable Long id) {
        taskService.deleteTask(id);
        return "redirect:/tasks";
    }
}
```

### Step 5: The Thymeleaf Template

```html
<!-- src/main/resources/templates/task-list.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head>
    <title>Task Manager</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body>
    <div class="container mt-4">
        <h1>Tasks <span class="badge bg-primary" th:text="${stats}">0</span></h1>

        <!-- (1) Link to create form -->
        <a th:href="@{/tasks/new}" class="btn btn-success mb-3">New Task</a>

        <!-- (2) Iterate over tasks -->
        <div class="list-group">
            <div th:each="task : ${tasks}" class="list-group-item d-flex justify-content-between align-items-center">
                <div>
                    <!-- (3) Conditional styling for completed tasks -->
                    <h5 th:class="${task.completed} ? 'text-decoration-line-through text-muted'" 
                        th:text="${task.title}">Task Title</h5>
                    <small class="text-muted" th:text="${task.description}">Description</small>
                    <!-- (4) Priority badge with dynamic color -->
                    <span th:class="'badge bg-' + ${task.priorityColor}" 
                          th:text="${task.priority}">MEDIUM</span>
                </div>
                <div>
                    <!-- (5) Toggle complete button -->
                    <form th:action="@{/tasks/{id}/toggle(id=${task.id})}" method="post" class="d-inline">
                        <button class="btn btn-sm" 
                                th:classappend="${task.completed} ? 'btn-warning' : 'btn-success'"
                                th:text="${task.completed} ? 'Undo' : 'Done'">Done</button>
                    </form>
                    <!-- (6) Edit link -->
                    <a th:href="@{/tasks/{id}/edit(id=${task.id})}" class="btn btn-sm btn-primary">Edit</a>
                    <!-- (7) Delete button with confirmation -->
                    <form th:action="@{/tasks/{id}/delete(id=${task.id})}" method="post" class="d-inline">
                        <button class="btn btn-sm btn-danger" 
                                onclick="return confirm('Are you sure?')">Delete</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- (8) Empty state -->
        <div th:if="${#lists.isEmpty(tasks)}" class="text-center mt-5">
            <h3 class="text-muted">No tasks yet</h3>
            <a th:href="@{/tasks/new}" class="btn btn-primary">Create your first task</a>
        </div>
    </div>
</body>
</html>
```

## Real-World Scenarios

### Scenario 1: Admin dashboard with user management
```java
@Controller
@RequestMapping("/admin/users")
@PreAuthorize("hasRole('ADMIN')")    // Only admins can access
public class AdminUserController {
    // Only admin sees user list, can ban/unban, reset passwords
}
```

### Scenario 2: E-commerce product catalog
```java
@Controller
@RequestMapping("/products")
public class ProductController {
    @GetMapping
    public String list(@RequestParam(required = false) String category, Model model) {
        if (category != null) {
            model.addAttribute("products", productRepo.findByCategory(category));
        } else {
            model.addAttribute("products", productRepo.findAll());
        }
        return "product-list";
    }
}
```

## Common Beginner Pitfalls

1. **Using @RestController instead of @Controller** — @RestController returns JSON, not HTML view names
2. **Forgetting @Valid** — without it, Bean Validation constraints are never checked
3. **Not using PRG pattern** — returning a template from POST causes duplicate submissions on refresh
4. **N+1 query problem** — use `@EntityGraph` or `JOIN FETCH` to load related entities
5. **Leaking passwords in templates** — use `@JsonIgnore` or `@XmlTransient` on sensitive fields
6. **Not using transaction boundaries** — put `@Transactional` on the service, not the controller

## Key Takeaways

- **@Controller** returns view names (HTML); **@RestController** returns data (JSON)
- **Thymeleaf** uses `th:text`, `th:each`, `th:if` to render dynamic HTML
- **JPA Repository** method names generate queries automatically — `findByTitle` → `WHERE title = ?`
- **@Valid + BindingResult** validate inputs before saving
- **PRG (Post-Redirect-Get)** prevents duplicate form submissions
- **Service layer** handles business logic; **Controller** handles HTTP; **Repository** handles data
