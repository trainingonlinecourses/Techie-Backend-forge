---
title: Inner Classes — Accessing the Outer World
summary: What inner classes are, how they hold a reference to the outer instance, memory implications, and when to use them vs static nested classes.
order: 2
minutes: 22
topics: [inner-class, member-class, outer-reference, memory-leak, encapsulation]
docs:
  - https://docs.oracle.com/javase/tutorial/java/javaOO/nested.html
---

## The Concept, From Zero

An **inner class** (also called a member inner class) is a non-static class defined inside another class. It has a special relationship with its outer class: every inner class instance holds a **hidden reference** to the outer class instance.

Think of it like this: an inner class is like a room inside a house. The room can access the house's kitchen, bathroom, and living room directly. But this also means the room can't exist without the house — if the house is destroyed, the room goes with it.

```java
public class House {
    private String address = "123 Main St";
    
    // Inner class — has access to outer's private fields
    public class Room {
        String name;
        
        Room(String name) {
            this.name = name;
        }
        
        void describe() {
            // Can access outer's private field directly!
            System.out.println(name + " is in house at " + address);
        }
    }
    
    public static void main(String[] args) {
        House house = new House();
        // Must create outer instance first
        House.Room room = house.new Room("Bedroom");
        room.describe();  // "Bedroom is in house at 123 Main St"
    }
}
```

---

## How the Reference Works

```java
public class Company {
    private String name = "Acme Corp";
    
    public class Department {
        String deptName;
        
        Department(String deptName) {
            this.deptName = deptName;
        }
        
        void printInfo() {
            // This compiles but has hidden outer reference
            System.out.println(deptName + " at " + name);
        }
    }
}

// What the compiler actually generates (simplified):
// class Department {
//     final Company this$0;  // HIDDEN reference to outer!
//     
//     Department(Company outer, String deptName) {
//         this.this$0 = outer;  // Stored automatically
//         this.deptName = deptName;
//     }
//     
//     void printInfo() {
//         System.out.println(deptName + " at " + this$0.name);
//     }
// }
```

---

## Line-by-Line Walkthrough

```java
import java.util.ArrayList;
import java.util.List;

public class EventManager {
    private String eventName;
    private List<String> attendees = new ArrayList<>();
    
    // Line 1: Constructor
    public EventManager(String eventName) {
        this.eventName = eventName;
    }
    
    // Line 2: Inner class — registered as a callback
    public class RegistrationHandler {
        private String handlerName;
        
        public RegistrationHandler(String handlerName) {
            this.handlerName = handlerName;
        }
        
        // Line 3: Accesses outer's private field
        public void onRegister(String attendee) {
            attendees.add(attendee);
            System.out.println(handlerName + " registered " + attendee + " for " + eventName);
        }
        
        // Line 4: Accesses outer's method
        public int getAttendeeCount() {
            return attendees.size();
        }
    }
    
    // Line 5: Factory method — inner class created with outer reference
    public RegistrationHandler createHandler(String name) {
        return new RegistrationHandler(name);
    }
    
    public static void main(String[] args) {
        // Line 6: Outer instance created first
        EventManager event = new EventManager("Java Conference");
        
        // Line 7: Inner class needs outer instance
        EventManager.RegistrationHandler handler = event.createHandler("Desk 1");
        
        // Line 8: Inner class methods access outer state
        handler.onRegister("Alice");
        handler.onRegister("Bob");
        System.out.println("Attendees: " + handler.getAttendeeCount());  // 2
        
        // Line 9: Multiple inner instances share same outer
        EventManager.RegistrationHandler handler2 = event.createHandler("Desk 2");
        handler2.onRegister("Charlie");
        System.out.println("Total: " + handler.getAttendeeCount());  // 3
    }
}
```

---

## Real-World Scenarios

### Scenario 1: Builder pattern with inner class

