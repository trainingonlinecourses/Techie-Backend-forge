---
title: Hello World — What Actually Happens When You Run It
summary: A one-line program, but running it exercises the compiler, the classloader, the JVM startup, and the execution engine. This lesson follows a Hello World program from source to bytecode to running, so you understand the machinery behind three words.
order: 2
minutes: 18
topics: [hello-world, classloading, bytecode, main-method, jvm-startup, javac, java-launcher]
docs:
  - https://docs.oracle.com/javase/8/docs/technotes/tools/windows/java.html
  - https://docs.oracle.com/javase/specs/jvms/se21/html/
---

## The Concept, From Zero

The Java Hello World program is the first thing almost every learner writes, and it is easy to treat it as a ritual — type the three lines, run `javac`, run `java`, move on. But behind those three lines sits almost the entire machinery of the Java platform. Understanding that machinery is what turns "I know how to write Hello World" into "I know how Java actually starts and runs a program."

A Hello World program in Java is:

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World");
    }
}
```

Three lines, but each line carries a piece of the contract between your code and the JVM.

### Line 1 — `public class HelloWorld`

This declares a class. The filename **must** be `HelloWorld.java` — Java requires that a `public` class live in a file with the same name. If you name the file `hello.java` and the class `HelloWorld`, `javac` refuses to compile it.

`public` means the class is accessible from anywhere. That matters here because the JVM's launcher needs to find and load this class from outside its own package — the launcher is not in your package, so the class must be public for `java HelloWorld` to work.

The convention is that each public class lives in its own file. You can have multiple classes in one file, but only one can be `public`, and that one dictates the filename.

### Line 2 — `public static void main(String[] args)`

This is the entry point. When you run `java HelloWorld`, the launcher looks inside the loaded class for a method with exactly this signature. If it finds one, it calls it. If it does not, the program fails with an error like `Main method not found`.

Each part of the signature has a job:

- **`public`** — the JVM is outside the class and needs to call this method, so it must be accessible.
- **`static`** — the method belongs to the class, not to an instance, so the JVM can call it without first creating a `HelloWorld` object. There is no "create the object, then call main" step; main is the starting point, so it must be callable immediately.
- **`void`** — `main` does not return a value to the launcher. The program's exit code is set by other means (calling `System.exit(n)` or letting the program end normally with code 0), not by returning from `main`.
- **`String[] args`** — the command-line arguments. If you run `java HelloWorld a b c`, the launcher passes `["a", "b", "c"]` into `args`. If you run `java HelloWorld` with no arguments, `args` is an empty array, **not** `null`.

The name `main` is not a keyword — it is a convention the launcher looks for. You can write other methods called `main` in other classes, but the launcher will only call the one in the class you asked it to run, and only if that one has the right signature.

A common question is why `main` is `static`. The answer is historical and practical: the JVM needs a starting point that does not depend on creating an object first, because at the very beginning there is no object yet. A static method is a function attached to the class itself, so it can be invoked the moment the class is loaded.

### Line 3 — `System.out.println("Hello, World");`

This is the line that produces output. `System` is a class in the `java.lang` package (automatically imported). `out` is a static field of type `PrintStream` that represents the standard output stream — by default, the console. `println` is a method that writes a line of text followed by a line separator.

`System.out` is not a local variable you declared; it is provided by the JRE. The JVM initialises `System.out` during startup, wiring it to the standard output of the process (which is usually the console, but in a server can be redirected to a file or a log collector). This is why the same `println` call works in a terminal and in a Docker container — the environment decides where `out` points.

## What Happens When You Run `javac HelloWorld.java`

The compiler reads the source file, parses it into a structure it understands, checks it for errors (types, visibility, syntax), and produces one or more `.class` files containing bytecode.

For `HelloWorld.java`, the output is `HelloWorld.class`. That file is not a copy of your source; it is a binary file in the JVM's class file format, with a specific structure:

- A magic number (the first four bytes are `CA FE BA BE`) that identifies it as a class file.
- Version numbers telling the JVM which Java version produced it.
- Constant pool — a table of constants the bytecode refers to (class names, method names, string literals, field names).
- Fields, methods, and attributes — including the `main` method's bytecode.

You can inspect the class file with `javap -c HelloWorld`. That is the closest you get to seeing the JVM's version of your program.

## What Happens When You Run `java HelloWorld`

This is where the real journey begins. The `java` command starts a new JVM process, and that process performs a sequence of steps before your `main` method runs even once.

### Step 1 — JVM startup

The launcher starts the JVM. This includes initialising the JVM's internal state, loading the necessary runtime classes, and setting up the standard streams (`System.out`, `System.in`, `System.err`). The JVM reads its configuration — things like the initial heap size if you pass `-Xms`, the maximum heap size with `-Xmx`, and the classpath.

### Step 2 — Loading the class

The JVM needs to find and load `HelloWorld`. It uses the **classloader**. The default classloader looks for the class in the directories and JAR files listed in the classpath. If you just ran `javac` and `java` in the same folder with no `-cp`, the classpath includes the current directory, so the JVM finds `HelloWorld.class` right there.

Loading a class involves reading the binary class file, parsing its structure, and creating an in-memory representation. The class is **not** initialised yet — it is just loaded. At this point, the JVM knows the class exists and what its methods and fields are, but static initialisers have not run.

If the class depends on other classes (for example, `System` or `String`), those are loaded too, as needed. This is **lazy loading** — classes are loaded on demand, not all at once. The first time your code references a class, the JVM loads it.

### Step 3 — Linking

Once loaded, the class is linked — verified, prepared, and (optionally) resolved.

- **Verification** — the JVM checks that the bytecode is well-formed and does not break the JVM's safety rules. For example, it checks that a method does not try to access a private field of another object, and that the stack will not overflow in a way that violates the specification. If verification fails, the JVM throws a `VerifyError` and the program does not run. This is one of the reasons Java is secure by default — you cannot run arbitrary bytecode unless it passes verification.

- **Preparation** — the JVM allocates memory for the class's static fields and sets them to their default values (0, `null`, `false`). At this stage, no code runs; the static fields just get their initial memory.

- **Resolution** — the JVM replaces symbolic references (names of classes, methods, and fields stored in the constant pool) with direct references. This step is optional and can happen later; some JVMs delay resolution until the reference is actually used.

### Step 4 — Initialisation

Now the class is initialised. This is when the static initialisers run — `static` variable initializers in the order they appear, and any `static { ... }` blocks. If `HelloWorld` had a `static { System.out.println("loading"); }` block, you would see that output before `main` runs.

The JVM guarantees that a class is initialised exactly once, and that the initialisation is thread-safe — if two threads both reach code that needs the class initialised at the same time, one performs the initialisation and the other waits.

### Step 5 — Finding and calling `main`

Once the class is loaded, linked, and initialised, the launcher looks for the `main` method with the exact signature `public static void main(String[])`. It uses reflection to find it — the launcher does not know ahead of time that this class has a `main` method; it searches for one that matches.

If it finds it, it invokes it. If it does not, it throws an error and the program ends. The error message has changed over time — older JVMs said `NoSuchMethodError: main`, newer ones give a clearer message — but the result is the same: no `main` with the right signature, no program.

### Step 6 — Executing `main`

Now your code runs. The JVM's execution engine takes over. It either interprets the bytecode instruction by instruction, or — for hot code — compiles it to native machine code with the JIT and runs that. For a short Hello World program, interpretation is plenty fast, and the JIT may never kick in because the program ends before the hot-method threshold is reached.

The `System.out.println(...)` call goes through several layers:

1. Your bytecode calls `System.out.println`.
2. `System.out` is a `PrintStream` object that the JVM set up during startup.
3. `PrintStream.println(String)` formats the string and writes it to the underlying output stream.
4. The underlying stream writes to the process's standard output file descriptor, which the operating system sends to the terminal, a file, or wherever the process's stdout is connected.

### Step 7 — Termination

When `main` returns, the JVM checks whether any other non-daemon threads are still running. If not, it initiates shutdown: finalisers (if any) run, shutdown hooks execute, and the process exits. The exit code is 0 by default (success). You can set a different code with `System.exit(n)` — a convention inherited from operating systems where 0 means success and non-zero means an error.

## A Code Example — Hello World With Extra Steps

This version adds comments that explain what each part is doing, plus a few lines that reveal the machinery.

```java
// The filename must be HelloWorld.java — a public class must match its file
public class HelloWorld {

