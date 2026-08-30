---
title: Compile-Time Annotation Processing — Code Generation with APT
summary: How annotation processors work at compile time, creating custom processors with AbstractProcessor, code generation with JavaPoet, and how Lombok, MapStruct, and Dagger use this technique.
order: 5
minutes: 25
topics: [apt, annotation-processor, abstract-processor, code-generation, javapoet, compile-time, source-model]
docs:
  - https://docs.oracle.com/javase/8/docs/api/javax/annotation/processing/AbstractProcessor.html
---

## The Concept, From Zero

Annotation processors run during compilation — they read your annotations and generate new `.java` source files or `.class` bytecode. This is how Lombok generates getters/setters, how MapStruct generates mapper implementations, and how Dagger generates dependency injection code.

```java
// You write this:
@Builder
public class User {
    private String name;
    private int age;
}

// The annotation processor generates this at compile time:
// public class UserBuilder {
//     private String name;
//     private int age;
//     public UserBuilder name(String name) { this.name = name; return this; }
//     public UserBuilder age(int age) { this.age = age; return this; }
//     public User build() { return new User(name, age); }
// }
```

---

## How APT Works

1. `javac` finds classes annotated with `@SupportedAnnotationTypes`
2. Calls `process()` on each matching processor
3. Processor reads the annotation via `ProcessingEnvironment`
4. Processor generates new source files via `Filer`
5. `javac` compiles the generated sources

```java
// A minimal annotation processor
import javax.annotation.processing.*;
import javax.lang.model.*;
import javax.lang.model.element.*;
import javax.tools.Diagnostic;
import java.util.*;

@SupportedAnnotationTypes("com.example.Builder")
@SupportedSourceVersion(SourceVersion.RELEASE_21)
public class BuilderProcessor extends AbstractProcessor {

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        for (Element element : roundEnv.getElementsAnnotatedWith(Builder.class)) {
            // element is the class annotated with @Builder
            TypeElement typeElement = (TypeElement) element;
            String className = typeElement.getSimpleName().toString();
            String packageName = processingEnv.getElementUtils()
                .getPackageOf(typeElement).getQualifiedName().toString();

            // Generate a new source file
            try {
                var filer = processingEnv.getFiler();
                var sourceFile = filer.createSourceFile(packageName + "." + className + "Builder");
                var writer = sourceFile.openWriter();
                writer.write("package " + packageName + ";\n\n");
                writer.write("public class " + className + "Builder {\n");
                // ... write builder fields and methods
                writer.write("}\n");
                writer.close();
            } catch (Exception e) {
                processingEnv.getMessager().printMessage(
                    Diagnostic.Kind.ERROR, "Failed to generate builder: " + e.getMessage()
                );
            }
        }
        return true;  // we've handled these annotations
    }
}
```

---

## Line-by-Line Walkthrough

```java
import javax.annotation.processing.*;
import javax.lang.model.*;
import javax.lang.model.element.*;
import javax.lang.model.type.*;
import javax.tools.Diagnostic;
import java.io.*;
import java.util.*;

// Our custom annotation
@Retention(RetentionPolicy.SOURCE)
@Target(ElementType.TYPE)
public @interface ToString { }

// The processor
@SupportedAnnotationTypes("ToString")
@SupportedSourceVersion(SourceVersion.RELEASE_21)
public class ToStringProcessor extends AbstractProcessor {

    @Override
    public boolean process(Set<? extends TypeElement> annotations, RoundEnvironment roundEnv) {
        for (Element element : roundEnv.getElementsAnnotatedWith(ToString.class)) {
            if (element.getKind() != ElementKind.CLASS) continue;

            TypeElement typeElement = (TypeElement) element;
            String className = typeElement.getSimpleName().toString();
            String packageName = processingEnv.getElementUtils()
                .getPackageOf(typeElement).getQualifiedName().toString();

            // Collect all fields
            List<VariableElement> fields = new ArrayList<>();
            for (Element enclosed : typeElement.getEnclosedElements()) {
                if (enclosed.getKind() == ElementKind.FIELD) {
                    fields.add((VariableElement) enclosed);
                }
            }

            // Generate the toString method as a separate file
            String generated = generateToString(className, packageName, fields);

            try {
                JavaFileObject file = processingEnv.getFiler()
                    .createSourceFile(packageName + "." + className + "ToString");
                try (Writer writer = file.openWriter()) {
                    writer.write(generated);
                }
            } catch (IOException e) {
                error("Failed to generate: " + e.getMessage(), element);
            }
        }
        return true;
    }

    private String generateToString(String className, String pkg, List<VariableElement> fields) {
        StringBuilder sb = new StringBuilder();
        sb.append("package ").append(pkg).append(";\n\n");
        sb.append("public class ").append(className).append("ToString {\n");
        sb.append("    public static String toString(").append(className).append(" obj) {\n");
        sb.append("        return \"").append(className).append("{\" +\n");

        for (int i = 0; i < fields.size(); i++) {
            String name = fields.get(i).getSimpleName().toString();
            String prefix = i == 0 ? "" : ", ";
            sb.append("            \"").append(prefix).append(name).append("=\" + obj.").append(name);
            sb.append(" +\n");
        }

        sb.append("            \"}\";\n");
        sb.append("    }\n}\n");
        return sb.toString();
    }

    private void error(String msg, Element element) {
        processingEnv.getMessager().printMessage(Diagnostic.Kind.ERROR, msg, element);
    }
}
```

---

## Real-World APT Tools

### Lombok
- Uses annotation processing + bytecode manipulation (ASM)
- Generates getters, setters, builders, equals/hashCode at compile time
- No generated source files — modifies bytecode directly

### MapStruct
- Generates mapper implementations at compile time
- Reads `@Mapper` interfaces and generates implementation classes
- Uses standard APT (generates .java files)

### Dagger
- Generates dependency injection code at compile time
- Creates `Factory` and `Provider` classes for each `@Inject` constructor
- No reflection at runtime — pure generated code

### ErrorProne
- Replaces the standard Java compiler's error checking
- Finds bugs at compile time using annotation processing

---

## Registration

### service file (manual)
```
# META-INF/services/javax.annotation.processing.Processor
com.example.ToStringProcessor
```

### Auto-service (Google)
```java
@AutoService(Processor.class)  // auto-generates the service file
@SupportedAnnotationTypes("ToString")
@SupportedSourceVersion(SourceVersion.RELEASE_21)
public class ToStringProcessor extends AbstractProcessor { }
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Not checking `roundEnv.getElementsAnnotatedWith()` | Processes wrong elements | Always verify element kind |
| Generating duplicate files | Compilation error | Check if file already exists |
| Not reporting errors properly | Silent failures | Use `processingEnv.getMessager()` |
| Forgetting `@SupportedAnnotationTypes` | Processor never runs | Always declare supported annotations |
| Using RUNTIME retention | Unnecessary, processor runs at compile time | Use SOURCE retention |
