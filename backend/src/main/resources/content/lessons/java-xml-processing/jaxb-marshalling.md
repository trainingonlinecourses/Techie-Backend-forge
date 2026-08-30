---
title: "JAXB Marshalling & Unmarshalling — Turning Objects Into XML and Back"
order: 1
minutes: 30
topics: ["jaxb", "marshalling", "unmarshalling", "@XmlRootElement", "@XmlElement", "@XmlAttribute", "@XmlTransient", "JAXBContext", "Marshaller", "Unmarshaller"]
summary: "JAXB converts Java objects to XML (marshalling) and XML back to Java objects (unmarshalling) with annotations, making it the standard way to handle XML in Java."
docs:
  - title: "Jakarta XML Binding (JAXB) API"
    url: "https://jakarta.ee/specifications/xml-binding/4.0/"
  - title: "Java Architecture for XML Binding (JAXB)"
    url: "https://docs.oracle.com/en/java/javase/21/docs/api/java.xml/javax/xml/bind/package-summary.html"
---

# JAXB Marshalling & Unmarshalling — Turning Objects Into XML and Back

## The Concept, From Zero

Imagine you have a Java `User` object with a name, email, and address. A third-party system — a legacy payment gateway, a government API, a hospital system — demands XML. Not JSON. XML.

You could build XML strings by hand with `StringBuilder`:
```java
String xml = "<user><name>" + user.getName() + "</name><email>" + user.getEmail() + "</email></user>";
```
This is fragile, tedious, and error-prone. Forget one angle bracket and the whole thing breaks.

**JAXB (Java Architecture for XML Binding)** solves this by letting you annotate your Java classes, and then it handles the conversion automatically:
- **Marshalling** = Java object → XML (serialization)
- **Unmarshalling** = XML → Java object (deserialization)

You annotate your POJO, create a `Marshaller`, call `marshal()`, and out comes perfect XML. Read XML from a file? Call `unmarshal()` and get a populated Java object back.

## The Code Walkthrough

### Step 1: The Annotated POJO

```java
import jakarta.xml.bind.annotation.*;

@XmlRootElement(name = "user")                    // (1) Root element name in XML
@XmlAccessorType(XmlAccessType.FIELD)              // (2) Bind fields directly, not getters
public class User {

    @XmlElement(name = "full-name")                // (3) Custom XML element name
    private String name;

    @XmlElement
    private String email;

    @XmlElement
    private int age;

    @XmlAttribute                                  // (4) This becomes an XML attribute, not element
    private int id;

    @XmlTransient                                  // (5) Completely excluded from XML
    private String password;

    // Default constructor — REQUIRED by JAXB (it instantiates via reflection)
    public User() {}

    // All-args constructor for convenience
    public User(int id, String name, String email, int age, String password) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.age = age;
        this.password = password;
    }

    // Getters and setters — JAXB calls these during marshalling/unmarshalling
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
}
```

**Line-by-line explanation:**

| Line | What it does | Why it matters |
|------|-------------|----------------|
| `@XmlRootElement(name = "user")` | Sets the root XML element name to `<user>` | Without this, JAXB uses the class name (`<user>`) as default |
| `@XmlAccessorType(XmlAccessType.FIELD)` | Tells JAXB to bind fields directly | Avoids needing getters/setters for every property |
| `@XmlElement(name = "full-name")` | Maps `name` field to `<full-name>` in XML | Useful when XML naming conventions differ from Java conventions |
| `@XmlAttribute` | Renders `id` as `id="123"` attribute | Attributes go in the opening tag, elements are children |
| `@XmlTransient` | Excludes `password` from XML | Security: never serialize secrets to XML |
| `public User() {}` | Empty constructor | **JAXB requires it** — it creates instances via reflection |

### Step 2: Marshalling (Object → XML)

```java
import jakarta.xml.bind.*;
import java.io.StringWriter;

public class JaxbDemo {
    public static void main(String[] args) throws JAXBException {
        // (1) Create the JAXB context — tells JAXB about our User class
        JAXBContext context = JAXBContext.newInstance(User.class);

        // (2) Create a marshaller — the object that does the conversion
        Marshaller marshaller = context.createMarshaller();

        // (3) Pretty-print the XML (otherwise it's one long line)
        marshaller.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);

        // (4) Create our object
        User user = new User(101, "Alice Johnson", "alice@example.com", 30, "secret123");

        // (5) Marshal to a StringWriter
        StringWriter writer = new StringWriter();
        marshaller.marshal(user, writer);

        // (6) Print the XML
        System.out.println(writer.toString());

        // (7) Or marshal directly to System.out
        marshaller.marshal(user, System.out);
    }
}
```

**What happens step-by-step:**

| Step | Code | What's happening |
|------|------|-----------------|
| 1 | `JAXBContext.newInstance(User.class)` | Scans `User` class for JAXB annotations, builds an internal metadata model. This is expensive — cache it if you marshal many objects |
| 2 | `context.createMarshaller()` | Creates a thread-safe marshaller from the context |
| 3 | `setProperty(JAXB_FORMATTED_OUTPUT, true)` | Enables indented, human-readable XML output |
| 4 | `new User(101, "Alice", ...)` | Plain Java object creation — JAXB has no special requirements on the object itself |
| 5 | `marshaller.marshal(user, writer)` | Reads fields/annotations from `User`, writes XML to the `Writer` |
| 6 | `writer.toString()` | The complete XML string |

**Output:**
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<user id="101">
    <full-name>Alice Johnson</full-name>
    <email>alice@example.com</email>
    <age>30</age>
