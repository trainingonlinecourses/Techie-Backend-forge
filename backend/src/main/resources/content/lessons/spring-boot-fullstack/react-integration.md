---
title: Spring Boot + React Full Stack — API-First Development
summary: Building a full-stack application with Spring Boot backend and React frontend, covering CORS configuration, API-first design, proxy setup for development, and production deployment.
order: 4
minutes: 22
topics: [react-integration, cors, proxy, api-first, full-stack, vite]
docs:
  - https://spring.io/guides/tutorials/react-and-spring-data-rest/
---

## The Concept, From Zero

Modern full-stack apps separate the backend (Spring Boot REST API) from the frontend (React SPA). They communicate over HTTP — the backend exposes JSON endpoints, the frontend fetches them and renders UI.

During development, they run on different ports (8080 for Spring Boot, 5173 for Vite). A proxy forwards frontend requests to the backend, avoiding CORS issues. In production, they're often served from the same origin.

## The Code

### Spring Boot Backend
```java
@RestController
@RequestMapping("/api/courses")
@CrossOrigin(origins = "http://localhost:5173")
public class CourseController {

    @Autowired private CourseRepository repo;

    @GetMapping
    public Page<Course> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return repo.findAll(PageRequest.of(page, size));
    }

    @GetMapping("/{id}")
    public Course getOne(@PathVariable Long id) {
        return repo.findById(id)
            .orElseThrow(() -> new CourseNotFoundException(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public Course create(@Valid @RequestBody Course course) {
        return repo.save(course);
    }
}
```

### React Frontend
```javascript
// src/api/courses.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',  // Proxy handles forwarding
  timeout: 10000,
});

export const fetchCourses = (page = 0) =>
  api.get('/courses', { params: { page } }).then(r => r.data);

export const fetchCourse = (id) =>
  api.get('/courses/' + id).then(r => r.data);

export const createCourse = (course) =>
  api.post('/courses', course).then(r => r.data);
```

### Vite Proxy Config
```javascript
// vite.config.js
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      }
    }
  }
});
```

## Key Takeaways

1. **Proxy in development** — avoids CORS, seamless API calls
2. **Same origin in production** — nginx serves both static files and proxies /api
3. **API-first design** — define the contract before building either side
4. **axios/fetch** — use baseURL to keep API calls portable
5. **Spring CORS annotation** — @CrossOrigin for development flexibility
