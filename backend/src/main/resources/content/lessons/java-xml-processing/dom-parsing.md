---
title: DOM Parsing — Loading XML Into a Navigable Tree
summary: How the Document Object Model builds a full in-memory tree from XML, node traversal, modification, and serialization back to string or file.
order: 2
minutes: 22
topics: [dom, xml-parsing, document-builder, node-traversal, xml-modification]
docs:
  - https://docs.oracle.com/javase/8/docs/api/javax/xml/parsers/DocumentBuilderFactory.html
  - https://docs.oracle.com/javase/tutorial/jaxp/dom/index.html
---

## The Concept, From Zero

Imagine you receive an XML file that describes a company's entire organizational chart — departments, employees, projects — all nested inside each other. **DOM (Document Object Model) parsing** reads this entire file at once and builds a **tree structure** in memory where every element, attribute, and text node is an object you can navigate, modify, and delete.

**Why does this matter?**

DOM parsing is ideal when you need to:
- **Navigate freely** — jump from any node to any other node (parent, sibling, child)
- **Modify the document** — change element values, add new elements, remove nodes
- **Query with XPath** — use powerful expressions like `/company/department[@name='Engineering']/employee`
- **Small to medium files** — when the entire document fits comfortably in memory

**The tradeoff:** DOM loads everything into RAM. A 100 MB XML file becomes ~300-500 MB in memory (tree nodes have overhead). For huge files, use SAX or StAX instead.

---

## How DOM Actually Works

Think of XML as a family tree:

```
<company>              ← root element
  <department name="Engineering">
    <employee id="1">
      <name>Alice</name>
      <role>Senior Dev</role>
    </employee>
  </department>
</company>
```

DOM turns this into an in-memory tree where:

```
Document
  └── Element: company
        └── Element: department  [attribute: name="Engineering"]
              └── Element: employee  [attribute: id="1"]
                    ├── Element: name
                    │     └── Text: "Alice"
                    └── Element: role
                          └── Text: "Senior Dev"
```

Every box is a **Node** — the base interface. Elements, attributes, and text are all types of nodes.

---

## Code Walkthrough — Loading and Reading XML

### Step 1: Create a DocumentBuilder

```java
// DocumentBuilderFactory is a factory that creates DocumentBuilder instances.
// Each implementation of this factory supports different features and options.
DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();

// Enable namespace awareness so elements like <ns:employee> are handled properly.
// Without this, <ns:employee> and <employee> look the same to the parser.
factory.setNamespaceAware(true);

// Create the actual parser. This is thread-safe and can be reused.
DocumentBuilder builder = factory.newDocumentBuilder();
```

