---
title: Record Patterns — Destructuring Records in Pattern Matching
summary: What record patterns are, how they deconstruct records, nested destructuring, and how they simplify complex data extraction.
order: 4
minutes: 20
topics: [record-patterns, destructuring, nested-patterns, java21]
docs:
  - https://docs.oracle.com/en/java/javase/21/language/pattern-matching.html
---

## The Concept, From Zero

Records hold data. Pattern matching lets you extract that data. **Record patterns** combine both — you can deconstruct a record and bind its components in a single expression:

```java
// Without record patterns — verbose
if (obj instanceof Point p) {
    int x = p.x();
    int y = p.y();
    System.out.println("x=" + x + ", y=" + y);
}

// With record patterns — clean
if (obj instanceof Point(int x, int y)) {
    System.out.println("x=" + x + ", y=" + y);
}
// x and y are automatically bound as local variables
```

---

## Basic Destructuring

```java
record Point(int x, int y) {}
record Person(String name, int age) {}

// Destructure a single record
if (obj instanceof Point(int x, int y)) {
    // x and y are now local variables
}

// Destructure with type check
if (obj instanceof Person(String name, int age) && age > 18) {
    System.out.println("Adult: " + name);
}
```

---

## Nested Destructuring

```java
record Address(String city, String zip) {}
record Person(String name, Address address) {}

// Destructure nested records — extracts everything at once
if (obj instanceof Person(String name, Address(String city, String zip))) {
    System.out.println(name + " lives in " + city + " " + zip);
}
```

---

## Line-by-Line Walkthrough

```java
import java.util.*;

public class RecordPatternsDemo {
    // Line 1: Define nested record hierarchy
    record Point(int x, int y) {}
    record Line(Point start, Point end) {}
    record Rect(Point topLeft, Point bottomRight) {}

    record Employee(String name, String department, double salary) {}
    record Company(String name, List<Employee> employees) {}

    // Line 2: Basic destructuring
    static String describePoint(Object obj) {
        return switch (obj) {
            case Point(int x, int y) -> "Point at (" + x + ", " + y + ")";
            default -> "Not a point";
        };
    }

    // Line 3: Nested destructuring
    static String describeLine(Object obj) {
        return switch (obj) {
            case Line(Point(int x1, int y1), Point(int x2, int y2)) ->
                "Line from (" + x1 + "," + y1 + ") to (" + x2 + "," + y2 + ")";
            default -> "Not a line";
        };
    }

    // Line 4: Destructuring with guards
    static String classifyRect(Rect rect) {
        return switch (rect) {
            case Rect(Point(int x1, int y1), Point(int x2, int y2))
                when x1 == x2 && y1 == y2 -> "Degenerate (point)";
            case Rect(Point(int x1, int y1), Point(int x2, int y2))
                when x1 == x2 -> "Vertical line";
            case Rect(Point(int x1, int y1), Point(int x2, int y2))
                when y1 == y2 -> "Horizontal line";
            case Rect(Point(int x1, int y1), Point(int x2, int y2)) -> {
                int width = Math.abs(x2 - x1);
                int height = Math.abs(y2 - y1);
                yield "Rectangle " + width + "x" + height;
            }
        };
    }

    // Line 5: Destructuring in for-each
    static List<String> getEmployeeNames(Company company) {
        List<String> names = new ArrayList<>();
        for (Company(String name, List<Employee> emps) : List.of(company)) {
            for (Employee(String empName, String dept, double sal) : emps) {
                names.add(empName);
            }
        }
        return names;
    }

    // Line 6: Destructuring with null handling
    static String safeDesribe(Object obj) {
        return switch (obj) {
            case null -> "null";
            case Point(int x, int y) -> "Point(" + x + "," + y + ")";
            case String s -> "String: " + s;
            default -> "Other";
        };
    }

    public static void main(String[] args) {
        // Line 7: Test basic destructuring
        var point = new Point(10, 20);
        System.out.println(describePoint(point));  // "Point at (10, 20)"

        // Line 8: Test nested destructuring
        var line = new Line(new Point(0, 0), new Point(5, 5));
        System.out.println(describeLine(line));    // "Line from (0,0) to (5,5)"

        // Line 9: Test guarded destructuring
        var rect1 = new Rect(new Point(0, 0), new Point(5, 3));
        var rect2 = new Rect(new Point(0, 0), new Point(5, 0));
        System.out.println(classifyRect(rect1));   // "Rectangle 5x3"
        System.out.println(classifyRect(rect2));   // "Horizontal line"

        // Line 10: Test for-each destructuring
        var company = new Company("TechCorp", List.of(
            new Employee("Alice", "Engineering", 95000),
            new Employee("Bob", "Marketing", 72000),
            new Employee("Carol", "Engineering", 110000)
        ));
        System.out.println(getEmployeeNames(company));  // [Alice, Bob, Carol]

        // Line 11: Test null safety
        System.out.println(safeDesribe(null));           // "null"
        System.out.println(safeDesribe(new Point(1, 2))); // "Point(1,2)"
    }
}
```

