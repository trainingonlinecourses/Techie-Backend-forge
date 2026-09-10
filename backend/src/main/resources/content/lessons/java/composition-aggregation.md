---
title: Composition vs Aggregation vs Association
summary: The three levels of object relationships — when to use has-a vs owns-a, lifecycle management, and real-world organizational design patterns.
order: 14
minutes: 15
topics: [composition, aggregation, association, has-a, object-relationships, solid-principles]
docs:
  - https://docs.oracle.com/javase/tutorial/java/concepts/objects.html
  - https://www.javaguides.net/p/object-oriented-design.html
---

# Composition vs Aggregation vs Association

## The Big Picture

When two classes are related to each other, we need to decide **how closely** they are connected. There are three levels of relationship in object-oriented design:

```
Association (weakest)
   └── Aggregation (has-a, but loosely)
         └── Composition (has-a, tightly)
```

Think of it like relationships between people:
- **Association**: Two people know each other (co-workers, neighbors)
- **Aggregation**: A family has members, but members exist independently
- **Composition**: A human body has organs — if the body dies, the organs die too

---

## Association (Weakest Relationship)

Association simply means **two classes know about each other** but neither owns the other. They interact, but their lifecycles are completely independent.

// A doctor and a patient know about each other
// But neither owns the other — both exist independently

class Doctor {
    private String name;
    private List<Patient> patients;  // Association: Doctor knows about Patients

    public Doctor(String name) {
        this.name = name;
        this.patients = new ArrayList<>();
    }

    public void addPatient(Patient patient) {
        this.patients.add(patient);  // Just stores a reference
    }

    public void diagnose(Patient patient) {
        System.out.println(name + " is diagnosing " + patient.getName());
    }
}

class Patient {
    private String name;

    public Patient(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }
}

// Usage
Doctor doc = new Doctor("Dr. Smith");
Patient p1 = new Patient("Alice");
Patient p2 = new Patient("Bob");

doc.addPatient(p1);
doc.addPatient(p2);

// If Doctor is deleted, Patient still exists
doc = null;  // Doctor is garbage collected
// Alice and Bob still exist! Nothing breaks.

**Key point**: Neither class manages the lifecycle of the other.

---

## Aggregation (Weak "Has-A")

Aggregation is a special type of association where **one class contains the other**, but the contained object can **exist independently** of the container.

**Think of it as**: "The team has players, but players exist even if the team is disbanded."

// A Department has Professors, but Professors exist independently
class Department {
    private String name;
    private List<Professor> professors;  // Aggregation: department contains professors

    public Department(String name) {
        this.name = name;
        this.professors = new ArrayList<>();
    }

    // Professor is passed IN from outside — Department didn't create it
    public void addProfessor(Professor professor) {
        this.professors.add(professor);
    }

    public void listProfessors() {
        for (Professor p : professors) {
            System.out.println("  - " + p.getName() + " (" + p.getSubject() + ")");
        }
    }
}

class Professor {
    private String name;
    private String subject;

    public Professor(String name, String subject) {
        this.name = name;
        this.subject = subject;
    }

    public String getName() { return name; }
    public String getSubject() { return subject; }
}


**What this code does — step by step:**

1. Professors are created OUTSIDE the Department
2. They are added to the department
3. If the department closes, professors still exist!
4. Dr. Newton and Dr. Turing are still alive and teaching elsewhere
5. Same professor can be in multiple departments!
6. `mathDept.addProfessor(p1);` — Dr. Newton teaches both CS and Math

The same code, clean:

```java
Professor p1 = new Professor("Dr. Newton", "Physics");
Professor p2 = new Professor("Dr. Turing", "CS");

Department csDept = new Department("Computer Science");
csDept.addProfessor(p1);
csDept.addProfessor(p2);

csDept = null;

Department mathDept = new Department("Mathematics");
mathDept.addProfessor(p1);
```

### Visual Clue in UML
```
Department ◇──── Professor
     (hollow diamond = Aggregation)
```

### Key Characteristics
- The contained object (Professor) is created **outside** the container (Department)
- The contained object can belong to **multiple containers** simultaneously
- The contained object **outlives** the container
- The container just holds a **reference** to the object

---

## Composition (Strong "Has-A")

Composition is the **strongest** form of "has-a" relationship. The container **owns** the contained objects, **creates** them, and is **responsible for destroying** them.

**Think of it as**: "A house has rooms. If you demolish the house, the rooms are destroyed too."


**What this code does — step by step:**

1. A Car HAS an Engine. The Engine doesn't make sense without the Car.
2. `private Engine engine;` — Composition: Car creates and owns Engine
3. `this.engine = new Engine(horsepower);` — Car CREATES the Engine
4. `this.wheels.add(new Wheel());` — Car CREATES the Wheels
5. `engine.start();` — Car controls the Engine
6. When Car is destroyed, Engine and Wheels are destroyed too. There's no way to access the Engine from outside the Car
7. Package-private constructor — only Car can create an Engine
8. `this.size = 18;` — Default 18-inch wheels

