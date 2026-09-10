---
title: Java Reflection — Inspecting and Modifying Classes at Runtime
summary: What reflection is and why it exists, reading class metadata, accessing fields and methods dynamically, creating instances, annotation processing, and how frameworks like Spring and Hibernate use reflection under the hood with line-by-line walkthroughs.
order: 45
minutes: 28
topics: [reflection, class-object, getdeclaredfield, getdeclaredmethod, annotation-processing, dynamic-instantiation, spring-reflection]
docs:
  - https://docs.oracle.com/javase/8/docs/api/java/lang/reflect/package-summary.html
  - https://docs.oracle.com/javase/tutorial/reflect/
---

# Java Reflection — Inspecting and Modifying Classes at Runtime

## What is Reflection?

**Reflection** is the ability to inspect and modify classes, methods, fields, and constructors **at runtime** — while the program is running, not at compile time. Normally, Java is strongly typed: you know the class names, method signatures, and field types when you write the code. Reflection lets you discover and use them dynamically.

**Beginner mental model:** Reflection is like having X-ray vision for code. You can look inside any class and see all its fields, methods, and constructors — even private ones that the normal code can't access. It's like opening the hood of a car and seeing all the parts, even the ones the manufacturer didn't want you to touch.

**Why it matters:** Every major Java framework uses reflection:
- **Spring** scans your classes and automatically creates beans.
- **Hibernate** reads your entity fields and maps them to database columns.
- **Jackson** reads your record fields and converts them to JSON.
- **JUnit** discovers and runs your test methods.

Without reflection, none of these frameworks would work.

## Getting the Class Object — the entry point

Every object in Java has a `Class` object — a runtime representation of its type. There are three ways to get it:


**What this code does — step by step:**

1. Way 1: .class literal (known at compile time)
2. `Class<?> clazz = String.class;` — the Class object for String
3. `Class<?> intClass = int.class;` — even primitives have Class objects
4. Way 2: getClass() on an instance (known at runtime)
5. `Class<?> clazz = name.getClass();` — returns String.class
6. Way 3: Class.forName() — by string name (fully dynamic!)
7. `Class<?> clazz = Class.forName(className);` — loads the class by name
8. This is the most powerful — you can load ANY class if you know its name. Used by frameworks that discover classes from configuration

The same code, clean:

```java
Class<?> clazz = String.class;
Class<?> intClass = int.class;

String name = "Hello";
Class<?> clazz = name.getClass();

String className = "com.backendforge.academy.User";
Class<?> clazz = Class.forName(className);
```

## Reading class metadata


**What this code does — step by step:**

1. Basic info
2. `System.out.println("Name: " + clazz.getName());` — com.backendforge.academy.User
3. `System.out.println("Simple name: " + clazz.getSimpleName());` — User
4. `System.out.println("Package: " + clazz.getPackage().getName());` — com.backendforge.academy
5. `System.out.println("Superclass: " + clazz.getSuperclass().getSimpleName());` — Object
6. Is it a record? enum? interface?

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Class<?> clazz = User.class;

        System.out.println("Name: " + clazz.getName());
        System.out.println("Simple name: " + clazz.getSimpleName());
        System.out.println("Package: " + clazz.getPackage().getName());
        System.out.println("Superclass: " + clazz.getSuperclass().getSimpleName());

        System.out.println("Is record: " + clazz.isRecord());
        System.out.println("Is enum: " + clazz.isEnum());
        System.out.println("Is interface: " + clazz.isInterface());
        System.out.println("Is abstract: " + Modifier.isAbstract(clazz.getModifiers()));
    }
}
```

## Accessing fields dynamically


**What this code does — step by step:**

1. `private String name;` — private — normal code can't access this
2. Get all declared fields (including private ones!)
3. `Field[] fields = clazz.getDeclaredFields();` — ALL fields, including private
4. Output: name : String. Email : String. Age : int
5. Read a private field's value
6. `Field nameField = clazz.getDeclaredField("name");` — get the Field object for "name"
7. `nameField.setAccessible(true);` — CRITICAL: allows access to private fields
8. `String nameValue = (String) nameField.get(user);` — read the value
9. `System.out.println("Name: " + nameValue);` — "Alice"
10. Write a private field's value
11. `nameField.set(user, "Bob");` — change "Alice" to "Bob"
12. `System.out.println(user.getName());` — "Bob" — the private field was modified!

The same code, clean:

```java
public class User {
    private String name;
    private String email;
    private int age;

    public User(String name, String email, int age) {
        this.name = name;
        this.email = email;
        this.age = age;
    }
}

Class<?> clazz = User.class;
Field[] fields = clazz.getDeclaredFields();

for (Field field : fields) {
    System.out.println(field.getName() + " : " + field.getType().getSimpleName());
}

User user = new User("Alice", "alice@example.com", 30);
Field nameField = clazz.getDeclaredField("name");
nameField.setAccessible(true);
String nameValue = (String) nameField.get(user);
System.out.println("Name: " + nameValue);

