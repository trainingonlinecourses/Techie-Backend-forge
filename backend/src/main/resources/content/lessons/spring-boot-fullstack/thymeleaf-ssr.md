---
title: Full-Stack with Thymeleaf — Server-Side Rendering in Spring Boot
summary: Building a complete web application with Thymeleaf templates, form handling, Spring Data JPA, and Spring Security — when you want HTML served from Java, not a separate frontend.
order: 3
minutes: 26
topics: [thymeleaf, server-side-rendering, form-handling, template-engine, mvc]
docs:
  - https://www.thymeleaf.org/doc/tutorials/3.1/understandingthymeleaf
  - https://spring.io/guides/gs/serving-web-content
---

## The Concept, From Zero

While React/Angular/Vue handle rendering in the browser, **Thymeleaf** renders HTML on the server. The browser receives fully-formed HTML pages. This is called **Server-Side Rendering (SSR)**.

**Why choose Thymeleaf over a SPA (Single Page Application)?**
- **SEO** — search engines see complete HTML (SPAs need extra work for this)
- **Simplicity** — no build step, no npm, no webpack — just Java and HTML
- **Fast initial load** — no waiting for JavaScript bundles to download
- **Progressive enhancement** — works even if JavaScript is disabled
- **Spring Boot integration** — zero-config, just add the dependency

**When NOT to use it:**
- Highly interactive UIs (dashboards, real-time updates)
- Mobile apps that share API with web
- When you need offline support

---

## Building a Task Manager with Thymeleaf

### Step 1: Dependencies

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-thymeleaf</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
```

### Step 2: Entity (same as REST version)

```java
@Entity
@Table(name = "tasks")
public class Task {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    
    @NotBlank(message = "Title is required")
    private String title;
    
    private String description;
    
    @Enumerated(EnumType.STRING)
    private Priority priority = Priority.MEDIUM;
    
    @Enumerated(EnumType.STRING)
    private Status status = Status.TODO;
    
    // Getters, setters, enums...
    public enum Priority { LOW, MEDIUM, HIGH }
    public enum Status { TODO, IN_PROGRESS, DONE }
}
```

### Step 3: Repository

```java
@Repository
public interface TaskRepository extends JpaRepository<Task, Long> {
    List<Task> findByOrderByCreatedAtDesc();
    List<Task> findByStatusOrderByPriorityDesc(Task.Status status);
}
```

### Step 4: Controller (Web MVC, not REST)

```java
@Controller
public class TaskController {
    
    private final TaskRepository taskRepo;
    
    public TaskController(TaskRepository taskRepo) {
        this.taskRepo = taskRepo;
    }
    
    // Show all tasks
    @GetMapping("/")
    public String listTasks(Model model) {
        model.addAttribute("tasks", taskRepo.findByOrderByCreatedAtDesc());
        model.addAttribute("statuses", Task.Status.values());
        model.addAttribute("priorities", Task.Priority.values());
        return "task-list";  // Maps to src/main/resources/templates/task-list.html
    }
    
    // Show create form
    @GetMapping("/tasks/new")
    public String showCreateForm(Model model) {
        model.addAttribute("task", new Task());
        model.addAttribute("priorities", Task.Priority.values());
        return "task-form";
    }
    
    // Handle form submission
    @PostMapping("/tasks")
    public String createTask(@Valid @ModelAttribute Task task, BindingResult result) {
        if (result.hasErrors()) {
            return "task-form";  // Re-show form with errors
        }
        taskRepo.save(task);
        return "redirect:/";  // PRG pattern — redirect after POST
    }
    
    // Show edit form
    @GetMapping("/tasks/{id}/edit")
    public String showEditForm(@PathVariable Long id, Model model) {
        Task task = taskRepo.findById(id)
            .orElseThrow(() -> new ResourceNotFoundException("Task not found"));
        model.addAttribute("task", task);
        model.addAttribute("priorities", Task.Priority.values());
        model.addAttribute("statuses", Task.Status.values());
        return "task-form";
    }
    
    // Update task
    @PostMapping("/tasks/{id}")
    public String updateTask(@PathVariable Long id, @Valid @ModelAttribute Task task, 
                            BindingResult result) {
        if (result.hasErrors()) {
            return "task-form";
        }
        task.setId(id);
        taskRepo.save(task);
        return "redirect:/";
    }
    