The same code, clean:

```java
class Car {
    private String model;
    private Engine engine;
    private List<Wheel> wheels;

    public Car(String model, int horsepower) {
        this.model = model;
        this.engine = new Engine(horsepower);
        this.wheels = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            this.wheels.add(new Wheel());
        }
    }

    public void start() {
        engine.start();
        System.out.println(model + " started with " + engine.getHorsepower() + " HP");
    }

    public void stop() {
        engine.stop();
        System.out.println(model + " stopped");
    }

}

class Engine {
    private int horsepower;
    private boolean running;

    Engine(int horsepower) {
        this.horsepower = horsepower;
        this.running = false;
    }

    public void start() {
        this.running = true;
    }

    public void stop() {
        this.running = false;
    }

    public int getHorsepower() {
        return horsepower;
    }
}

class Wheel {
    private int size;

    Wheel() {
        this.size = 18;
    }
}
```


**What this code does — step by step:**

1. Usage
2. `myCar.start();` — Toyota Camry started with 203 HP
3. You CANNOT do this: myCar.engine.start(); // ❌ Engine is private — not accessible from outside
4. When Car is garbage collected, Engine and Wheels go with it
5. Engine and Wheels are now eligible for garbage collection. They cannot be reused by another Car

The same code, clean:

```java
Car myCar = new Car("Toyota Camry", 203);
myCar.start();


myCar = null;
```

### Visual Clue in UML
```
Car ◆──── Engine
Car ◆──── Wheel
     (filled diamond = Composition)
```

### Key Characteristics
- The container **creates** the contained objects
- The contained object **cannot exist** without the container
- The contained object is **not shared** with other containers
- When the container is destroyed, the contained objects are destroyed too

---

## Side-by-Side Comparison


**What this code does — step by step:**

1. AGGREGATION: Library has Books, but Books exist independently
2. Books come from outside — Library just stores references
3. Book still exists — it was just borrowed
4. COMPOSITION: Playlist has Songs, but Playlist creates them
5. Playlist creates its own Songs
6. `songs.add(new Song(title, artist));` — Created inside
7. `songs.clear();` — Songs are destroyed with the playlist
8. `Song(String title, String artist) {` — Package-private

The same code, clean:

```java
class Library {
    private String name;
    private List<Book> books = new ArrayList<>();

    public void addBook(Book book) {
        books.add(book);
    }

    public void removeBook(Book book) {
        books.remove(book);
    }
}

class Playlist {
    private String name;
    private List<Song> songs = new ArrayList<>();

    public void addSong(String title, String artist) {
        songs.add(new Song(title, artist));
    }

    public void clearPlaylist() {
        songs.clear();
    }
}

class Book {
    private String title;
    private String author;

    public Book(String title, String author) {
        this.title = title;
        this.author = author;
    }
}

class Song {
    private String title;
    private String artist;

    Song(String title, String artist) {
        this.title = title;
        this.artist = artist;
    }
}
```

---

## In an Organization

### Scenario 1: E-Commerce Order System (Aggregation)


**What this code does — step by step:**

1. An Order contains Products, but Products exist in the catalog independently
2. `private Customer customer;` — Aggregation — Customer exists independently
3. `this.customer = customer;` — Customer passed in from outside
4. `items.add(new OrderItem(product, quantity));` — Composition: OrderItem created here
5. `private Product product;` — Aggregation — Product exists in catalog
6. `OrderItem(Product product, int quantity) {` — Created by Order

The same code, clean:

```java
class Order {
    private String orderId;
    private List<OrderItem> items = new ArrayList<>();
    private Customer customer;

    public Order(String orderId, Customer customer) {
        this.orderId = orderId;
        this.customer = customer;
    }

    public void addItem(Product product, int quantity) {
        items.add(new OrderItem(product, quantity));
    }

    public double calculateTotal() {
        return items.stream()
            .mapToDouble(item -> item.getProduct().getPrice() * item.getQuantity())
            .sum();
    }
}

class OrderItem {
    private Product product;
    private int quantity;

    OrderItem(Product product, int quantity) {
        this.product = product;
        this.quantity = quantity;
    }

    public Product getProduct() { return product; }
    public int getQuantity() { return quantity; }
}

class Product {
    private String id;
    private String name;
    private double price;

    public Product(String id, String name, double price) {
        this.id = id;
        this.name = name;
        this.price = price;
    }

    public double getPrice() { return price; }
    public String getName() { return name; }
}

class Customer {
    private String id;
    private String name;

    public Customer(String id, String name) {
        this.id = id;
        this.name = name;
    }
}
```


**What this code does — step by step:**

1. Usage
2. Order aggregates Customer and Products
3. `order.addItem(laptop, 1);` — OrderItem created by Order (composition)
4. Total: $1059.97
5. Delete the order — Products and Customer still exist
6. laptop, mouse, alice are all still alive!