nameField.set(user, "Bob");
System.out.println(user.getName());
```

## Accessing methods dynamically


**What this code does — step by step:**

1. Get all declared methods (including private ones!)
2. Call a method by name
3. `Method getNameMethod = clazz.getDeclaredMethod("getName");` — no parameters
4. `String name = (String) getNameMethod.invoke(user);` — call getName() on the user object
5. `System.out.println("Name: " + name);` — "Alice"
6. Call a private method
7. `validateMethod.setAccessible(true);` — allow access to private method

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Class<?> clazz = User.class;

        Method[] methods = clazz.getDeclaredMethods();
        for (Method method : methods) {
            System.out.println(method.getName() + "(" + 
                Arrays.stream(method.getParameterTypes())
                      .map(Class::getSimpleName)
                      .collect(Collectors.joining(", ")) + ")");
        }

        User user = new User("Alice", "alice@example.com", 30);
        Method getNameMethod = clazz.getDeclaredMethod("getName");
        String name = (String) getNameMethod.invoke(user);
        System.out.println("Name: " + name);

        Method validateMethod = clazz.getDeclaredMethod("validateEmail", String.class);
        validateMethod.setAccessible(true);
        boolean valid = (boolean) validateMethod.invoke(user, user.getEmail());
        System.out.println("Valid email: " + valid);
    }
}
```

## Creating instances dynamically


**What this code does — step by step:**

1. Create an instance using the default constructor
2. `Constructor<?> constructor = clazz.getDeclaredConstructor();` — no-arg constructor
3. `User user = (User) constructor.newInstance();` — creates new User
4. Create an instance using a specific constructor
5. Discover all constructors

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Class<?> clazz = User.class;
        Constructor<?> constructor = clazz.getDeclaredConstructor();
        User user = (User) constructor.newInstance();

        Constructor<?> paramConstructor = clazz.getDeclaredConstructor(String.class, String.class, int.class);
        User user2 = (User) paramConstructor.newInstance("Alice", "alice@example.com", 30);

        Constructor<?>[] constructors = clazz.getDeclaredConstructors();
        for (Constructor<?> c : constructors) {
            System.out.println("Constructor: " + 
                Arrays.stream(c.getParameterTypes())
                      .map(Class::getSimpleName)
                      .collect(Collectors.joining(", ")));
        }
    }
}
```

## Annotation processing with reflection


**What this code does — step by step:**

1. Custom annotation
2. `@Retention(RetentionPolicy.RUNTIME)` — available at runtime (not just compile time)
3. `@Target(ElementType.FIELD)` — can be applied to fields
4. `String value() default "";` — optional custom name
5. Entity using the annotation
6. `private int age;` — no annotation — not serialized
7. Reflection-based JSON serializer — reads annotations at runtime
8. `JsonField annotation = field.getAnnotation(JsonField.class);` — read annotation
9. `if (annotation == null) continue;` — skip unannotated fields
10. `field.setAccessible(true);` — access private field
11. Usage
12. Output: {"user_name":"Alice","user_email":"alice@example.com"}. Note: 'age' is missing because it has no @JsonField annotation

The same code, clean:

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface JsonField {
    String value() default "";
}

public class User {
    @JsonField("user_name")
    private String name;

    @JsonField("user_email")
    private String email;

    private int age;
}

public class SimpleJsonSerializer {
    public String serialize(Object object) throws Exception {
        Class<?> clazz = object.getClass();
        StringBuilder json = new StringBuilder("{");

        Field[] fields = clazz.getDeclaredFields();
        boolean first = true;

        for (Field field : fields) {
            JsonField annotation = field.getAnnotation(JsonField.class);
            if (annotation == null) continue;

            field.setAccessible(true);
            String key = annotation.value().isEmpty() ? field.getName() : annotation.value();
            Object value = field.get(object);

            if (!first) json.append(",");
            json.append("\"").append(key).append("\":\"").append(value).append("\"");
            first = false;
        }

        json.append("}");
        return json.toString();
    }
}

User user = new User("Alice", "alice@example.com", 30);
SimpleJsonSerializer serializer = new SimpleJsonSerializer();
System.out.println(serializer.serialize(user));
```

## How we use it in organizations

### Scenario 1: How Spring Dependency Injection works


**What this code does — step by step:**

1. Spring uses reflection to inject dependencies — here's the simplified version
2. `@Autowired private UserService userService;` — Spring injects this via reflection
3. `@Autowired private PaymentService paymentService;` — Spring injects this too
4. What Spring does behind the scenes (simplified):
5. `if (field.isAnnotationPresent(Autowired.class)) {` — check for @Autowired
6. `Class<?> dependencyType = field.getType();` — get the type (UserService.class)
7. `Object dependency = getBean(dependencyType);` — find or create the bean
8. `field.setAccessible(true);` — allow access to private field
9. `field.set(bean, dependency);` — inject the dependency

The same code, clean:

