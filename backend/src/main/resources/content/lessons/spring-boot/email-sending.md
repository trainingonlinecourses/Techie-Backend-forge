---
title: Sending Email — SMTP, Templates, and Attachments
summary: JavaMailSender configuration, HTML email with Thymeleaf templates, attachments, async email sending, and how organizations build reliable email pipelines with retries and bounce handling.
order: 33
minutes: 18
topics: [email, javamailsender, smtp, thymeleaf-email, html-email, async-email, email-template, attachment]
docs:
  - https://docs.spring.io/spring-boot/docs/current/reference/html/io.html#io.email
  - https://docs.spring.io/spring-framework/reference/integration/email.html
---

# Sending Email — SMTP, Templates, Templates, and Attachments

## The concept

Email is one of the oldest and most reliable communication channels. Spring Boot integrates with JavaMailSender to send email via SMTP. You can send plain text, HTML with templates, and attachments.

**The production concern:** email is unreliable by nature. SMTP servers reject, delay, or bounce messages. Sending email synchronously in a request handler means your API is as slow as your SMTP server. The solution: async sending with a retry queue.

## Configuration

```yaml
# application.yml
spring:
  mail:
    host: smtp.gmail.com
    port: 587
    username: ${MAIL_USER}
    password: ${MAIL_PASS}
    properties:
      mail:
        smtp:
          auth: true
          starttls:
            enable: true
          connectiontimeout: 5000
          timeout: 5000
```

## Plain text email

```java
@Service
public class EmailService {

    private final JavaMailSender mailSender;

    public EmailService(JavaMailSender mailSender) {
        this.mailSender = mailSender;
    }

    public void sendWelcomeEmail(String to, String name) {
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom("noreply@backendforge.com");
        message.setTo(to);
        message.setSubject("Welcome to Backend Forge Academy");
        message.setText("Hi " + name + ", welcome aboard!");

        mailSender.send(message);
    }
}
```

## HTML email with Thymeleaf template

```java
@Service
public class TemplatedEmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    public TemplatedEmailService(JavaMailSender mailSender, TemplateEngine templateEngine) {
        this.mailSender = mailSender;
        this.templateEngine = templateEngine;
    }

    public void sendOrderConfirmation(Order order) {
        Context context = new Context();
        context.setVariable("orderId", order.id());
        context.setVariable("items", order.items());
        context.setVariable("total", order.total());

        String htmlBody = templateEngine.process("emails/order-confirmation", context);

        MimeMessage message = mailSender.createMimeMessage();
        try {
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom("orders@backendforge.com");
            helper.setTo(order.customerEmail());
            helper.setSubject("Order " + order.id() + " confirmed");
            helper.setText(htmlBody, true);  // true = HTML

            mailSender.send(message);
        } catch (MessagingException e) {
            throw new EmailException("Failed to send order confirmation", e);
        }
    }
}
```

## Email with attachment

```java
public void sendInvoice(Invoice invoice, Path pdfPath) {
    MimeMessage message = mailSender.createMimeMessage();
    try {
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom("billing@backendforge.com");
        helper.setTo(invoice.customerEmail());
        helper.setSubject("Invoice #" + invoice.id());
        helper.setText("Please find your invoice attached.", true);

        helper.addAttachment(
            "invoice-" + invoice.id() + ".pdf",
            pdfPath.toFile()
        );

        mailSender.send(message);
    } catch (MessagingException e) {
        throw new EmailException("Failed to send invoice", e);
    }
}
```

## Async email with retry

```java
@Service
public class AsyncEmailService {

    private final JavaMailSender mailSender;
    private final TemplateEngine templateEngine;

    @Async("emailExecutor")
    @Retryable(
        retryFor = {MailException.class, MailSendException.class},
        maxAttempts = 3,
        backoff = @Backoff(delay = 5000, multiplier = 2)
    )
    public CompletableFuture<Void> sendEmail(EmailRequest request) {
        MimeMessage message = mailSender.createMimeMessage();
        MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
        helper.setFrom(request.from());
        helper.setTo(request.to());
        helper.setSubject(request.subject());
        helper.setText(request.htmlBody(), true);

        mailSender.send(message);
        return CompletableFuture.completedFuture(null);
    }

    @Recover
    public void recoverSendEmail(MailException e, EmailRequest request) {
        // Log failed email, store in dead-letter queue, alert ops
        log.error("Email to {} failed after retries: {}", request.to(), e.getMessage());
        deadLetterQueue.store(request);
    }
}
```

```java
@Bean("emailExecutor")
public Executor emailExecutor() {
    ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
    executor.setCorePoolSize(2);
    executor.setMaxPoolSize(5);
    executor.setQueueCapacity(100);
    executor.setThreadNamePrefix("email-");
    executor.initialize();
    return executor;
}
```

## How we use it in organizations

### Scenario 1: welcome email on user registration

```java
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final AsyncEmailService emailService;

    @PostMapping("/register")
    public ResponseEntity<User> register(@Valid @RequestBody RegisterRequest req) {
        User user = userService.register(req);

        emailService.sendEmail(new EmailRequest(
            "welcome@backendforge.com",
            user.email(),
            "Welcome!",
            buildWelcomeHtml(user.name())
        ));

        return ResponseEntity.status(HttpStatus.CREATED).body(user);
    }
}
```

### Scenario 2: password reset with token

```java
public void sendPasswordReset(String email, String resetToken) {
    String resetUrl = "https://backendforge.com/reset?token=" + resetToken;

    emailService.sendEmail(new EmailRequest(
        "security@backendforge.com",
        email,
        "Password Reset Request",
        buildPasswordResetHtml(resetUrl)
    ));
}
```

### Scenario 3: notification digest (batch emails)

```java
@Scheduled(cron = "0 0 8 * * MON")  // every Monday at 8 AM
public void sendWeeklyDigest() {
    List<User> subscribers = userService.findAllSubscribed();

    for (User user : subscribers) {
        List<Activity> weekActivity = activityService.getThisWeek(user.id());

        if (!weekActivity.isEmpty()) {
            emailService.sendEmail(new EmailRequest(
                "digest@backendforge.com",
                user.email(),
                "Your Weekly Activity Report",
                buildDigestHtml(user, weekActivity)
            ));
        }
    }
}
```

## Common mistakes

| Mistake | Consequence |
|---|---|
| Sending email synchronously in request | API latency = SMTP latency |
| No retry mechanism | Transient SMTP failures cause lost emails |
| Embedding images as base64 | Huge emails, blocked by spam filters |
| Using `reply-to` as `from` | Confusing sender address |
| Not verifying email addresses | Bounced emails, spam complaints |
