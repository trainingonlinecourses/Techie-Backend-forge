---
title: Internationalization (i18n) with MessageSource
summary: Locale-aware messages with MessageSource, message.properties files, parameterized and pluralized text, and locale resolution in Spring MVC.
order: 12
minutes: 12
topics: [i18n, messagesource, locale, resource bundles, localeresolver]
docs:
  - https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-messagesource
  - https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html
---

# Internationalization (i18n) with MessageSource

## The problem

Hard-coded strings can't be translated without a redeploy. i18n means: **keys in code, text in resource bundles, locale chosen per request**. Spring's `MessageSource` is the mechanism, `messages.properties` the default bundle, and it's already wired in every Spring Boot app.

## Message bundles

`src/main/resources/messages.properties` (default, usually English) plus one file per locale:

```properties
# messages.properties
greeting=Hello {0}!
order.confirmed=Order {0} confirmed for {1}

# messages_fr.properties
greeting=Bonjour {0}!
order.confirmed=Commande {0} confirmée pour {1}

# messages_de.properties
greeting=Hallo {0}!
```

Spring Boot picks up `messages*.properties` automatically (`spring.messages.basename=messages` is the default; `spring.messages.encoding=UTF-8`).

## Using MessageSource in code

```java
@Service
public class NotificationService {
    private final MessageSource messages;

    // Inject the autoconfigured MessageSource
    String text = messages.getMessage("order.confirmed", new Object[]{orderId, customer},
            LocaleContextHolder.getLocale());
}
```

- **Arguments** fill `{0}`, `{1}` placeholders.
- `LocaleContextHolder.getLocale()` picks up the current request's locale (set by MVC's locale resolution).
- Unresolved keys return the key itself unless you pass a default: `getMessage("missing", args, "fallback", locale)`.

## Parameterized and pluralized messages

Spring's `MessageSource` understands **`{0, choice, ...}`** plural forms:

```properties
items.count={0,choice,0#no items|1#one item|1<{0} items}
```

Or use ICU-style with `ResourceBundleMessageSource` — either way, plurals belong in the bundle, not in Java string concatenation.

## Locale resolution in Spring MVC

What determines the request's locale?

```java
// Default: AcceptHeaderLocaleResolver — uses the Accept-Language header.
// To make it switchable by URL param (…?lang=fr), configure:
@Bean
LocaleResolver localeResolver() {
    SessionLocaleResolver r = new SessionLocaleResolver();
    r.setDefaultLocale(Locale.ENGLISH);
    return r;
}
```

`LocaleChangeInterceptor` reads a `lang` request param and updates the resolver:

```java
registry.addInterceptor(new LocaleChangeInterceptor());  // in WebMvcConfigurer#addInterceptors
```

The chain: request → `LocaleChangeInterceptor` (param, optional) → `LocaleResolver` (session/header/cookie) → `LocaleContextHolder` → `MessageSource` lookup.

## Validation messages

Validation constraints use message keys — override any built-in:

```java
// messages.properties
NotBlank.customer=Customer name is required
// or globally:
jakarta.validation.constraints.NotBlank.message=must not be blank
```

Custom constraint `message()` values are keys too — your `@StrongPassword(message = "password.weak")` resolves through the same bundle.

## i18n beyond text

- **Dates/numbers** come from `java.text` / `java.time.format`: `DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)`.
- **REST APIs**: return messages for the *requested* locale (`Accept-Language`), never the server's default — test with a different browser locale to catch the mistake.
- Keep bundles under version control and sync them (missing keys silently fall back to the default bundle — a frequent subtle bug).

## Key takeaways

- Keys in code, text in `messages.properties` + `messages_<locale>.properties`, arguments via `{0}`.
- `MessageSource.getMessage(key, args, locale)` with `LocaleContextHolder.getLocale()` in services.
- Locale comes from `Accept-Language` (default) or a `LocaleResolver` + `LocaleChangeInterceptor` for `?lang=`.
- Validation messages, plurals and validation error text all flow through the same bundle.

Official docs: [MessageSource in the Spring context](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-messagesource)
