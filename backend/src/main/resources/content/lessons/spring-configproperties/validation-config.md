---
title: Validating Configuration Properties — Fail Fast on Bad Config
summary: How to validate @ConfigurationProperties with @Validated, using Jakarta Validation annotations, nested properties, and custom validators.
order: 3
minutes: 15
topics: [@Validated, jakarta-validation, nested-properties, custom-validator, fail-fast]
docs:
  - https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties
---

## The Concept, From Zero

Spring Boot can validate configuration properties at startup using Jakarta Validation. This catches bad config immediately instead of failing at runtime.

```java
@Data
@ConfigurationProperties(prefix = "app.mail")
@Validated  // enables validation
public class MailProperties {
    @NotBlank
    private String host;

    @Min(1) @Max(65535)
    private int port = 587;
}
```

If `app.mail.host` is missing, the app fails to start with a clear error.

---

## Line-by-Line Walkthrough

```java
import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@Data
@ConfigurationProperties(prefix = "app.storage")
@Validated
public class StorageProperties {

    @NotBlank(message = "Storage path is required")
    private String path;

    @Min(value = 1, message = "Max file size must be at least 1MB")
    @Max(value = 100, message = "Max file size cannot exceed 100MB")
    private int maxFileSizeMb = 10;

    @Pattern(regexp = "local|s3|gcs", message = "Type must be local, s3, or gcs")
    private String type = "local";

    @Valid  // validates nested object
    private S3Properties s3 = new S3Properties();

    @Data
    public static class S3Properties {
        @NotBlank(message = "S3 bucket is required when type=s3")
        private String bucket;

        @NotBlank
        private String region = "us-east-1";
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Custom validator

```java
@Component
public class StoragePropertiesValidator implements Validator {

    @Override
    public boolean supports(Class<?> clazz) {
        return StorageProperties.class.isAssignableFrom(clazz);
    }

    @Override
    public void validate(Object target, Errors errors) {
        StorageProperties props = (StorageProperties) target;
        if ("s3".equals(props.getType()) && props.getS3().getBucket() == null) {
            errors.rejectValue("s3.bucket", "required", "S3 bucket required for S3 type");
        }
    }
}
```

### Scenario 2: Profile-specific validation

```yaml
# Only validate in production
spring:
  config:
    activate:
      on-profile: prod

app:
  storage:
    path: /data/storage
    max-file-size-mb: 50
    type: s3
    s3:
      bucket: my-prod-bucket
      region: us-east-1
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Forgetting @Validated | Validation annotations ignored | Always add @Validated |
| Using javax.validation | Wrong package in Spring Boot 3+ | Use jakarta.validation |
| Not validating nested objects | Inner properties not checked | Add @Valid on nested fields |
| Validation too strict for dev | App won't start in dev | Use profile-specific config |
