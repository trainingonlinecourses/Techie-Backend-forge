---
title: View Resolvers and Rendering
module: spring-webmvc-advanced
order: 4
minutes: 18
topics: ["ViewResolver", "Thymeleaf", "View", "model attributes", "redirect vs forward", "template engines"]
summary: A controller returns a logical view name; a ViewResolver turns it into rendered HTML. Understanding the resolver chain, the model, and the redirect...
docs:
  - title: "View resolution"
    url: "https://docs.spring.io/spring-framework/reference/web/webmvc.html#mvc-viewresolver"
---

# View Resolvers and Rendering

A controller returns a logical view name; a `ViewResolver` turns it into rendered HTML. Understanding the resolver chain, the model, and the redirect/forward distinction is what makes server-rendered MVC apps behave predictably.

## The Flow

```
Controller returns "course/detail"
        │
        ▼
ViewResolver chain
  ├─ ThymeleafViewResolver  → templates/course/detail.html
  └─ (fallback)             → error if not found
        │
        ▼
View.render(model, request, response)
```

## ViewResolver Chain

Spring checks resolvers **in order** and uses the first that resolves:

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureViewResolvers(ViewResolverRegistry registry) {
        registry.thymeleaf();                    // Thymeleaf
        registry.freeMarker();                   // FreeMarker as fallback
        registry.jsp("/WEB-INF/jsp/", ".jsp");   // JSP last
    }
}
```

Precedence is configuration order: put the primary engine first.

## Thymeleaf: The Modern Default

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-thymeleaf</artifactId>
</dependency>
```

```java
@Controller
public class CourseController {

    @GetMapping("/courses/{id}")
    public String detail(@PathVariable Long id, Model model) {
        model.addAttribute("course", courseService.findById(id));
        return "course/detail";     // → templates/course/detail.html
    }
}
```

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<body>
  <h1 th:text="${course.title}">Title</h1>
  <p th:text="${course.summary}">Summary</p>
  <span th:if="${course.published}">Published</span>
  <ul>
    <li th:each="lesson : ${course.lessons}"
        th:text="${lesson.title}">Lesson</li>
  </ul>
</body>
</html>
```

Thymeleaf templates are valid HTML that render in the browser even before the server processes them — designers can preview real templates.

## The Model: What Views See

- `model.addAttribute(...)` — per-request data.
- `@ModelAttribute` methods — populated for **every** handler in the controller:

```java
@Controller
public class BaseController {

    @ModelAttribute("appName")
    public String appName() {
        return "BackendForge Academy";
    }

    @ModelAttribute("currentUser")
    public User currentUser(Authentication authentication) {
        return authentication == null ? null : userService.find(authentication.getName());
    }
}
```

These appear in every template as `${appName}`, `${currentUser}`.

## Redirect vs. Forward

| Mechanism | What happens | Use for |
|-----------|--------------|---------|
| `return "redirect:/courses"` | 302 → browser hits `/courses` | After POST (PRG pattern) |
| `return "forward:/courses"` | Server-side dispatch, same request | Internal routing |

### The PRG Pattern (Post-Redirect-Get)

Never return a view directly after a state-changing POST — a refresh would resubmit:

```java
@PostMapping("/courses")
public String create(@Valid @ModelAttribute CourseForm form, BindingResult result) {
    if (result.hasErrors()) return "course/form";
    Course course = courseService.create(form);
    return "redirect:/courses/" + course.getId();   // PRG
}
```

### Redirect Attributes

Pass data through a redirect:

```java
return RedirectAttributes redirectAttributes) {
    ...
    redirectAttributes.addFlashAttribute("message", "Course created");
    return "redirect:/courses";
}
```

Flash attributes survive exactly one redirect and vanish — perfect for one-shot success messages.

## View Names and the Dispatcher

Controller methods may return:

- `String` — logical view name (most common)
- `ModelAndView` — view + model together
- `void` + `@ResponseStatus` — body written directly
- `ResponseEntity` / `@ResponseBody` — no view at all

```java
@GetMapping("/courses/{id}")
public ModelAndView detail(@PathVariable Long id) {
    ModelAndView mav = new ModelAndView("course/detail");
    mav.addObject("course", courseService.findById(id));
    return mav;
}
```

## Content Negotiation With Views

The same data as HTML **or** JSON depending on `Accept`:

```java
@GetMapping("/courses/{id}")
public String detail(@PathVariable Long id, Model model) {
    model.addAttribute("course", courseService.findById(id));
    return "course/detail";     // HTML view
}

@GetMapping(value = "/courses/{id}", produces = MediaType.APPLICATION_JSON_VALUE)
public @ResponseBody CourseDto detailJson(@PathVariable Long id) {
    return CourseDto.from(courseService.findById(id));
}
```

`produces` routes `Accept: application/json` to the second handler; browsers (HTML Accept) get the view.

## Template Engine Comparison

| Engine | Strengths | Weaknesses |
|--------|-----------|------------|
| Thymeleaf | Natural templates, Spring integration, modern | Slightly slower |
| FreeMarker | Fast, flexible, simple syntax | Escaping foot-guns |
| JSP | Old-school, JSTL | Deprecated for new apps |
| Mustache | Minimal, logic-less | Too limited for complex UIs |

For new Spring MVC apps: **Thymeleaf**, period.

## Testing Views

```java
@SpringBootTest
@AutoConfigureMockMvc
class ViewTest {

    @Autowired MockMvc mockMvc;

    @Test
    void rendersCourseDetail() throws Exception {
        mockMvc.perform(get("/courses/1"))
            .andExpect(status().isOk())
            .andExpect(view().name("course/detail"))
            .andExpect(model().attributeExists("course"))
            .andExpect(content().string(containsString("Spring Boot")));
    }

    @Test
    void postRedirectsAfterCreate() throws Exception {
        mockMvc.perform(post("/courses")
                .param("title", "New Course"))
            .andExpect(status().is3xxRedirection())
            .andExpect(redirectedUrlPattern("/courses/*"));
    }
}
```

## Summary

| Concern | Mechanism |
|---------|-----------|
| View name → template | ViewResolver chain (Thymeleaf first) |
| Data for the view | Model attributes + `@ModelAttribute` methods |
| After POST | Redirect (PRG) + flash attributes |
| Same request routing | Forward |
| One endpoint, two formats | `produces` + `@ResponseBody` |
| Engine choice | Thymeleaf for new apps |

View resolution is the classic MVC tail: controller computes, resolver renders. Keep views thin, keep redirects honest, and the server-rendered part of your app stays as maintainable as the REST half.
