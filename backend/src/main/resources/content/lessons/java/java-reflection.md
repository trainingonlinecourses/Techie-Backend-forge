---
title: Java Reflection — Inspecting and Modifying Classes at Runtime
summary: What reflection is and why it exists, reading class metadata, accessing fields and methods dynamically, creating instances, annotation processing, and how frameworks like Spring and Hibernate use reflection under the hood with line-by-line walkthroughs.
order: 12
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

```java
// Way 1: .class literal (known at compile time)
Class<?> clazz = String.class;              // the Class object for String
Class<?> intClass = int.class;              // even primitives have Class objects

// Way 2: getClass() on an instance (known at runtime)
String name = "Hello";
Class<?> clazz = name.getClass();           // returns String.class

// Way 3: Class.forName() — by string name (fully dynamic!)
String className = "com.backendforge.academy.User";
Class<?> clazz = Class.forName(className);  // loads the class by name
// This is the most powerful — you can load ANY class if you know its name
// Used by frameworks that discover classes from configuration
```

## Reading class metadata

```java
Class<?> clazz = User.class;

// Basic info
System.out.println("Name: " + clazz.getName());              // com.backendforge.academy.User
System.out.println("Simple name: " + clazz.getSimpleName());  // User
System.out.println("Package: " + clazz.getPackage().getName()); // com.backendforge.academy
System.out.println("Superclass: " + clazz.getSuperclass().getSimpleName()); // Object

// Is it a record? enum? interface?
System.out.println("Is record: " + clazz.isRecord());
System.out.println("Is enum: " + clazz.isEnum());
System.out.println("Is interface: " + clazz.isInterface());
System.out.println("Is abstract: " + Modifier.isAbstract(clazz.getModifiers()));
```

## Accessing fields dynamically

```java
public class User {
    private String name;          // private — normal code can't access this
    private String email;
    private int age;

    public User(String name, String email, int age) {
        this.name = name;
        this.email = email;
        this.age = age;
    }
}

// Get all declared fields (including private ones!)
Class<?> clazz = User.class;
Field[] fields = clazz.getDeclaredFields();  // ALL fields, including private

for (Field field : fields) {
    System.out.println(field.getName() + " : " + field.getType().getSimpleName());
    // Output:
    // name : String
    // email : String
    // age : int
}

// Read a private field's value
User user = new User("Alice", "alice@example.com", 30);
Field nameField = clazz.getDeclaredField("name");  // get the Field object for "name"
nameField.setAccessible(true);                       // CRITICAL: allows access to private fields
String nameValue = (String) nameField.get(user);     // read the value
System.out.println("Name: " + nameValue);            // "Alice"

// Write a private field's value
nameField.set(user, "Bob");                          // change "Alice" to "Bob"
System.out.println(user.getName());                  // "Bob" — the private field was modified!
```

## Accessing methods dynamically

```java
Class<?> clazz = User.class;

// Get all declared methods (including private ones!)
Method[] methods = clazz.getDeclaredMethods();
for (Method method : methods) {
    System.out.println(method.getName() + "(" + 
        Arrays.stream(method.getParameterTypes())
              .map(Class::getSimpleName)
              .collect(Collectors.joining(", ")) + ")");
}

// Call a method by name
User user = new User("Alice", "alice@example.com", 30);
Method getNameMethod = clazz.getDeclaredMethod("getName");  // no parameters
String name = (String) getNameMethod.invoke(user);          // call getName() on the user object
System.out.println("Name: " + name);                        // "Alice"

// Call a private method
Method validateMethod = clazz.getDeclaredMethod("validateEmail", String.class);
validateMethod.setAccessible(true);                          // allow access to private method
boolean valid = (boolean) validateMethod.invoke(user, user.getEmail());
System.out.println("Valid email: " + valid);
```

## Creating instances dynamically

```java
// Create an instance using the default constructor
Class<?> clazz = User.class;
Constructor<?> constructor = clazz.getDeclaredConstructor();  // no-arg constructor
User user = (User) constructor.newInstance();                   // creates new User

// Create an instance using a specific constructor
Constructor<?> paramConstructor = clazz.getDeclaredConstructor(String.class, String.class, int.class);
User user2 = (User) paramConstructor.newInstance("Alice", "alice@example.com", 30);

// Discover all constructors
Constructor<?>[] constructors = clazz.getDeclaredConstructors();
for (Constructor<?> c : constructors) {
    System.out.println("Constructor: " + 
        Arrays.stream(c.getParameterTypes())
              .map(Class::getSimpleName)
              .collect(Collectors.joining(", ")));
}
```

## Annotation processing with reflection