The same code, clean:

```java
public class Main {

    public static void main(String[] args) {
        Customer alice = new Customer("C001", "Alice");
        Product laptop = new Product("P001", "Laptop", 999.99);
        Product mouse = new Product("P002", "Mouse", 29.99);

        Order order = new Order("ORD-001", alice);
        order.addItem(laptop, 1);
        order.addItem(mouse, 2);

        System.out.println("Total: $" + order.calculateTotal());

        order = null;
    }
}
```

### Scenario 2: Social Media (Composition)


**What this code does — step by step:**

1. A Post has Comments, and Comments don't make sense without the Post
2. `private List<Comment> comments = new ArrayList<>();` — Composition
3. `comments.add(new Comment(author, text));` — Post creates Comments
4. When Post is deleted, Comments go with it
5. `Comment(String author, String text) {` — Package-private — only Post can create

The same code, clean:

```java
class Post {
    private String id;
    private String content;
    private List<Comment> comments = new ArrayList<>();

    public Post(String id, String content) {
        this.id = id;
        this.content = content;
    }

    public void addComment(String author, String text) {
        comments.add(new Comment(author, text));
    }

    public void deletePost() {
        comments.clear();
        System.out.println("Post and all " + comments.size() + " comments deleted");
    }

    public void listComments() {
        for (Comment c : comments) {
            System.out.println("  " + c.getAuthor() + ": " + c.getText());
        }
    }
}

class Comment {
    private String author;
    private String text;

    Comment(String author, String text) {
        this.author = author;
        this.text = text;
    }

    public String getAuthor() { return author; }
    public String getText() { return text; }
}
```


**What this code does — step by step:**

1. Usage
2. Alice: Great article! Bob: Very helpful!
3. Post and all 2 comments deleted. Comments cannot exist without the Post

The same code, clean:

```java
Post post = new Post("P001", "Learn Java!");
post.addComment("Alice", "Great article!");
post.addComment("Bob", "Very helpful!");

post.listComments();

post.deletePost();
```

### Scenario 3: Company Hierarchy (Mixed)


**What this code does — step by step:**

1. `private List<Department> departments = new ArrayList<>();` — Composition
2. `departments.add(dept);` — Company creates Departments
3. `private List<Employee> employees = new ArrayList<>();` — Aggregation
4. Employee comes from outside — Department doesn't create them
5. `employees.remove(employee);` — Employee still exists, just unemployed

The same code, clean:

```java
class Company {
    private String name;
    private List<Department> departments = new ArrayList<>();

    public Company(String name) {
        this.name = name;
    }

    public Department createDepartment(String name) {
        Department dept = new Department(name);
        departments.add(dept);
        return dept;
    }
}

class Department {
    private String name;
    private List<Employee> employees = new ArrayList<>();

    Department(String name) {
        this.name = name;
    }

    public void hire(Employee employee) {
        employees.add(employee);
    }

    public void fire(Employee employee) {
        employees.remove(employee);
    }
}

class Employee {
    private String id;
    private String name;

    public Employee(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public String getName() { return name; }
}
```


**What this code does — step by step:**

1. Company COMPOSES Departments
2. Department AGGREGATES Employees
3. If Google closes, Departments are destroyed (composition). But Employees still exist — they can work elsewhere (aggregation)
4. Alice and Bob are still alive, just unemployed

The same code, clean:

```java
Company google = new Company("Google");
Department engineering = google.createDepartment("Engineering");
Department marketing = google.createDepartment("Marketing");

Employee alice = new Employee("E001", "Alice");
Employee bob = new Employee("E002", "Bob");

engineering.hire(alice);
marketing.hire(bob);

google = null;
```

---

## Decision Guide

| Question | Answer | Relationship |
|----------|--------|--------------|
| Can the child exist without the parent? | Yes | Aggregation |
| Can the child exist without the parent? | No | Composition |
| Is the child created by the parent? | No (passed in) | Aggregation |
| Is the child created by the parent? | Yes (created inside) | Composition |
| Can the child belong to multiple parents? | Yes | Aggregation |
| Can the child belong to multiple parents? | No | Composition |
| Does deleting the parent delete the child? | No | Aggregation |
| Does deleting the parent delete the child? | Yes | Composition |

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Making everything composition | Overly tight coupling | Use aggregation when objects can exist independently |
| Exposing composed objects | Breaks encapsulation | Keep composed fields `private`, no getters |
| Creating objects outside for composition | Ownership confusion | Create composed objects inside the container |
| Mixing up aggregation and composition | Lifecycle bugs | Ask: "If the parent dies, does the child die?" |
| Using Association when Aggregation is needed | Loose design, no ownership | Use aggregation when there's a clear "has-a" |

## References

- [GeeksforGeeks — Java](https://www.geeksforgeeks.org/java/java/)
- [Oracle — The Java™ Tutorials](https://docs.oracle.com/javase/tutorial/)
