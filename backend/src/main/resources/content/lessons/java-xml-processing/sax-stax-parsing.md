---
title: SAX & StAX — Streaming XML Without Running Out of Memory
summary: Event-driven (SAX) and pull-based (StAX) parsing for processing huge XML files in constant memory — when the file is bigger than your RAM.
order: 4
minutes: 24
topics: [sax, stax, streaming, xmlreader, xmleventreader, event-driven]
docs:
  - https://docs.oracle.com/javase/8/docs/api/org/xml/sax/helpers/DefaultHandler.html
  - https://docs.oracle.com/javase/8/docs/api/javax/xml/stream/XMLEventReader.html
---

## The Concept, From Zero

You receive a 2 GB XML file containing 10 million sensor readings from an IoT system. Loading it into DOM would need 6+ GB of RAM. **SAX** and **StAX** solve this by reading XML **one event at a time** — never loading the whole file.

**The Analogy:** DOM is like reading an entire book and memorizing it. SAX is like a blind person running their finger across a line — they hear each word as it comes. StAX is like a reader who can choose to read the next word or skip ahead.

### SAX (Simple API for XML) — Push Model
- Parser **pushes** events to your handler as it reads
- You don't control the reading speed
- Great for simple, one-pass processing
- Fastest of all XML parsers

### StAX (Streaming API for XML) — Pull Model
- **You pull** events from the parser when ready
- You control the reading pace — can stop, skip, or lookahead
- More intuitive than SAX
- Modern replacement for SAX

---

## SAX Parsing — Walkthrough

### Step 1: Create a Handler

SAX uses a callback pattern — you extend `DefaultHandler` and override methods for each XML event:

```java
public class SensorHandler extends DefaultHandler {
    private List<SensorReading> readings = new ArrayList<>();
    private SensorReading current;
    private StringBuilder textBuffer;
    private String currentElement;
    
    // Called when the parser encounters an opening tag like <sensor>
    @Override
    public void startElement(String uri, String localName, String qName, Attributes attributes) {
        currentElement = qName;
        textBuffer = new StringBuilder();
        
        if ("reading".equals(qName)) {
            current = new SensorReading();
            // Read attributes from the opening tag
            current.setSensorId(attributes.getValue("sensorId"));
            current.setTimestamp(attributes.getValue("timestamp"));
        }
    }
    
    // Called for text content between tags (including whitespace!)
    @Override
    public void characters(char[] ch, int start, int length) {
        // This can be called multiple times for the same text node!
        // Always append, never replace.
        textBuffer.append(ch, start, length);
    }
    
    // Called when the parser encounters a closing tag like </sensor>
    @Override
    public void endElement(String uri, String localName, String qName) {
        if ("reading".equals(qName)) {
            readings.add(current);
        } else if ("temperature".equals(qName)) {
            current.setTemperature(Double.parseDouble(textBuffer.toString().trim()));
        } else if ("humidity".equals(qName)) {
            current.setHumidity(Double.parseDouble(textBuffer.toString().trim()));
        }
        textBuffer = new StringBuilder();  // Reset for next element
    }
    
    public List<SensorReading> getReadings() { return readings; }
}
```

### Step 2: Drive the Parser

```java
// Create the parser
SAXParserFactory factory = SAXParserFactory.newInstance();
SAXParser parser = factory.newSAXParser();

// Create handler
SensorHandler handler = new SensorHandler();

// Parse — this blocks until the entire file is processed
// Each element triggers startElement → characters → endElement callbacks
parser.parse(new File("sensors-2gb.xml"), handler);

// After parsing completes, results are in the handler
List<SensorReading> readings = handler.getReadings();
System.out.println("Processed " + readings.size() + " readings");
```

### Important SAX Behaviors

```java
// 1. characters() can fire MULTIPLE TIMES for one text node
// WRONG:
@Override
public void characters(char[] ch, int start, int length) {
    text = new String(ch, start, length);  // ❌ Overwrites partial text!
}

// RIGHT:
@Override
public void characters(char[] ch, int start, int length) {
    textBuffer.append(ch, start, length);  // ✅ Accumulates all fragments
}

// 2. No random access — you're in a streaming pipeline
// If you need the first 100 records, you can't "seek" — you must read through

// 3. Error handling
@Override
public void error(SAXParseException e) {
    System.err.println("XML Error at line " + e.getLineNumber() + ": " + e.getMessage());
}

@Override
public void fatalError(SAXParseException e) throws SAXException {
    System.err.println("Fatal XML Error: " + e.getMessage());
    throw e;  // Stop parsing
}
```

---

## StAX Parsing — Walkthrough

### Option 1: Event-Based (Iterator)