```java
// Custom annotation
@Retention(RetentionPolicy.RUNTIME)  // available at runtime (not just compile time)
@Target(ElementType.FIELD)            // can be applied to fields
public @interface JsonField {
    String value() default "";        // optional custom name
}

// Entity using the annotation
public class User {
    @JsonField("user_name")
    private String name;

    @JsonField("user_email")
    private String email;

    private int age;  // no annotation — not serialized
}

// Reflection-based JSON serializer — reads annotations at runtime
public class SimpleJsonSerializer {
    public String serialize(Object object) throws Exception {
        Class<?> clazz = object.getClass();
        StringBuilder json = new StringBuilder("{");

        Field[] fields = clazz.getDeclaredFields();
        boolean first = true;

        for (Field field : fields) {
            JsonField annotation = field.getAnnotation(JsonField.class);  // read annotation
            if (annotation == null) continue;                             // skip unannotated fields

            field.setAccessible(true);                                    // access private field
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

// Usage
User user = new User("Alice", "alice@example.com", 30);
SimpleJsonSerializer serializer = new SimpleJsonSerializer();
System.out.println(serializer.serialize(user));
// Output: {"user_name":"Alice","user_email":"alice@example.com"}
// Note: 'age' is missing because it has no @JsonField annotation
```

## How we use it in organizations

### Scenario 1: How Spring Dependency Injection works

```java
// Spring uses reflection to inject dependencies — here's the simplified version
@Service
public class OrderService {
    @Autowired private UserService userService;      // Spring injects this via reflection
    @Autowired private PaymentService paymentService; // Spring injects this too
}

// What Spring does behind the scenes (simplified):
public class SpringContainer {
    public void injectDependencies(Object bean) throws Exception {
        Class<?> clazz = bean.getClass();

        for (Field field : clazz.getDeclaredFields()) {
            if (field.isAnnotationPresent(Autowired.class)) {  // check for @Autowired
                Class<?> dependencyType = field.getType();      // get the type (UserService.class)
                Object dependency = getBean(dependencyType);    // find or create the bean
                field.setAccessible(true);                       // allow access to private field
                field.set(bean, dependency);                     // inject the dependency
            }
        }
    }
}
```

### Scenario 2: Automatic DTO mapping

```java
// Map entity fields to DTO fields using reflection — no manual mapping code
public class BeanMapper {
    public static <T> T map(Object source, Class<T> targetClass) throws Exception {
        T target = targetClass.getDeclaredConstructor().newInstance();  // create DTO instance

        for (Field targetField : targetClass.getDeclaredFields()) {
            try {
                Field sourceField = source.getClass().getDeclaredField(targetField.getName());
                if (sourceField.getType().equals(targetField.getType())) {  // type matches
                    sourceField.setAccessible(true);
                    targetField.setAccessible(true);
                    targetField.set(target, sourceField.get(source));      // copy value
                }
            } catch (NoSuchFieldException e) {
                // field doesn't exist in source — skip
            }
        }
        return target;
    }
}

// Usage — no manual mapping needed
UserEntity entity = new UserEntity(1L, "Alice", "alice@example.com");
UserDTO dto = BeanMapper.map(entity, UserDTO.class);
// dto.getName() returns "Alice", dto.getEmail() returns "alice@example.com"
```

### Scenario 3: Validation framework using annotations + reflection

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

// Validator that reads annotations via reflection
public class AnnotationValidator {
    public static List<String> validate(Object object) throws Exception {
        List<String> errors = new ArrayList<>();
        Class<?> clazz = object.getClass();

        for (Field field : clazz.getDeclaredFields()) {
            field.setAccessible(true);
            Object value = field.get(object);

            // Check @NotBlank
            NotBlank notBlank = field.getAnnotation(NotBlank.class);
            if (notBlank != null && (value == null || value.toString().isBlank())) {
                errors.add(field.getName() + ": " + notBlank.message());
            }

            // Check @Min
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

// Usage
public class UserForm {
    @NotBlank(message = "Name is required")
    private String name;

    @Min(value = 18, message = "Must be at least 18")
    private int age;
}

UserForm form = new UserForm();  // name=null, age=0
List<String> errors = AnnotationValidator.validate(form);
// errors = ["name: Name is required", "age: must be at least 18"]
```

## Performance considerations

Reflection is **slow** compared to direct method calls (10-50x slower). Use it wisely:

```java
// BAD: reflection in a hot loop
for (int i = 0; i < 1_000_000; i++) {
    Method method = clazz.getDeclaredMethod("process", String.class);  // lookup every iteration!
    method.invoke(processor, data);                                      // slow
}

// GOOD: cache the reflection metadata
Method method = clazz.getDeclaredMethod("process", String.class);  // lookup ONCE
method.setAccessible(true);
for (int i = 0; i < 1_000_000; i++) {
    method.invoke(processor, data);  // still slower than direct call, but much better
}

// BEST: use MethodHandle (Java 7+) — nearly as fast as direct calls
MethodHandles.Lookup lookup = MethodHandles.lookup();
MethodHandle handle = lookup.findVirtual(clazz, "process",
    MethodType.methodType(void.class, String.class));
for (int i = 0; i < 1_000_000; i++) {
    handle.invoke(processor, data);  // almost as fast as processor.process(data)
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
