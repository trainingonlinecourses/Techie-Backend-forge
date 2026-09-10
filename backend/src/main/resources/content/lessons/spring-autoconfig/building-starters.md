---
title: Custom Auto-Configuration — Building Your Own Starters
summary: How to create custom auto-configuration classes, register them with Spring Boot, build reusable starters, and how organizations package shared behavior.
order: 2
minutes: 25
topics: [custom-autoconfiguration, starter, META-INF, spring.factories, conditional]
docs:
  - https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html
  - https://docs.spring.io/spring-boot/reference/packaging-structre.html
---

## The Concept, From Zero

When you add `spring-boot-starter-data-jpa` to your project, Spring Boot automatically configures everything you need for JPA. That's auto-configuration.

Now imagine you want to create your own reusable library. You want other developers to just add your dependency and have it work automatically. That's **custom auto-configuration**.


**What this code does — step by step:**

1. Your library provides this:
2. Users just add your starter and it works: <dependency>. <groupId>com.yourcompany</groupId>. <artifactId>your-redis-spring-boot-starter</artifactId>. <version>1.0.0</version>. </dependency>

The same code, clean:

```java
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)
@EnableConfigurationProperties(MyRedisProperties.class)
public class MyRedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public RedisTemplate<String, Object> redisTemplate(RedisConnectionFactory factory) {
        RedisTemplate<String, Object> template = new RedisTemplate<>();
        template.setConnectionFactory(factory);
        return template;
    }
}
```

---

## How to Create a Custom Auto-Configuration

### Step 1: Create the Configuration Class


**What this code does — step by step:**

1. `@AutoConfiguration` — Marks this as auto-configuration
2. `@ConditionalOnClass(EmailService.class)` — Only if EmailService exists
3. `@EnableConfigurationProperties(EmailProperties.class)` — Enable properties binding
4. Only create if no EmailService bean exists
5. Only if SMTP is on classpath

The same code, clean:

```java
package com.yourcompany.email.autoconfigure;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;

@AutoConfiguration
@ConditionalOnClass(EmailService.class)
@EnableConfigurationProperties(EmailProperties.class)
public class EmailAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public EmailService emailService(EmailProperties properties) {
        return new SimpleEmailService(
            properties.getHost(),
            properties.getPort(),
            properties.getUsername()
        );
    }

    @Bean
    @ConditionalOnClass(name = "javax.mail.Transport")
    @ConditionalOnMissingBean
    public EmailSender smtpEmailSender(EmailProperties properties) {
        return new SmtpEmailSender(properties);
    }
}
```

### Step 2: Create Properties Class

package com.yourcompany.email.autoconfigure;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.email")
public record EmailProperties(
    String host,
    int port,
    String username,
    String password,
    boolean enabled
) {
    // Default values
    public EmailProperties {
        host = host != null ? host : "localhost";
        port = port > 0 ? port : 587;
        enabled = true;
    }
}

### Step 3: Register with Spring Boot

```properties
# src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.yourcompany.email.autoconfigure.EmailAutoConfiguration
```

Or for older versions:
```properties
# src/main/resources/META-INF/spring.factories
org.springframework.boot.autoconfigure.EnableAutoConfiguration=\
com.yourcompany.email.autoconfigure.EmailAutoConfiguration
```

---

## Line-by-Line Walkthrough


**What this code does — step by step:**

1. Line 1: The auto-configuration class
2. `@AutoConfiguration(after = DataSourceAutoConfiguration.class)` — Run after datasource is configured
3. `@ConditionalOnClass(SmtpClient.class)` — Only if email client exists
4. Line 2: Properties bean
5. Line 3: Main service bean
6. Line 4: Optional SMTP sender
7. Line 5: Health indicator
8. Line 6: Properties with validation

The same code, clean:

```java
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.*;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.*;
import org.springframework.boot.bind.relaxedBinding;

@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass(SmtpClient.class)
@ConditionalOnProperty(prefix = "app.email", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(EmailProperties.class)
public class EmailAutoConfiguration {

    @Bean
    @ConfigurationProperties(prefix = "app.email")
    public EmailProperties emailProperties() {
        return new EmailProperties();
    }

    @Bean
    @ConditionalOnMissingBean(EmailService.class)
    public EmailService emailService(EmailProperties properties, 
                                      ApplicationContext context) {
        return new DefaultEmailService(properties, context);
    }

    @Bean
    @ConditionalOnClass(name = "javax.mail.Transport")
    @ConditionalOnMissingBean(EmailSender.class)
    public EmailSender smtpSender(EmailProperties properties) {
        return new SmtpEmailSender(properties);
    }

    @Bean
    @ConditionalOnBean(EmailService.class)
    public EmailHealthIndicator emailHealthIndicator(EmailService service) {
        return new EmailHealthIndicator(service);
    }
}

@ConfigurationProperties(prefix = "app.email")
public record EmailProperties(
    @NotBlank String host,
    @Min(1) @Max(65535) int port,
    String username,
    String password,
    boolean enabled,
    @DefaultValue("UTF-8") String encoding
) {}
```

---

## Real-World Scenarios

### Scenario 1: Custom caching starter

@AutoConfiguration
@ConditionalOnClass(CacheManager.class)
@EnableConfigurationProperties(CacheProperties.class)
public class SmartCacheAutoConfiguration {
    
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "redis", matchIfMissing = false)
    public CacheManager redisCacheManager(RedisConnectionFactory factory) {
        return RedisCacheManager.builder(factory).build();
    }
    
    @Bean
    @ConditionalOnMissingBean
    @ConditionalOnProperty(name = "app.cache.type", havingValue = "caffeine", matchIfMissing = true)
    public CacheManager caffeineCacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(1000)
            .expireAfterWrite(10, TimeUnit.MINUTES));
        return manager;
    }
}

// Users configure in application.yml:
// app:
//   cache:
//     type: redis  # or caffeine

### Scenario 2: Custom security starter


**What this code does — step by step:**

1. application.yml: app: security: public-endpoints: - /api/public/**. - /actuator/health

The same code, clean:

```java
@AutoConfiguration
@ConditionalOnClass(SecurityFilterChain.class)
@EnableConfigurationProperties(SecurityProperties.class)
public class CustomSecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public SecurityFilterChain filterChain(HttpSecurity http, SecurityProperties props) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(props.getPublicEndpoints()).permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
            .build();
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting `@AutoConfiguration` | Not processed as auto-config | Add `@AutoConfiguration` |
| Wrong registration file | Config not loaded | Use correct path for your Spring Boot version |
| No `@ConditionalOnMissingBean` | Users can't override | Always add conditional on missing bean |
| Circular dependencies | Startup fails | Use `@Lazy` or restructure |
| Not setting `after`/`before` | Wrong initialization order | Use `after = OtherAutoConfiguration.class` |

---

## Testing Your Auto-Configuration

@SpringBootTest
class EmailAutoConfigurationTest {
    
    @Test
    void shouldCreateEmailServiceWhenClassExists() {
        new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(EmailAutoConfiguration.class))
            .withPropertyValues("app.email.enabled=true")
            .run(context -> {
                assertThat(context).hasSingleBean(EmailService.class);
                assertThat(context).hasSingleBean(EmailProperties.class);
            });
    }
    
    @Test
    void shouldNotCreateEmailServiceWhenDisabled() {
        new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(EmailAutoConfiguration.class))
            .withPropertyValues("app.email.enabled=false")
            .run(context -> {
                assertThat(context).doesNotHaveBean(EmailService.class);
            });
    }
}

