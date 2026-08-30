---
title: Testing Your Starter — Auto-Configuration Tests
summary: How to write tests for Spring Boot auto-configuration, using ApplicationContextRunner, verifying conditional beans, and testing configuration properties.
order: 4
minutes: 15
topics: [starter-testing, application-context-runner, conditional-bean-test, configuration-test]
docs:
  - https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html
---

## The Concept, From Zero

Spring Boot provides `ApplicationContextRunner` to test auto-configuration without starting the full application context. It's fast and lets you verify conditional behavior.

```java
@Test
void testAutoConfiguration() {
    new ApplicationContextRunner()
        .withUserConfiguration(TestConfig.class)
        .withPropertyValues("my.starter.enabled=true")
        .run(context -> {
            assertThat(context).hasSingleBean(MyService.class);
            assertThat(context).hasSingleBean(MyProperties.class);
        });
}
```

---

## Line-by-Line Walkthrough

```java
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

public class MyAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(MyAutoConfiguration.class));

    // 1. Bean is created by default
    @Test
    void testBeanCreated() {
        runner.run(context -> {
            assertThat(context).hasSingleBean(MyService.class);
            MyService service = context.getBean(MyService.class);
            assertThat(service).isNotNull();
        });
    }

    // 2. Bean is NOT created when property is false
    @Test
    void testBeanDisabled() {
        runner.withPropertyValues("my.starter.enabled=false")
            .run(context -> {
                assertThat(context).doesNotHaveBean(MyService.class);
            });
    }

    // 3. User can override the bean
    @Test
    void testUserOverride() {
        runner.withUserConfiguration(UserCustomConfig.class)
            .run(context -> {
                assertThat(context).hasSingleBean(MyService.class);
                assertThat(context.getBean(MyService.class))
                    .isInstanceOf(CustomMyService.class);
            });
    }

    @Test
    void testPropertiesBinding() {
        runner.withPropertyValues(
                "my.starter.url=http://example.com",
                "my.starter.timeout=5000"
            )
            .run(context -> {
                MyProperties props = context.getBean(MyProperties.class);
                assertThat(props.getUrl()).isEqualTo("http://example.com");
                assertThat(props.getTimeout()).isEqualTo(5000);
            });
    }

    static class UserCustomConfig {
        @Bean
        MyService customMyService() {
            return new CustomMyService();
        }
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not using ApplicationContextRunner | Slow, full context load | Always use it for starter tests |
| Forgetting to test disabled state | Missing conditional logic test | Test both enabled and disabled |
| Not testing property binding | Config values ignored | Test with withPropertyValues |
| Testing with @SpringBootTest | Overkill for starter tests | Use ApplicationContextRunner |