```java
@Service
public class OrderService {
    @Autowired private UserService userService;
    @Autowired private PaymentService paymentService;
}

public class SpringContainer {
    public void injectDependencies(Object bean) throws Exception {
        Class<?> clazz = bean.getClass();

        for (Field field : clazz.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class)) {
                Class<?> dependencyType = field.getType();
                Object dependency = getBean(dependencyType);
                field.setAccessible(true);
                field.set(bean, dependency);
            }
        }
    }
}
```

### Scenario 2: Automatic DTO mapping


**What this code does — step by step:**

1. Map entity fields to DTO fields using reflection — no manual mapping code
2. `T target = targetClass.getDeclaredConstructor().newInstance();` — create DTO instance
3. `if (sourceField.getType().equals(targetField.getType())) {` — type matches
4. `targetField.set(target, sourceField.get(source));` — copy value
5. field doesn't exist in source — skip
6. Usage — no manual mapping needed
7. dto.getName() returns "Alice", dto.getEmail() returns "alice@example.com"

The same code, clean:

```java
public class BeanMapper {
    public static <T> T map(Object source, Class<T> targetClass) throws Exception {
        T target = targetClass.getDeclaredConstructor().newInstance();

        for (Field targetField : targetClass.getDeclaredFields()) {
            try {
                Field sourceField = source.getClass().getDeclaredField(targetField.getName());
                if (sourceField.getType().equals(targetField.getType())) {
                    sourceField.setAccessible(true);
                    targetField.setAccessible(true);
                    targetField.set(target, sourceField.get(source));
                }
            } catch (NoSuchFieldException e) {
            }
        }
        return target;
    }
}

UserEntity entity = new UserEntity(1L, "Alice", "alice@example.com");
UserDTO dto = BeanMapper.map(entity, UserDTO.class);
```

### Scenario 3: Validation framework using annotations + reflection


**What this code does — step by step:**

1. Validator that reads annotations via reflection
2. Check @NotBlank
3. Check @Min
4. Usage
5. `UserForm form = new UserForm();` — name=null, age=0
6. errors = ["name: Name is required", "age: must be at least 18"]

The same code, clean:

```java
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface NotBlank {
    String message() default "must not be blank";
}

@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.FIELD)
public @interface Min {
    int value();
    String message() default "must be at least {value}";
}

public class AnnotationValidator {
    public static List<String> validate(Object object) throws Exception {
        List<String> errors = new ArrayList<>();
        Class<?> clazz = object.getClass();

        for (Field field : clazz.getDeclaredFields()) {
            field.setAccessible(true);
            Object value = field.get(object);

            NotBlank notBlank = field.getAnnotation(NotBlank.class);
            if (notBlank != null && (value == null || value.toString().isBlank())) {
                errors.add(field.getName() + ": " + notBlank.message());
            }

            Min min = field.getAnnotation(Min.class);
            if (min != null && value instanceof Number num) {
                if (num.intValue() < min.value()) {
                    errors.add(field.getName() + ": must be at least " + min.value());
                }
            }
        }
        return errors;
    }
}

public class UserForm {
    @NotBlank(message = "Name is required")
    private String name;

    @Min(value = 18, message = "Must be at least 18")
    private int age;
}

UserForm form = new UserForm();
List<String> errors = AnnotationValidator.validate(form);
```

## Performance considerations

Reflection is **slow** compared to direct method calls (10-50x slower). Use it wisely:


**What this code does — step by step:**

1. BAD: reflection in a hot loop
2. `Method method = clazz.getDeclaredMethod("process", String.class);` — lookup every iteration!
3. `method.invoke(processor, data);` — slow
4. GOOD: cache the reflection metadata
5. `Method method = clazz.getDeclaredMethod("process", String.class);` — lookup ONCE
6. `method.invoke(processor, data);` — still slower than direct call, but much better
7. BEST: use MethodHandle (Java 7+) — nearly as fast as direct calls
8. `handle.invoke(processor, data);` — almost as fast as processor.process(data)

The same code, clean:

```java
for (int i = 0; i < 1_000_000; i++) {
    Method method = clazz.getDeclaredMethod("process", String.class);
    method.invoke(processor, data);
}

Method method = clazz.getDeclaredMethod("process", String.class);
method.setAccessible(true);
for (int i = 0; i < 1_000_000; i++) {
    method.invoke(processor, data);
}

MethodHandles.Lookup lookup = MethodHandles.lookup();
MethodHandle handle = lookup.findVirtual(clazz, "process",
    MethodType.methodType(void.class, String.class));
for (int i = 0; i < 1_000_000; i++) {
    handle.invoke(processor, data);
}
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Using reflection for simple tasks | Unnecessary complexity, slow | Use direct calls when possible |
| Forgetting `setAccessible(true)` | IllegalAccessException on private members | Always set accessible for private fields/methods |
| Caching nothing — looking up methods every call | 50x performance penalty | Cache Field/Method objects |
| Not handling checked exceptions from reflection | Compilation errors | Wrap in try-catch or throw RuntimeException |
| Using reflection to bypass encapsulation in production | Fragile — breaks if internals change | Use public APIs instead |