```java
public class HttpRequest {
    private final String url;
    private final String method;
    private final Map<String, String> headers;
    private final String body;
    
    // Private constructor — only Builder can create
    private HttpRequest(Builder builder) {
        this.url = builder.url;
        this.method = builder.method;
        this.headers = builder.headers;
        this.body = builder.body;
    }
    
    // Inner Builder class
    public static class Builder {
        private String url;
        private String method = "GET";
        private Map<String, String> headers = new HashMap<>();
        private String body;
        
        public Builder(String url) {
            this.url = url;
        }
        
        public Builder method(String method) {
            this.method = method;
            return this;  // Fluent API
        }
        
        public Builder header(String key, String value) {
            headers.put(key, value);
            return this;
        }
        
        public Builder body(String body) {
            this.body = body;
            return this;
        }
        
        public HttpRequest build() {
            return new HttpRequest(this);
        }
    }
    
    // Usage
    public static void main(String[] args) {
        HttpRequest request = new HttpRequest.Builder("https://api.example.com")
            .method("POST")
            .header("Content-Type", "application/json")
            .body("{\"name\": \"test\"}")
            .build();
    }
}
```

### Scenario 2: Iterator implementation

```java
public class ShoppingCart {
    private List<String> items = new ArrayList<>();
    
    public void addItem(String item) {
        items.add(item);
    }
    
    // Inner class implementing Iterator
    public class CartIterator implements Iterator<String> {
        private int index = 0;
        
        @Override
        public boolean hasNext() {
            return index < items.size();
        }
        
        @Override
        public String next() {
            return items.get(index++);
        }
        
        @Override
        public void remove() {
            items.remove(--index);
        }
    }
    
    public Iterator<String> iterator() {
        return new CartIterator();
    }
    
    public static void main(String[] args) {
        ShoppingCart cart = new ShoppingCart();
        cart.addItem("Laptop");
        cart.addItem("Mouse");
        cart.addItem("Keyboard");
        
        // Inner class accesses outer's items list
        Iterator<String> it = cart.iterator();
        while (it.hasNext()) {
            System.out.println(it.next());
        }
    }
}
```

### Scenario 3: Event listener pattern

```java
public class Button {
    private String label;
    private List<ClickListener> listeners = new ArrayList<>();
    
    public Button(String label) {
        this.label = label;
    }
    
    // Inner interface
    public interface ClickListener {
        void onClick(Button source);
    }
    
    // Inner class implementing the listener
    public class ClickHandler implements ClickListener {
        @Override
        public void onClick(Button source) {
            System.out.println("Button " + source.label + " clicked!");
        }
    }
    
    public void addClickListener(ClickListener listener) {
        listeners.add(listener);
    }
    
    public void click() {
        for (ClickListener listener : listeners) {
            listener.onClick(this);
        }
    }
    
    public static void main(String[] args) {
        Button saveButton = new Button("Save");
        
        // Create handler using inner class
        Button.ClickHandler handler = saveButton.new ClickHandler();
        saveButton.addClickListener(handler);
        
        saveButton.click();  // "Button Save clicked!"
    }
}
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Creating inner without outer instance | `new Room()` fails | Use `outer.new Room()` or factory method |
| Memory leak from long-lived inner | Inner holds outer reference | Use `static nested` if outer reference not needed |
| Serialization issues | Outer reference serialized too | Mark inner as `static` or use `transient` |
| Thread safety | Shared outer state | Use `synchronized` or copy outer fields |
| Comparing inner instances | `equals()` includes outer reference | Override `equals()` to ignore outer |

---

## Inner Class vs Static Nested — When to Use Which

```java
public class Outer {
    private int outerField = 10;
    private static int staticField = 20;
    
    // Use INNER when you need access to outer instance
    public class Inner {
        void doSomething() {
            System.out.println(outerField);   // ✅ Works
            System.out.println(staticField);  // ✅ Works
        }
    }
    
    // Use STATIC NESTED when you don't need outer instance
    public static class StaticNested {
        void doSomething() {
            // System.out.println(outerField);   // ❌ Compile error
            System.out.println(staticField);     // ✅ Works
        }
    }
}
```

**Rule of thumb:** If the inner class doesn't use any instance members of the outer class, make it `static nested` to avoid the hidden reference and potential memory leaks.