---

## Real-World Scenarios

### Scenario 1: JSON tree processing

```java
// Process JSON-like structures
sealed interface JsonValue permits JsonString, JsonNumber, JsonBoolean, JsonNull, JsonObject, JsonArray {}
record JsonString(String value) implements JsonValue {}
record JsonNumber(double value) implements JsonValue {}
record JsonBoolean(boolean value) implements JsonValue {}
record JsonNull() implements JsonValue {}
record JsonObject(Map<String, JsonValue> members) implements JsonValue {}
record JsonArray(List<JsonValue> elements) implements JsonValue {}

String prettyPrint(JsonValue value, int indent) {
    String pad = " ".repeat(indent);
    return switch (value) {
        case JsonString s   -> "\"" + s.value() + "\"";
        case JsonNumber n   -> String.valueOf(n.value());
        case JsonBoolean b  -> String.valueOf(b.value());
        case JsonNull _     -> "null";
        case JsonArray a    -> "[" + a.elements().stream()
            .map(e -> prettyPrint(e, indent + 2))
            .reduce((x, y) -> x + ", " + y).orElse("") + "]";
        case JsonObject o   -> "{\n" + o.members().entrySet().stream()
            .map(e -> pad + "  \"" + e.getKey() + "\": " + prettyPrint(e.getValue(), indent + 2))
            .reduce((x, y) -> x + ",\n" + y).orElse("") + "\n" + pad + "}";
    };
}
```

### Scenario 2: Compiler AST processing

```java
sealed interface Stmt permits IfStmt, WhileStmt, AssignStmt, Block {}
record IfStmt(Expr condition, Stmt thenBranch, Stmt elseBranch) implements Stmt {}
record WhileStmt(Expr condition, Stmt body) implements Stmt {}
record AssignStmt(String variable, Expr value) implements Stmt {}
record Block(List<Stmt> statements) implements Stmt {}

void compile(Stmt stmt) {
    switch (stmt) {
        case IfStmt(Expr cond, Stmt then, Stmt else_) -> {
            compileCondition(cond);
            compile(then);
            if (else_ != null) compile(else_);
        }
        case WhileStmt(Expr cond, Stmt body) -> {
            compileCondition(cond);
            compile(body);
        }
        case AssignStmt(String var, Expr val) -> {
            compileExpression(val);
            emit("STORE " + var);
        }
        case Block(List<Stmt> stmts) -> stmts.forEach(this::compile);
    };
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Destructuring non-record types | Won't compile | Records only — can't deconstruct classes |
| Too-deep nesting | Hard to read | Limit to 2-3 levels of nesting |
| Forgetting null in switch | NullPointerException | Add `case null ->` |
| Using `var` in patterns | Not supported yet | Use explicit types in patterns |
| Destructuring with wrong component count | Compilation error | Match exact number of components |
