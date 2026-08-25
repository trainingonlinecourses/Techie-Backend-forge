---
title: Pass-by-Value vs Pass-by-Reference — The Definitive Guide
summary: Why Java is always pass-by-value, the difference between copying primitives vs object references, and the common trap of trying to reassign parameters.
order: 25
minutes: 16
topics: [pass-by-value, pass-by-reference, object-references, method-parameters, memory-model]
docs:
  - https://www.javaguides.net/2022/01/is-java-pass-by-value-or-pass-by.html
  - https://docs.oracle.com/javase/tutorial/java/javaOO/objects.html
---

# Java Pass-by-Value vs Pass-by-Reference

## The Big Question

One of the most confusing concepts in Java is: **"Does Java pass objects by reference?"**

The answer is: **NO. Java ALWAYS passes by value. Always. No exceptions.**

But this is confusing because when you pass an object to a method, you CAN modify its fields. Let's understand exactly what's happening.

---

## What Does "Pass-by-Value" Mean?

**Pass-by-value** means: when you pass something to a method, Java makes a **copy** of it and gives the copy to the method.

**Pass-by-reference** means: the method gets a **pointer** to the original variable, so it can change the original.

Java uses pass-by-value. But here's the key insight: **for objects, the value being copied is the reference (memory address), not the object itself.**

---

## Two Types of Values

### Type 1: Primitives — Copy of the Actual Value

```java
public static void main(String[] args) {
    int num = 10;

    System.out.println("Before method: " + num);  // 10

    changeNumber(num);

    System.out.println("After method: " + num);   // Still 10!
}

static void changeNumber(int n) {
    n = 99;  // This changes the COPY, not the original
    System.out.println("Inside method: " + n);     // 99
}
```

**What happens step by step:**

```
Step 1: main() creates num = 10
        num → [10]

Step 2: Java copies num's value into n
        num → [10]
        n   → [10]     ← separate copy

Step 3: Inside changeNumber(), n = 99
        num → [10]     ← unchanged!
        n   → [99]     ← only the copy changed

Step 4: changeNumber() ends, n is destroyed
        num → [10]     ← still 10
```

### Type 2: Objects — Copy of the Reference

```java
public static void main(String[] args) {
    int[] arr = {1, 2, 3};

    System.out.println("Before: " + java.util.Arrays.toString(arr));  // [1, 2, 3]

    changeArray(arr);

    System.out.println("After: " + java.util.Arrays.toString(arr));   // [99, 2, 3]!
}

static void changeArray(int[] a) {
    a[0] = 99;  // This modifies the ORIGINAL array!
}
```

**Why does this work? Because `a` is a COPY of the reference, pointing to the SAME object:**

```
Step 1: main() creates arr pointing to array object
        arr → [reference] ──→ [1, 2, 3]

Step 2: Java copies the reference into a
        arr → [reference] ──→ [1, 2, 3]
        a   → [reference] ──→ ↑ (same object!)

Step 3: a[0] = 99 modifies the shared object
        arr → [reference] ──→ [99, 2, 3]
        a   → [reference] ──→ ↑ (same object, now modified!)

Step 4: a is destroyed, but arr still points to the modified object
        arr → [reference] ──→ [99, 2, 3]
```

---

## The Proof: Reassigning a Reference

```java
public static void main(String[] args) {
    StringBuilder sb = new StringBuilder("Hello");

    System.out.println("Before: " + sb);  // Hello

    reassignReference(sb);

    System.out.println("After: " + sb);   // Still Hello!
}

static void reassignReference(StringBuilder s) {
    s = new StringBuilder("World");  // Creates a NEW object, reassigns the local reference
    System.out.println("Inside: " + s);  // World
}
```

**What happened:**

```
Step 1: sb points to "Hello" object
        sb ──→ [StringBuilder: "Hello"]

Step 2: s is a copy of the reference
        sb ──→ [StringBuilder: "Hello"]
        s  ──→ ↑

Step 3: s = new StringBuilder("World") — creates NEW object
        sb ──→ [StringBuilder: "Hello"]   ← unchanged!
        s  ──→ [StringBuilder: "World"]   ← new object

Step 4: s goes out of scope
        sb ──→ [StringBuilder: "Hello"]   ← still "Hello"
```

**If Java were pass-by-reference, `sb` would now be "World". But it's not — proof that Java passes by value.**

---

## Common Scenarios

### Scenario 1: Changing an Object's Fields (Works!)

```java
class User {
    String name;
    int age;

    User(String name, int age) {
        this.name = name;
        this.age = age;
    }
}

public static void main(String[] args) {
    User user = new User("Alice", 25);

    System.out.println("Before: " + user.name + ", " + user.age);  // Alice, 25

    modifyUser(user);

    System.out.println("After: " + user.name + ", " + user.age);   // Bob, 30
}

static void modifyUser(User u) {
    u.name = "Bob";     // ✅ Works! We're modifying the shared object
    u.age = 30;         // ✅ Works! Same object
}
```

