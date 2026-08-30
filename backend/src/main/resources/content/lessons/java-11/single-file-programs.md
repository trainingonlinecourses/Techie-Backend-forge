---
title: Single-File Source-Code Programs — Run Java Like a Script
summary: What single-file programs are, how they work, when to use them, and how they change the Java development experience.
order: 4
minutes: 12
topics: [single-file, script-mode, shebang, java11]
docs:
  - https://docs.oracle.com/en/java/javase/11/language/single-source-file-programs.html
---

## The Concept, From Zero

Before Java 11, to run a Java program you needed to:
1. Create a `.java` file
2. Compile it with `javac Hello.java`
3. Run it with `java Hello`

Java 11 lets you **run a single .java file directly** — no compilation step needed:

```bash
# Before Java 11
javac Hello.java
java Hello

# Java 11+ — just one command
java Hello.java
```

The compiler compiles and runs in one step. This makes Java feel more like a scripting language for quick tasks.

---

## How It Works

```java
// Hello.java — no package declaration needed
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

```bash
# Run it directly
java Hello.java
# Output: Hello, World!
```

**Key rules:**
- The file must contain a `main` method
- Only one public class is allowed (or none)
- The file name must match the class name (if public)
- No `package` declaration
- Dependencies are limited to the JDK (no third-party JARs without a build tool)

---

## Shebang Files (Unix/Linux/Mac)

You can make Java files executable like shell scripts:

```java
#!/usr/bin/java --source 11
// This line above is the shebang — tells the OS to use Java 11 to run this file

import java.util.*;

public class WeatherCheck {
    public static void main(String[] args) {
        var city = args.length > 0 ? args[0] : "London";
        System.out.println("Checking weather for " + city + "...");
        // Quick script logic here
        System.out.println("Temperature: " + (15 + new Random().nextInt(20)) + "°C");
    }
}
```

```bash
# Make executable
chmod +x WeatherCheck.java

# Run like a script
./WeatherCheck.java Paris
# Checking weather for Paris...
# Temperature: 27°C
```

---

## Line-by-Line Walkthrough

```java
// File: QuickSort.java — a standalone quicksort implementation
import java.util.*;

public class QuickSort {
    // Line 1: main method — entry point
    public static void main(String[] args) {
        // Line 2: Parse command-line arguments
        var numbers = args.length > 0
            ? Arrays.stream(args).mapToInt(Integer::parseInt).toArray()
            : new int[]{64, 34, 25, 12, 22, 11, 90, 1};

        System.out.println("Before: " + Arrays.toString(numbers));

        // Line 3: Sort using quicksort
        quickSort(numbers, 0, numbers.length - 1);

        System.out.println("After:  " + Arrays.toString(numbers));
    }

    static void quickSort(int[] arr, int low, int high) {
        if (low < high) {
            int pivot = partition(arr, low, high);
            quickSort(arr, low, pivot - 1);
            quickSort(arr, pivot + 1, high);
        }
    }

    static int partition(int[] arr, int low, int high) {
        int pivot = arr[high];
        int i = low - 1;
        for (int j = low; j < high; j++) {
            if (arr[j] < pivot) {
                i++;
                int temp = arr[i]; arr[i] = arr[j]; arr[j] = temp;
            }
        }
        int temp = arr[i + 1]; arr[i + 1] = arr[high]; arr[high] = temp;
        return i + 1;
    }
}
```

```bash
# Run with default data
java QuickSort.java
# Before: [64, 34, 25, 12, 22, 11, 90, 1]
# After:  [1, 11, 12, 22, 25, 34, 64, 90]

# Run with custom data
java QuickSort.java 5 3 8 1 9 2
# Before: [5, 3, 8, 1, 9, 2]
# After:  [1, 2, 3, 5, 8, 9]
```

---

## Real-World Scenarios

### Scenario 1: Quick data processing script

```java
#!/usr/bin/java --source 11
import java.nio.file.*;
import java.util.stream.*;

public class LogAnalyzer {
    public static void main(String[] args) throws Exception {
        var logFile = args.length > 0 ? args[0] : "access.log";

        var stats = Files.lines(Path.of(logFile))
            .filter(line -> line.contains("ERROR"))
            .map(line -> line.split(" ")[3])  // extract timestamp
            .collect(Collectors.groupingBy(
                ts -> ts.substring(0, 13),     // group by hour
                Collectors.counting()
            ));

        stats.entrySet().stream()
            .sorted(Map.Entry.comparingByKey())
            .forEach(e -> System.out.printf("%s: %d errors%n", e.getKey(), e.getValue()));
    }
}
```

### Scenario 2: Testing an algorithm quickly

```java
#!/usr/bin/java --source 11
import java.util.*;

public class Fibonacci {
    public static void main(String[] args) {
        int n = args.length > 0 ? Integer.parseInt(args[0]) : 20;
        long[] fib = new long[n];
        fib[0] = 0; fib[1] = 1;
        for (int i = 2; i < n; i++) fib[i] = fib[i-1] + fib[i-2];
        System.out.println("Fibonacci(" + n + "): " + fib[n-1]);
    }
}
```

```bash
java Fibonacci.java 30
# Fibonacci(30): 832040
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Adding package declaration | Won't work with single-file mode | Remove package statement |
| Using third-party dependencies | Can't resolve without build tool | Stick to JDK classes only |
| File name mismatch | Can't find main class | Ensure filename matches public class name |
| Using `--source` without version | `--source 11` required for shebang | Include version in shebang line |
