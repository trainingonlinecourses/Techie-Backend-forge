---
title: XPath Queries — Finding Needles in XML Haystacks
summary: The XPath language for navigating XML documents with precision — from simple paths to complex predicates, functions, and namespaces.
order: 3
minutes: 20
topics: [xpath, xml-query, predicates, xpath-functions, namespaces]
docs:
  - https://docs.oracle.com/javase/8/docs/api/javax/xml/xpath/XPath.html
  - https://www.w3.org/TR/xpath-31/
---

## The Concept, From Zero

Imagine you have a 10,000-line XML file describing a hospital's entire patient database. You need to find all patients over 65 who were admitted in the last week and have a specific diagnosis. Using DOM, you'd write dozens of nested loops. **XPath** lets you express this as a single string:

```
//patient[age > 65 and admissionDate > '2024-01-01']/diagnosis[@code='I10']
```

**XPath is to XML what SQL is to databases** — a declarative query language that finds, filters, and extracts data without manual traversal.

---

## XPath Syntax — The Essentials

### Basic Paths

```
/                           → Root node
/company                    → Root element named "company"
/company/department         → Direct children named "department"
//employee                  → ALL employee elements anywhere in the document
/company//employee          → All employee descendants under company
/..                         → Parent node
/preceding-sibling::        → Sibling before current node
/following-sibling::        → Sibling after current node
```

### Predicates (Filters)

```
/department[@name='Engineering']     → Department with name attribute = "Engineering"
/employee[@id > 100]                → Employee with id greater than 100
/employee[position()=1]             → First employee
/employee[last()]                   → Last employee
/employee[salary > 50000]           → Employee with salary > 50000
/employee[name='Alice' and role='Dev'] → Both conditions must be true
/employee[name='Alice' or name='Bob']  → Either condition
```

### Axes (Relationship Navigation)

```
child::employee              → Same as /employee
parent::department           → Parent element
ancestor::company            → Any ancestor named company
descendant::name             → Any descendant named name
following::employee          → All following employee siblings
preceding::employee          → All preceding employee siblings
self::employee               → The current node itself
```

---

## Code Walkthrough

### Step 1: Compile and Evaluate XPath

```java
// Create an XPath instance — this is the query engine
XPathFactory xpathFactory = XPathFactory.newInstance();
XPath xpath = xpathFactory.newXPath();

// Compile an XPath expression into a reusable, thread-safe object
XPathExpression expr = xpath.compile("//employee[@department='Engineering']");

// Evaluate against a DOM Document
NodeList results = (NodeList) expr.evaluate(doc, XPathConstants.NODESET);

// Iterate over results
for (int i = 0; i < results.getLength(); i++) {
    Element emp = (Element) results.item(i);
    System.out.println(emp.getElementsByTagName("name").item(0).getTextContent());
}
```

### Step 2: Different Return Types

```java
// NODESET — returns multiple nodes (most common)
NodeList nodes = (NodeList) xpath.compile("//employee").evaluate(doc, XPathConstants.NODESET);

// NODE — returns a single node (or null)
Node node = (Node) xpath.compile("//employee[1]").evaluate(doc, XPathConstants.NODE);

// STRING — returns the text content of the first matching node
String name = (String) xpath.compile("//employee[1]/name").evaluate(doc, XPathConstants.STRING);

// NUMBER — returns a numeric value
Double count = (Double) xpath.compile("count(//employee)").evaluate(doc, XPathConstants.NUMBER);

// BOOLEAN — returns true/false
Boolean exists = (Boolean) xpath.compile("//employee[@id='1']").evaluate(doc, XPathConstants.BOOLEAN);
```

### Step 3: Complex Queries

```java
// Find employees with salary above average
// This uses XPath's built-in aggregate functions
String avgSalary = "number(//employee/salary) div count(//employee)";
String aboveAvg = "//employee[number(salary) > " + avgSalary + "]";
NodeList highEarners = (NodeList) xpath.compile(aboveAvg).evaluate(doc, XPathConstants.NODESET);

// Find departments with more than 5 employees
String bigDepts = "//department[count(employee) > 5]";
NodeList depts = (NodeList) xpath.compile(bigDepts).evaluate(doc, XPathConstants.NODESET);

// String operations
String startsWithA = "//employee[name[starts-with(.,'A')]]";
String containsDev = "//employee[role[contains(.,'Developer')]]";

// Date-like filtering (lexicographic comparison works for ISO dates)
String recentHires = "//employee[hireDate > '2024-01-01']";
```

### Step 4: Namespace Handling