**Line-by-line:**
1. `DocumentBuilderFactory.newInstance()` — Finds the default DOM implementation on your classpath (usually Xerces or the JDK's built-in one). It uses the `javax.xml.parsers.DocumentBuilderFactory` service provider mechanism.
2. `setNamespaceAware(true)` — Critical for XML with `xmlns` attributes. Without this, namespace prefixes are treated as part of the element name (e.g., `ns:employee` instead of understanding `ns` as a prefix).
3. `newDocumentBuilder()` — The actual parser that reads XML and builds the tree.

### Step 2: Parse XML into a Document

```java
// Parse from a file
Document doc = builder.parse(new File("employees.xml"));

// Or parse from a string
Document doc = builder.parse(new InputSource(new StringReader(xmlString)));

// Or parse from an input stream (useful for network data)
Document doc = builder.parse(connection.getInputStream());
```

**What happens internally:**
1. The parser reads the XML byte stream
2. Validates against the DTD/XSD if configured
3. Builds a complete tree of Node objects
4. Returns the root `Document` object

### Step 3: Navigate the Tree

```java
// Get the root element — every XML document has exactly one root
Element root = doc.getDocumentElement();  // <company>

// Get child elements by tag name
// Note: this only searches DIRECT children, not all descendants
NodeList departments = root.getElementsByTagName("department");
System.out.println("Number of departments: " + departments.getLength());

// Access a specific department (index 0 = first one)
Element dept = (Element) departments.item(0);

// Read attributes
String deptName = dept.getAttribute("name");  // "Engineering"
System.out.println("Department: " + deptName);

// Get child elements of the department
NodeList employees = dept.getElementsByTagName("employee");
for (int i = 0; i < employees.getLength(); i++) {
    Element emp = (Element) employees.item(i);
    String id = emp.getAttribute("id");
    
    // Get the text content of child elements
    // getElementsByTagName returns ALL descendants, so use getChildNodes() for direct children
    String name = emp.getElementsByTagName("name").item(0).getTextContent();
    String role = emp.getElementsByTagName("role").item(0).getTextContent();
    
    System.out.printf("Employee %s: %s (%s)%n", id, name, role);
}
```

**Key difference: `getElementsByTagName` vs `getChildNodes()`**
- `getElementsByTagName("name")` — searches ALL descendants recursively. If a grandchild element is also named "name", it gets included.
- `getChildNodes()` — returns only direct children (including text nodes and whitespace nodes).

```java
// getChildNodes() returns ALL node types, including whitespace!
NodeList children = dept.getChildNodes();
for (int i = 0; i < children.getLength(); i++) {
    Node node = children.item(i);
    // Filter by node type — you usually want ELEMENT_NODE only
    if (node.getNodeType() == Node.ELEMENT_NODE) {
        System.out.println("Direct child: " + node.getNodeName());
    }
}
```

### Step 4: Modify the Document

```java
// Create a new employee element
Element newEmp = doc.createElement("employee");
newEmp.setAttribute("id", "3");

// Create child elements
Element newName = doc.createElement("name");
newName.setTextContent("Charlie");

Element newRole = doc.createElement("role");
newRole.setTextContent("Intern");

// Assemble the tree
newEmp.appendChild(newName);
newEmp.appendChild(newRole);

// Add to the department
Element dept = (Element) root.getElementsByTagName("department").item(0);
dept.appendChild(newEmp);

// Remove an employee (first one with id="1")
NodeList employees = dept.getElementsByTagName("employee");
for (int i = 0; i < employees.getLength(); i++) {
    Element emp = (Element) employees.item(i);
    if ("1".equals(emp.getAttribute("id"))) {
        emp.getParentNode().removeChild(emp);
        break;
    }
}

// Modify existing content
Element firstEmp = (Element) dept.getElementsByTagName("employee").item(0);
firstEmp.getElementsByTagName("role").item(0).setTextContent("Lead Developer");
```

**Important:** These modifications happen **only in memory**. The original file is unchanged until you serialize.

### Step 5: Serialize Back to XML

```java
// Create a Transformer that converts DOM tree back to XML text
TransformerFactory tf = TransformerFactory.newInstance();
Transformer transformer = tf.newTransformer();

// Optional: make it pretty-printed
transformer.setOutputProperty(OutputKeys.INDENT, "yes");
transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");

// Write to a file
DOMSource source = new DOMSource(doc);
StreamResult result = new StreamResult(new File("employees-modified.xml"));
transformer.transform(source, result);

// Or write to a string
StringWriter writer = new StringWriter();
transformer.transform(source, new StreamResult(writer));
String xmlString = writer.toString();
```

---

## Real-World Organization Scenarios

### Scenario 1: Configuration File Management
Many enterprises store application configuration in XML. DOM is perfect for reading AND modifying these files:

```java
public class ConfigManager {
    private Document configDoc;
    private File configFile;
    
    public ConfigManager(String path) throws Exception {
        this.configFile = new File(path);
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        configDoc = factory.newDocumentBuilder().parse(configFile);
    }
    
    public String getValue(String section, String key) {
        NodeList sections = configDoc.getElementsByTagName(section);
        if (sections.getLength() == 0) return null;
        Element sectionEl = (Element) sections.item(0);
        NodeList keys = sectionEl.getElementsByTagName(key);
        if (keys.getLength() == 0) return null;
        return keys.item(0).getTextContent();
    }
    
    public void setValue(String section, String key, String value) {
        NodeList sections = configDoc.getElementsByTagName(section);
        Element sectionEl = (Element) sections.item(0);
        NodeList keys = sectionEl.getElementsByTagName(key);
        if (keys.getLength() > 0) {
            keys.item(0).setTextContent(value);
        } else {
            Element keyEl = configDoc.createElement(key);
            keyEl.setTextContent(value);
            sectionEl.appendChild(keyEl);
        }
    }
    
    public void save() throws Exception {
        TransformerFactory tf = TransformerFactory.newInstance();
        Transformer transformer = tf.newTransformer();
        transformer.setOutputProperty(OutputKeys.INDENT, "yes");
        transformer.transform(new DOMSource(configDoc), new StreamResult(configFile));
    }
}

// Usage:
ConfigManager config = new ConfigManager("app-config.xml");
System.out.println(config.getValue("database", "url"));   // jdbc:postgresql://...
config.setValue("database", "pool-size", "20");
config.save();
```

### Scenario 2: SOAP Response Processing
Legacy enterprise systems often communicate via SOAP XML:

```java
public OrderStatus parseSoapResponse(String soapXml) throws Exception {
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    Document doc = factory.newDocumentBuilder().parse(new InputSource(new StringReader(soapXml)));
    
    // Use namespace-aware lookups
    NodeList orders = doc.getElementsByTagNameNS("*", "OrderStatus");
    Element order = (Element) orders.item(0);
    
    return new OrderStatus(
        order.getAttribute("orderId"),
        order.getElementsByTagNameNS("*", "status").item(0).getTextContent(),
        order.getElementsByTagNameNS("*", "trackingNumber").item(0).getTextContent()
    );
}
```

### Scenario 3: Build Pipeline Configuration
Maven's `pom.xml` is itself parsed with DOM-like APIs. You might need to read or modify build configs programmatically:

```java
public void addDependency(Document pomDoc, String groupId, String artifactId, String version) {
    NodeList deps = pomDoc.getElementsByTagName("dependencies");
    Element dependencies = (Element) deps.item(0);
    
    Element dep = pomDoc.createElement("dependency");
    Element g = pomDoc.createElement("groupId"); g.setTextContent(groupId);
    Element a = pomDoc.createElement("artifactId"); a.setTextContent(artifactId);
    Element v = pomDoc.createElement("version"); v.setTextContent(version);
    
    dep.appendChild(g); dep.appendChild(a); dep.appendChild(v);
    dependencies.appendChild(dep);
}
```

---

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Ignoring namespaces | `getElementsByTagName("employee")` misses `<ns:employee>` | Use `getElementsByTagNameNS("*", "employee")` or set `namespaceAware(true)` |
| Confusing `item(0)` with iteration | Assumes elements exist without checking `getLength()` | Always check length first |
| Text nodes in `getChildNodes()` | Whitespace between tags creates text nodes | Filter by `getNodeType() == Node.ELEMENT_NODE` |
| Forgetting to serialize | DOM modifications are in-memory only | Call `Transformer.transform()` to save |
| Large XML files | 100 MB XML uses 300+ MB RAM | Use SAX/StAX for streaming; DOM for small files |
| Thread safety | `DocumentBuilder` is thread-safe, but `Document` is not | Synchronize modifications or use separate Documents |

---

## When to Use DOM vs Alternatives

| Scenario | Best Choice | Why |
|----------|------------|-----|
| Need to modify XML | **DOM** | Only parser that supports in-memory editing |
| Need XPath queries | **DOM** | XPath works naturally on DOM trees |
| Small config files (< 10 MB) | **DOM** | Simple API, full access |
| Huge files (> 100 MB) | **SAX or StAX** | Stream processing, constant memory |
| Read-only, one-pass processing | **SAX** | Fastest, lowest memory |
| Complex conditional processing | **StAX** | Pull-based, most control |
| JSON-like data | **Jackson/Gson** | XML is overkill for key-value data |
