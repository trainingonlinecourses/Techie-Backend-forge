---
title: Comparable & Comparator — Sorting Objects in Java
summary: The difference between natural ordering (Comparable) and custom ordering (Comparator), building comparators with chained methods, and how organizations handle multi-field sorts that survive nulls.
order: 24
minutes: 20
topics: [comparable, comparator, sorting, chaining, nullsfirst, nullslast]
docs:
  - https://docs.oracle.com/javase/tutorial/java/data/compare.html
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Comparator.html
---

## The Concept, From Zero

Sorting is one of the most common operations in any application. But to sort objects, Java needs to know **how to compare them**. There are two interfaces for this:

- **`Comparable<T>`** — "this object knows how to compare itself to another of the same type." It defines the **natural ordering**.
- **`Comparator<T>`** — "here is a separate object that knows how to compare two things." It defines **custom ordering**.

Think of it this way: `Comparable` is like a person saying "I am taller than Bob" (comparing yourself). `Comparator` is like a measuring tape that can compare any two people.

## Comparable — The Natural Ordering

```java
public class Employee implements Comparable<Employee> {
    private final String name;
    private final int salary;

    public Employee(String name, int salary) {
        this.name = name;
        this.salary = salary;
    }

    @Override
    public int compareTo(Employee other) {
        return Integer.compare(this.salary, other.salary);  // sort by salary ascending
    }
}
```

Line-by-line:

| Line | Why it matters |
|---|---|
| `implements Comparable<Employee>` | Tells Java: "instances of this class know how to be compared to other instances" |
| `@Override` | We're overriding the method from Comparable interface |
| `compareTo(Employee other)` | Returns negative if `this` comes before `other`, zero if equal, positive if after |
| `Integer.compare(a, b)` | Safe way to compare integers — avoids the overflow trap of `a - b` |

Now sorting works automatically:

```java
List<Employee> team = List.of(
    new Employee("Amy", 80000),
    new Employee("Bob", 60000),
    new Employee("Charlie", 90000)
);

List<Employee> sorted = team.stream().sorted().toList();
// Result: Bob (60000), Amy (80000), Charlie (90000) — sorted by salary
```

**Org scenario:** A payroll system sorts employees by salary for reporting. By implementing `Comparable`, the salary-based sort is the "natural" order — it works with `Collections.sort()`, `TreeSet`, and `Stream.sorted()` without any extra code.

## Comparator — Custom Ordering Without Changing the Class

What if you need **multiple sort orders**? You don't want to rewrite `compareTo()` every time. `Comparator` lets you define ordering externally:

```java
// Sort by name alphabetically
Comparator<Employee> byName = Comparator.comparing(Employee::getName);

// Sort by salary descending (highest first)
Comparator<Employee> bySalaryDesc = Comparator.comparingInt(Employee::getSalary).reversed();

// Sort by name, then by salary (tie-breaker)
Comparator<Employee> byNameThenSalary = byName.thenComparingInt(Employee::getSalary);
```

Line-by-line:

| Line | What it does |
|---|---|
| `Comparator.comparing(Employee::getName)` | Method reference: "extract the name, compare lexicographically" |
| `.reversed()` | Flips the order: ascending → descending |
| `.thenComparingInt(Employee::getSalary)` | If names are equal, use salary as the tie-breaker |

```java
team.stream().sorted(byNameThenSalary).forEach(System.out::println);
// Amy(80000), Bob(60000), Charlie(90000) — sorted by name alphabetically
```

## Handling Nulls — The Production Gotcha

```java
List<String> names = List.of("Charlie", null, "Amy", "Bob");

// This throws NullPointerException:
names.stream().sorted().toList();  // ❌ null has no compareTo

// Fix 1: nulls first (null sorts before everything)
names.stream().sorted(Comparator.nullsFirst(Comparator.naturalOrder())).toList();

// Fix 2: nulls last (null sorts after everything)
names.stream().sorted(Comparator.nullsLast(Comparator.naturalOrder())).toList();
```

**Org scenario:** A customer list has some entries without emails. Sorting by email with `Comparator.comparing(Customer::getEmail)` would NPE on the nulls. The org standard is `Comparator.comparing(Customer::getEmail, Comparator.nullsLast(Comparator.naturalOrder()))` — put missing data at the bottom, don't crash.

## Real-World Patterns

**Scenario 1 — Multi-field sorting in a table.** A UI table header sorts by column. Click once = ascending, click again = descending. The backend builds comparators dynamically:

```java
Comparator<Employee> cmp = switch (field) {
    case "name"   -> Comparator.comparing(Employee::getName);
    case "salary" -> Comparator.comparingInt(Employee::getSalary);
    case "dept"   -> Comparator.comparing(Employee::getDepartment);
    default       -> Comparator.comparing(Employee::getId);
};
if (descending) cmp = cmp.reversed();
return employees.stream().sorted(cmp).toList();
```

**Scenario 2 — TreeSet with Comparator.** A priority queue of incidents sorted by severity:

```java
TreeSet<Incident> bySeverity = new TreeSet<>(
    Comparator.comparing(Incident::getSeverity).reversed()  // most severe first
              .thenComparing(Incident::getCreatedAt)        // oldest first if same severity
);
```

## Common Mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `return this.salary - other.salary` | Overflow when salary is large and difference is negative | Use `Integer.compare(this.salary, other.salary)` |
| Using `==` instead of `.equals()` in `compareTo` | Breaks contract: `compareTo` must be consistent with `equals` | Always use `.equals()` for object fields |
| Forgetting to handle nulls in Comparator | NullPointerException on sort | `Comparator.nullsFirst/last` |
| Modifying objects while in a TreeSet | Element becomes "lost" — can't find it anymore | Don't mutate fields used in the sort |
| Expecting `compareTo() == 0` to mean `.equals()` | Different objects with same sort key coexist in a TreeSet | They're different concepts; a TreeSet uses compareTo to avoid duplicates, which can hide equals-different objects |