### Scenario 2: Reassigning the Reference (Doesn't Affect Original)

```java
public static void main(String[] args) {
    User user = new User("Alice", 25);

    System.out.println("Before: " + user.name);  // Alice

    replaceUser(user);

    System.out.println("After: " + user.name);   // Still Alice!
}

static void replaceUser(User u) {
    u = new User("Bob", 30);  // Creates NEW object, doesn't affect original
    System.out.println("Inside: " + u.name);      // Bob
}
```

### Scenario 3: Collections

```java
public static void main(String[] args) {
    List<String> names = new ArrayList<>();
    names.add("Alice");

    System.out.println("Before: " + names);  // [Alice]

    addName(names);

    System.out.println("After: " + names);   // [Alice, Bob]
}

static void addName(List<String> list) {
    list.add("Bob");     // ✅ Modifies the shared list
    // list = new ArrayList<>();  // ❌ Would NOT affect original
}
```

---

## The Memory Model Visualization

```
┌─────────────────────────────────────────────────────────┐
│                     STACK MEMORY                         │
├─────────────────────────────────────────────────────────┤
│  main() frame:                                          │
│    user → [0x7f8b] ──────────────────────┐             │
│                                          │             │
│  modifyUser() frame:                     │             │
│    u → [0x7f8b] ─────────────────────┐   │             │
│                                      │   │             │
├──────────────────────────────────────┼───┼─────────────┤
│                     HEAP MEMORY       │   │             │
├──────────────────────────────────────┼───┼─────────────┤
│  [0x7f8b] User { name: "Alice", age: 25 } ◄───────────┘
│            │                                                  │
│            ▼                                                  │
│  After modifyUser():                                          │
│  [0x7f8b] User { name: "Bob", age: 30 }                      │
│                                                               │
│  Both main's `user` and modifyUser's `u` point to             │
│  the SAME object at 0x7f8b. That's why changes visible.       │
└───────────────────────────────────────────────────────────────┘
```

---

## In an Organization

### Scenario 1: Method That "Fails" to Replace an Object

```java
// ❌ Common mistake: trying to replace an object in a method
public class UserService {
    private User currentUser;

    // This doesn't work as expected!
    public void switchUser(User newUser) {
        this.currentUser = newUser;  // Only changes local field
        // If called from outside: service.switchUser(new User("Bob"))
        // the caller's variable is NOT changed
    }
}

// ✅ Better: return the new object
public class UserService {
    private User currentUser;

    public User switchUser(User newUser) {
        this.currentUser = newUser;
        return newUser;  // Caller can capture the return value
    }
}
```

### Scenario 2: Batch Updates (Works Because of Reference Copy)

```java
// This works because we modify the OBJECT, not the reference
public class OrderService {
    public void applyDiscount(List<OrderItem> items, double percent) {
        for (OrderItem item : items) {
            item.setPrice(item.getPrice() * (1 - percent));  // Modifies shared object
        }
        // items list is modified — same list the caller has
    }
}

// Usage
List<OrderItem> myItems = getItems();
service.applyDiscount(myItems, 0.10);  // 10% discount
// myItems is now updated — each item's price is reduced by 10%
```

### Scenario 3: Null Checks After Method Calls

```java
// ❌ This won't work
public static void clearList(List<String> list) {
    list = null;  // Only nulls the local copy
}

// ✅ This works
public static void clearList(List<String> list) {
    list.clear();  // Modifies the actual list object
}

// Usage
List<String> names = new ArrayList<>(List.of("Alice", "Bob"));
clearList(names);
// names is still not null, but it's empty []
```

---

## Quick Reference

| Operation | Pass-by-Value Behavior | Result |
|-----------|----------------------|--------|
| `modifyPrimitive(int x)` | Copy of value | Original unchanged |
| `modifyObjectField(User u)` | Copy of reference → same object | Original's fields changed |
| `reassignReference(User u)` | Copy of reference → new object | Original reference unchanged |
| `modifyCollection(List l)` | Copy of reference → same list | Original list modified |
| `nullifyReference(User u)` | Copy of reference → null | Original reference unchanged |

---

## Common Mistakes

| Mistake | Why It Happens | Fix |
|---------|---------------|-----|
| Thinking Java passes by reference | Objects seem to be "passed by reference" because the reference is copied | Understand: the reference is the VALUE being copied |
| Trying to nullify a parameter | Setting `param = null` only nulls the local copy | Use the return value instead |
| Confused why reassignment doesn't work | `param = new Foo()` creates a new object, doesn't affect the original | If you need to replace, return the new object |
| Thinking `final` prevents modification | `final` prevents reassignment, not field modification | `final` means you can't do `u = new User(...)`, but you CAN do `u.name = "Bob"` |
| Modifying a String parameter | Strings are immutable — `s = s + "x"` creates a new String | Use StringBuilder instead |