</user>
```

Notice: `password` is **completely absent** (thanks to `@XmlTransient`), `id` appears as an **attribute** (thanks to `@XmlAttribute`), and `name` renders as `<full-name>` (thanks to `@XmlElement(name = "full-name")`).

### Step 3: Unmarshalling (XML → Object)

```java
public class JaxbUnmarshalDemo {
    public static void main(String[] args) throws JAXBException {
        // The XML we want to parse
        String xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <user id="202">
                <full-name>Bob Smith</full-name>
                <email>bob@example.com</email>
                <age>25</age>
            </user>
            """;

        // (1) Create context
        JAXBContext context = JAXBContext.newInstance(User.class);

        // (2) Create unmarshaller
        Unmarshaller unmarshaller = context.createUnmarshaller();

        // (3) Unmarshal from a StringReader
        User user = (User) unmarshaller.unmarshal(new StringReader(xml));

        // (4) Use the populated object — just like any Java object
        System.out.println("Name: " + user.getName());       // "Bob Smith"
        System.out.println("Email: " + user.getEmail());     // "bob@example.com"
        System.out.println("Age: " + user.getAge());         // 25
        System.out.println("ID: " + user.getId());           // 202
    }
}
```

**What happens:**

| Step | What's happening |
|------|-----------------|
| 1 | `JAXBContext` reads `User.class` annotations to know the mapping |
| 2 | `Unmarshaller` will use that mapping to convert XML tags to Java fields |
| 3 | `unmarshal(new StringReader(xml))` parses the XML string, creates a `User` instance, sets each field via setters or reflection |
| 4 | The result is a normal Java object — use it however you want |

The `@XmlElement(name = "full-name")` annotation tells JAXB that `<full-name>` in XML maps to the `name` field in Java. Without it, JAXB would expect `<name>`.

### Step 4: Complex Nested Objects

Real XML has hierarchy — orders contain items, users have addresses. JAXB handles this naturally:

```java
@XmlRootElement(name = "order")
@XmlAccessorType(XmlAccessType.FIELD)
public class Order {
    @XmlAttribute
    private int orderId;

    @XmlElement
    private String customerName;

    @XmlElementWrapper(name = "items")              // (1) Wraps the list in <items>
    @XmlElement(name = "item")                      // (2) Each element is <item>
    private List<OrderItem> items;

    // Getters/setters...
}

@XmlAccessorType(XmlAccessType.FIELD)
public class OrderItem {
    @XmlElement
    private String productName;

    @XmlElement
    private int quantity;

    @XmlElement
    private double price;

    // Getters/setters...
}
```

**Resulting XML:**
```xml
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<order orderId="1001">
    <customerName>Charlie Brown</customerName>
    <items>
        <item>
            <productName>Spring Boot in Action</productName>
            <quantity>2</quantity>
            <price>45.99</price>
        </item>
        <item>
            <productName>Java Concurrency in Practice</productName>
            <quantity>1</quantity>
            <price>55.00</price>
        </item>
    </items>
</order>
```

**Line-by-line on the list annotations:**

| Annotation | What it does |
|-----------|-------------|
| `@XmlElementWrapper(name = "items")` | Creates a wrapping element `<items>` around the list. Without it, items would be siblings: `<order><item>...<item>...</order>` |
| `@XmlElement(name = "item")` | Each list element is rendered as `<item>` instead of `<orderItem>` (the default class-based name) |

## Real-World Scenarios

### Scenario 1: Parsing SOAP responses from a payment gateway
```java
// SOAP services return XML — JAXB unmarshals it into typed objects
SOAPMessage response = callPaymentGateway(request);
JAXBContext ctx = JAXBContext.newInstance(PaymentResponse.class);
PaymentResponse result = (PaymentResponse) ctx.createUnmarshaller()
    .unmarshal(response.getSOAPBody().extractContentAsDocument());
if (result.isApproved()) { ... }
```

### Scenario 2: Generating reports in XML format for a government system
```java
// Government tax APIs often require XML submissions
TaxReturn taxReturn = buildTaxReturn(user, deductions);
JAXBContext ctx = JAXBContext.newInstance(TaxReturn.class);
Marshaller m = ctx.createMarshaller();
m.setProperty(Marshaller.JAXB_FORMATTED_OUTPUT, true);
m.marshal(taxReturn, new File("tax-submission-2024.xml"));
```

### Scenario 3: Migrating between XML schemas
```java
// Old system uses <usr_name>, new system uses <username>
// Map both to the same field with @XmlElement
@XmlRootElement(name = "user")
public class UnifiedUser {
    @XmlElement(name = "usr_name")      // old schema element name
    private String name;
}
```

## Common Beginner Pitfalls

1. **Forgetting the no-arg constructor** — JAXB will throw `InstantiationException` if the class doesn't have one
2. **Using field names instead of XML names** — always add `name = "..."` to `@XmlElement` when XML naming differs from Java naming
3. **Not handling collections properly** — use `@XmlElementWrapper` + `@XmlElement` for lists
4. **Forgetting `@XmlTransient` on sensitive fields** — passwords, tokens, internal IDs leak into XML
5. **Creating a new `JAXBContext` for every marshal** — it's expensive; cache it as a static field
6. **Not handling exceptions** — `JAXBException` must be caught or declared

## Key Takeaways

- **JAXB** converts Java ↔ XML using annotations (`@XmlElement`, `@XmlAttribute`, `@XmlTransient`)
- **Marshalling** = `marshaller.marshal(object, writer)` — object to XML
- **Unmarshalling** = `unmarshaller.unmarshal(reader)` — XML to object
- **No-arg constructor is mandatory** — JAXB creates instances via reflection
- **Cache `JAXBContext`** — creating it is expensive; create once per class
- **`@XmlElementWrapper` + `@XmlElement`** for collections — wraps list in a container element
- **`@XmlTransient`** excludes fields from serialization — essential for security