    // A static block runs when the class is loaded and initialised,
    // BEFORE main is called — useful for one-time setup
    static {
        // This runs during class initialisation, not when you create an object
        System.out.println("[class loaded]");
    }

    // The entry point the JVM looks for
    public static void main(String[] args) {

        // args is the command-line arguments — never null, possibly empty
        System.out.println("arguments: " + args.length);

        // Print the Java version the JVM is running
        System.out.println("java version: " +
            System.getProperty("java.version"));

        // The classic line
        System.out.println("Hello, World");

        // Show that out is just a PrintStream — you can call its methods directly
        System.out.printf("formatted: %d %s%n", 42, "answer");

        // Exit code 0 = success; anything else means error
        // System.exit(0);   // optional — main returning also exits with 0
    }
}
```

Line by line:

- **`public class HelloWorld`** — the class declaration. The file must be `HelloWorld.java`.
- **`static { ... }`** — a static initialiser block. It runs once, when the class is first loaded and initialised, before `main` is called. This is the same phase described in Step 4 above. Note that it runs even if you never create an instance of `HelloWorld`.
- **`public static void main(String[] args)`** — the exact signature the launcher expects.
- **`System.out.println("arguments: " + args.length)`** — `args` is a `String[]`. If you run `java HelloWorld foo bar`, `args.length` is 2. If you run `java HelloWorld`, it is 0. It is never `null`.
- **`System.getProperty("java.version")`** — asks the JVM for a system property. The JVM maintains a set of properties (Java version, operating system, file separator, user home, and many more) that `System.getProperty` reads. This is how a program can adapt to the environment it is running in.
- **`System.out.println("Hello, World")`** — writes the classic line. `out` is a `PrintStream`; `println` writes the string followed by a line separator (which is `\n` on Unix and `\r\n` on Windows — `println` handles the platform difference for you).
- **`System.out.printf(...)`** — another `PrintStream` method. It formats output with placeholders, like `printf` in C. `%d` is an integer, `%s` is a string, `%n` is the platform-specific line separator.
- **`System.exit(0)`** — explicitly sets the exit code to 0 and terminates the JVM immediately, running shutdown hooks but not returning from `main`. In a Hello World program you do not need it — returning from `main` is enough — but it is useful when you need to stop the process from inside a deeply nested call.

Here is the bytecode that `javac` produces for the `main` method, as shown by `javap -c HelloWorld`:

```
public static void main(java.lang.String[]);
  Code:
     0: getstatic     #2                  // Field java/lang/System.out:Ljava/io/PrintStream;
     3: ldc           #3                  // String arguments:
     5: invokevirtual #4                  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
     8: getstatic     #2                  // Field java/lang/System.out:Ljava/io/PrintStream;
    11: ldc           #5                  // String java version:
    13: iconst_3
    14: anewarray     #6                  // class java/lang/String
    17: dup
    18: iconst_0
    19: ldc           #7                  // String java.version
    21: aastore
    22: invokestatic  #8                  // Method java/lang/System.getProperty:(Ljava/lang/String;)Ljava/lang/String;
    25: invokevirtual #4                  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
    28: getstatic     #2                  // Field java/lang/System.out:Ljava/io/PrintStream;
    31: ldc           #9                  // String Hello, World
    33: invokevirtual #4                  // Method java/io/PrintStream.println:(Ljava/lang/String;)V
    36: return