```java
// XML with namespaces: <emp:employee xmlns:emp="http://example.com/hr">
// You need to register a namespace context

XPathFactory factory = XPathFactory.newInstance();
XPath xpath = factory.newXPath();

// Register the namespace prefix
xpath.setNamespaceContext(new NamespaceContext() {
    public String getNamespaceURI(String prefix) {
        if ("emp".equals(prefix)) return "http://example.com/hr";
        return XMLConstants.NULL_NS_URI;
    }
    public String getPrefix(String namespaceURI) {
        return "http://example.com/hr".equals(namespaceURI) ? "emp" : null;
    }
    public Iterator<String> getPrefixes(String namespaceURI) {
        return Collections.singleton("emp").iterator();
    }
});

// Now use the prefix in queries
NodeList results = (NodeList) xpath.compile("//emp:employee[emp:department='HR']")
    .evaluate(doc, XPathConstants.NODESET);
```

---

## Real-World Organization Scenarios

### Scenario 1: Log File Analysis
XML-formatted logs from enterprise systems:

```java
public List<String> findErrorMessages(String logXml) throws Exception {
    Document doc = parseXml(logXml);
    XPath xpath = XPathFactory.newInstance().newXPath();
    
    // Find all ERROR-level log entries from the last hour
    NodeList errors = (NodeList) xpath.compile(
        "//logEntry[@level='ERROR' and @timestamp > '" + oneHourAgo() + "']//message"
    ).evaluate(doc, XPathConstants.NODESET);
    
    List<String> messages = new ArrayList<>();
    for (int i = 0; i < errors.getLength(); i++) {
        messages.add(errors.item(i).getTextContent());
    }
    return messages;
}
```

### Scenario 2: CI/CD Pipeline Configuration
Extracting build stages from a Jenkins/Maven XML config:

```java
public Map<String, String> extractBuildConfig(String pomXml) throws Exception {
    Document doc = parseXml(pomXml);
    XPath xpath = XPathFactory.newInstance().newXPath();
    
    Map<String, String> config = new LinkedHashMap<>();
    config.put("groupId", (String) xpath.compile("//project/groupId").evaluate(doc, XPathConstants.STRING));
    config.put("artifactId", (String) xpath.compile("//project/artifactId").evaluate(doc, XPathConstants.STRING));
    config.put("version", (String) xpath.compile("//project/version").evaluate(doc, XPathConstants.STRING));
    
    // Get all profiles
    NodeList profiles = (NodeList) xpath.compile("//profiles/profile/id").evaluate(doc, XPathConstants.NODESET);
    for (int i = 0; i < profiles.getLength(); i++) {
        config.put("profile." + i, profiles.item(i).getTextContent());
    }
    
    return config;
}
```

### Scenario 3: Compliance Validation
Checking XML documents against business rules:

```java
public List<String> validateCompliance(String invoiceXml) throws Exception {
    Document doc = parseXml(invoiceXml);
    XPath xpath = XPathFactory.newInstance().newXPath();
    List<String> violations = new ArrayList<>();
    
    // Rule 1: Invoice must have a tax amount
    Boolean hasTax = (Boolean) xpath.compile("//invoice/taxAmount").evaluate(doc, XPathConstants.BOOLEAN);
    if (!hasTax) violations.add("Missing tax amount");
    
    // Rule 2: Line items must total to the invoice total
    Double lineTotal = (Double) xpath.compile("sum(//lineItem/amount)").evaluate(doc, XPathConstants.NUMBER);
    Double invoiceTotal = (Double) xpath.compile("//invoice/totalAmount").evaluate(doc, XPathConstants.NUMBER);
    if (Math.abs(lineTotal - invoiceTotal) > 0.01) {
        violations.add("Line items don't match invoice total: " + lineTotal + " vs " + invoiceTotal);
    }
    
    // Rule 3: All line items must have a description
    NodeList items = (NodeList) xpath.compile("//lineItem[not(description)]").evaluate(doc, XPathConstants.NODESET);
    if (items.getLength() > 0) {
        violations.add(items.getLength() + " line items missing descriptions");
    }
    
    return violations;
}
```

---

## Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Missing namespace registration | XPath can't find elements with namespace prefixes | Register a `NamespaceContext` |
| Using `//` excessively | `//` searches all descendants — can be slow on large documents | Be specific with paths when possible |
| Forgetting `evaluate` return type | `NODESET` cast fails on single node results | Match return type to expected result count |
| Hardcoding indices | `[0]` might not be the element you expect after modifications | Use predicates with attributes instead |
| Mixing XPath 1.0 and 3.1 features | Java's built-in XPath is 1.0; Saxon for 3.1 | Stick to 1.0 features or use Saxon library |

---

## Quick Reference

| Expression | Description |
|-----------|-------------|
| `/root` | Absolute path to root element |
| `//element` | Find element anywhere |
| `element[@attr='val']` | Filter by attribute |
| `element[child]` | Filter by existence of child |
| `element[position()=N]` | Nth element (1-indexed) |
| `element[last()]` | Last element |
| `element/text()` | Text content of element |
| `count(//element)` | Count matching elements |
| `string(//element)` | Text content as string |
| `sum(//element)` | Sum of numeric text values |