```java
// StAX uses a factory pattern to create the reader
XMLInputFactory factory = XMLInputFactory.newInstance();
XMLStreamReader reader = factory.createXMLStreamReader(new FileInputStream("sensors.xml"));

List<SensorReading> readings = new ArrayList<>();
SensorReading current = null;

// Loop through events — YOU control when to call next()
while (reader.hasNext()) {
    int event = reader.next();  // Pull the next event
    
    switch (event) {
        case XMLStreamConstants.START_ELEMENT:
            String element = reader.getLocalName();
            if ("reading".equals(element)) {
                current = new SensorReading();
                current.setSensorId(reader.getAttributeValue(null, "sensorId"));
            } else if ("temperature".equals(element)) {
                // Text comes as characters event AFTER start element
            }
            break;
            
        case XMLStreamConstants.CHARACTERS:
            String text = reader.getText().trim();
            if (!text.isEmpty() && current != null) {
                String lastElement = reader.getName().getLocalPart();
                // Note: getName() here gives the parent element, not text
            }
            break;
            
        case XMLStreamConstants.END_ELEMENT:
            String endElement = reader.getLocalName();
            if ("reading".equals(endElement)) {
                readings.add(current);
                current = null;
            }
            break;
    }
}
reader.close();
```

### Option 2: Cursor-Based (Higher Level)

```java
// XMLEventReader is a higher-level API on top of XMLStreamReader
XMLInputFactory factory = XMLInputFactory.newInstance();
XMLEventReader eventReader = factory.createXMLEventReader(new FileInputStream("sensors.xml"));

while (eventReader.hasNext()) {
    XMLEvent event = eventReader.nextEvent();
    
    if (event.isStartElement()) {
        StartElement startEl = event.asStartElement();
        String name = startEl.getName().getLocalPart();
        
        if ("reading".equals(name)) {
            Iterator<Attribute> attrs = startEl.getAttributes();
            while (attrs.hasNext()) {
                Attribute attr = attrs.next();
                System.out.println(attr.getName() + " = " + attr.getValue());
            }
        }
    }
    
    if (event.isCharacters()) {
        String text = event.asCharacters().getData().trim();
        // Process text content
    }
}
```

### Key StAX Advantage: Conditional Parsing

```java
// You can skip entire subtrees — something SAX can't do easily
while (reader.hasNext()) {
    int event = reader.next();
    
    if (event == XMLStreamConstants.START_ELEMENT) {
        if ("large-element".equals(reader.getLocalName())) {
            // Skip this entire subtree
            int depth = 1;
            while (depth > 0) {
                event = reader.next();
                if (event == XMLStreamConstants.START_ELEMENT) depth++;
                if (event == XMLStreamConstants.END_ELEMENT) depth--;
            }
            continue;
        }
    }
    // Process other elements normally...
}
```

---

## SAX vs StAX Comparison

| Feature | SAX | StAX |
|---------|-----|------|
| **Control** | Push (parser drives) | Pull (you drive) |
| **API Complexity** | Callback-based, harder to follow | Iterator-based, more intuitive |
| **Speed** | Slightly faster | Very close to SAX |
| **Subtree Skipping** | Difficult (need counter logic) | Natural (just skip events) |
| **Memory** | Near-zero | Near-zero |
| **State Management** | Instance variables in handler | Local variables in loop |
| **Modern Java** | Legacy, still works | Recommended for new code |

---

## Real-World Scenarios

### Processing a 50 GB B2B Data Feed

```java
public List<Order> parseGiantEdiXml(String filePath) throws Exception {
    XMLInputFactory factory = XMLInputFactory.newInstance();
    // Disable external entities (security!)
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
    factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
    
    XMLEventReader reader = factory.createXMLEventReader(new FileInputStream(filePath));
    List<Order> orders = new ArrayList<>();
    Order currentOrder = null;
    
    while (reader.hasNext()) {
        XMLEvent event = reader.nextEvent();
        
        if (event.isStartElement() && "Order".equals(event.asStartElement().getName().getLocalPart())) {
            currentOrder = new Order();
            currentOrder.setId(event.asStartElement().getAttributeByName(new QName("id")).getValue());
        }
        
        if (event.isCharacters() && currentOrder != null) {
            // Process text content based on state...
        }
        
        if (event.isEndElement() && "Order".equals(event.asEndElement().getName().getLocalPart())) {
            if (currentOrder.isValid()) {
                orders.add(currentOrder);
            }
            currentOrder = null;
            
            // Periodic flush to avoid OOM even with results
            if (orders.size() >= 10_000) {
                processBatch(orders);
                orders.clear();
            }
        }
    }
    return orders;
}
```

---

## Security Warning

Both SAX and StAX are vulnerable to **XXE (XML External Entity) attacks** unless you explicitly disable external entities:

```java
// For SAX
SAXParserFactory factory = SAXParserFactory.newInstance();
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);

// For StAX
XMLInputFactory factory = XMLInputFactory.newInstance();
factory.setProperty(XMLConstants.ACCESS_EXTERNAL_DTD, "");
factory.setProperty(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
```

Without these settings, an attacker could inject `<!ENTITY xxe SYSTEM "file:///etc/passwd">` and exfiltrate server files.

---

## Quick Reference

| Task | SAX | StAX |
|------|-----|------|
| Parse file | `parser.parse(file, handler)` | `factory.createXMLStreamReader(stream)` |
| Get element name | `qName` in `startElement` | `reader.getLocalName()` |
| Get attributes | `attributes.getValue("name")` | `reader.getAttributeValue(null, "name")` |
| Get text | Accumulate in `characters()` | `reader.getText()` |
| Skip subtree | Manual depth counter | Just call `next()` until depth=0 |
| Close | Not needed (parser manages) | `reader.close()` |