```

You do not need to memorise bytecode, but the structure is worth seeing. Each `getstatic` fetches `System.out`. Each `ldc` loads a constant (a string). Each `invokevirtual` calls a method. The numbers like `#2` refer to entries in the constant pool. What you wrote as one line of Java — `System.out.println("Hello, World");` — becomes four bytecode instructions. The JVM executes these, and the operating system shows the output.

## Where This Shows Up in an Organization

In a backend team, "Hello World" is not just a beginner exercise — the same startup machinery runs every time a Spring Boot application starts. When you run `java -jar app.jar`, the launcher finds the main class declared in the JAR's manifest, the JVM loads it, and Spring's `main` method starts the application context. The difference between a Hello World program and a Spring Boot application is the complexity of what `main` does, not the startup mechanism — both go through the same load, link, initialise, find `main`, execute steps.

Understanding this is practical. If a deployed JAR fails with `Could not find or load main class`, the problem is in the classloading step — the classpath is wrong, the manifest points to the wrong class, or the JAR was built incorrectly. If it fails with `Main method not found`, the manifest points to a class that does not have the right `main` signature. If a program behaves differently on two machines, it may be a classpath or JRE vs JDK issue, not a bug in the code.

The `System.getProperty` calls are also used heavily in real applications. Code often checks `System.getProperty("os.name")` to adapt to Windows vs Linux, `System.getProperty("user.home")` to find a config directory, or `System.getProperty("java.version")` to enable newer features on newer JVMs. A Spring Boot application might use system properties to switch behaviour between development and production without recompiling.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Naming the file something other than the public class name | It is easy to save as `hello.java` when the class is `HelloWorld` | The file must be `HelloWorld.java` exactly |
| Running `java helloWorld` (wrong case) | Filenames are case-sensitive on most systems | Use `java HelloWorld` with the exact case |
| Passing arguments and being surprised `args` is empty | Forgetting that `args` holds only what you type after the class name | `java HelloWorld a b` gives `args = ["a", "b"]`; `java HelloWorld` gives an empty array |
| Thinking `main` returns a value | In many languages the entry point returns an int | Java's `main` returns `void`; use `System.exit(n)` for a specific exit code |
| Running `java HelloWorld.class` | The file is named `HelloWorld.class`, so it feels natural | Omit `.class` — `java HelloWorld` |
| Confusing `System.out` with a file you open yourself | It is just a `PrintStream` the JVM initialises | It writes to the process's stdout — in a terminal that is the screen, in a server it may be redirected |

## For the Practice Lab

In the lab, you will see a starter `HelloWorld.java` with deliberate mistakes — a file named incorrectly, a `main` method with the wrong signature (missing `static`, or `String[] args` replaced with `String args`), and a `println` that prints `args` directly instead of `args.length`. Fix each one so the program compiles and runs correctly, then add a line that prints the operating system name and the file separator (`File.separator`) so the output differs between Windows and Linux — that is the moment you see the JVM adapting to its environment.

## Summary

Running a Hello World program exercises the entire Java startup sequence: the compiler turns source into bytecode, the launcher starts a JVM process, the classloader loads the class, the JVM verifies and prepares it, static initialisers run, the launcher finds and calls `main`, and the execution engine runs the bytecode. The `main` method is not special to the language — it is special to the launcher, which looks for a method with that exact signature. `System.out` is a `PrintStream` the JVM sets up during startup. Understanding these steps is what turns the ritual of typing `javac` and `java` into a mental model of how Java actually runs.