    // Delete task
    @PostMapping("/tasks/{id}/delete")
    public String deleteTask(@PathVariable Long id) {
        taskRepo.deleteById(id);
        return "redirect:/";
    }
}
```

### Step 5: Thymeleaf Templates

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
        <h1>Task Manager</h1>
        
        <a th:href="@{/tasks/new}" class="btn btn-primary mb-3">New Task</a>
        
        <!-- Thymeleaf iterates over the tasks list -->
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <!-- th:each is like a for-each loop -->
                <tr th:each="task : ${tasks}">
                    <td th:text="${task.title}">Title here</td>
                    <!-- Conditional CSS class based on priority -->
                    <td>
                        <span th:text="${task.priority}" 
                              th:classappend="${task.priority == 'HIGH'} ? 'text-danger' : ''">
                        </span>
                    </td>
                    <!-- Status badge with conditional colors -->
                    <td>
                        <span th:text="${task.status}" 
                              class="badge"
                              th:classappend="${task.status.name() == 'DONE'} ? 'bg-success' : 
                                              (${task.status.name() == 'IN_PROGRESS'} ? 'bg-warning' : 'bg-secondary')">
                        </span>
                    </td>
                    <td>
                        <a th:href="@{/tasks/{id}/edit(id=${task.id})}" class="btn btn-sm btn-outline-primary">Edit</a>
                        <form th:action="@{/tasks/{id}/delete(id=${task.id})}" method="post" 
                              style="display:inline" 
                              onsubmit="return confirm('Delete this task?')">
                            <button type="submit" class="btn btn-sm btn-outline-danger">Delete</button>
                        </form>
                    </td>
                </tr>
            </tbody>
        </table>
        
        <!-- Empty state -->
        <div th:if="${#lists.isEmpty(tasks)}" class="text-center text-muted py-5">
            <h3>No tasks yet</h3>
            <p>Create your first task to get started!</p>
        </div>
    </div>
</body>
</html>
```

```html
<!-- src/main/resources/templates/task-form.html -->
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<head>
    <title th:text="${task.id != null} ? 'Edit Task' : 'New Task'">Task Form</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css">
</head>
<body>
    <div class="container mt-4">
        <h2 th:text="${task.id != null} ? 'Edit Task' : 'New Task'">Task Form</h2>
        
        <!-- Bind form to task object -->
        <form th:action="@{/tasks/{id}(id=${task.id})}" th:object="${task}" method="post">
            
            <div class="mb-3">
                <label for="title" class="form-label">Title</label>
                <!-- th:field binds both name and value -->
                <input type="text" class="form-control" id="title" th:field="*{title}">
                <!-- Show validation error if title is blank -->
                <div class="text-danger" th:if="${#fields.hasErrors('title')}" th:errors="*{title}"></div>
            </div>
            
            <div class="mb-3">
                <label for="description" class="form-label">Description</label>
                <textarea class="form-control" id="description" th:field="*{description}" rows="3"></textarea>
            </div>
            
            <div class="mb-3">
                <label for="priority" class="form-label">Priority</label>
                <select class="form-select" id="priority" th:field="*{priority}">
                    <option th:each="p : ${priorities}" th:value="${p}" th:text="${p}">MEDIUM</option>
                </select>
            </div>
            
            <div class="mb-3" th:if="${task.id != null}">
                <label for="status" class="form-label">Status</label>
                <select class="form-select" id="status" th:field="*{status}">
                    <option th:each="s : ${statuses}" th:value="${s}" th:text="${s}">TODO</option>
                </select>
            </div>
            
            <button type="submit" class="btn btn-primary">Save</button>
            <a th:href="@{/}" class="btn btn-secondary">Cancel</a>
        </form>
    </div>
</body>
</html>
```

### Step 6: Security Configuration

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/css/**", "/js/**").permitAll()
                .anyRequest().authenticated()
            )
            .formLogin(form -> form
                .loginPage("/login")
                .defaultSuccessUrl("/")
                .permitAll()
            )
            .logout(logout -> logout
                .logoutSuccessUrl("/login?logout")
                .permitAll()
            );
        
        return http.build();
    }
}
```

---

## Thymeleaf Expression Language

```html
<!-- Variable expressions: ${...} -->
<p th:text="${user.name}">Name</p>

<!-- Selection expressions: *{...} — used inside th:object -->
<div th:object="${user}">
    <p th:text="*{name}">Name</p>
    <p th:text="*{email}">Email</p>
</div>

<!-- Message expressions: #{...} — i18n -->
<p th:text="#{welcome.message}">Welcome!</p>

<!-- Link expressions: @{...} -->
<a th:href="@{/tasks/{id}(id=${task.id})}">View</a>

<!-- Conditional expressions -->
<span th:if="${user.admin}">Admin</span>
<span th:unless="${user.admin}">User</span>

<!-- Switch/case -->
<div th:switch="${task.status}">
    <p th:case="'TODO'">Not started</p>
    <p th:case="'IN_PROGRESS'">Working on it</p>
    <p th:case="'DONE'">Completed!</p>
    <p th:case="*">Unknown status</p>
</div>

<!-- Utility methods -->
<p th:text="${#lists.size(tasks)} + ' tasks'"></p>
<p th:text="${#strings.abbreviate(task.description, 100)}"></p>
<p th:text="${#dates.format(task.createdAt, 'dd MMM yyyy')}"></p>
```

---

## Common Mistatures

| Mistake | Why It's Wrong | Fix |
|---------|---------------|-----|
| No PRG pattern on POST | Browser shows "Resubmit?" on refresh | Use `return "redirect:/"` after save |
| Exposing entities directly | Circular reference infinite loops | Use DTOs or `@JsonIgnore` |
| Forgetting `th:field` | Form data doesn't bind back on error | Always use `th:field="*{fieldName}"` |
| JavaScript in templates | Thymeleaf may escape it | Use `th:inline="javascript"` |
| Modifying data in GET | Violates HTTP semantics, bookmark issues | Only read in GET, write in POST/PUT/DELETE |
