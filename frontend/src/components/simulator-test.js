// Test the current simulator capabilities
import { simulateJava } from './JavaSimulator.js';

function test(name, code, expectedPattern) {
  const result = simulateJava(code);
  const output = result.output;
  const passed = typeof expectedPattern === 'function' ? expectedPattern(output) : expectedPattern.test(output);
  console.log(`${passed ? '✅' : '❌'} ${name}`);
  if (!passed) {
    console.log(`   Expected pattern: ${expectedPattern}`);
    console.log(`   Got: ${JSON.stringify(output)}`);
    if (result.errors.length) console.log(`   Errors: ${result.errors.join(', ')}`);
  }
}

console.log('=== Switch Expressions ===');
// Traditional switch with arrow syntax
test('switch with arrow syntax',
`int day = 3;
String result = switch (day) {
    case 1 -> "Monday";
    case 2 -> "Tuesday";
    case 3 -> "Wednesday";
    default -> "Other";
};
System.out.println(result);`,
/^Wednesday$/);

// Switch with multiple statements in arrow block
test('switch arrow with block',
`int score = 85;
String grade = switch (score) {
    case 90, 95, 100 -> {
        yield "A+";
    }
    case 80, 85, 90 -> "A";
    default -> "B";
};
System.out.println(grade);`,
/^A$/);

console.log('\n=== Records ===');
// Basic record
test('record creation and access',
`record Person(String name, int age) {}
Person p = new Person("Alice", 30);
System.out.println(p.name);
System.out.println(p.age);`,
/^Alice\n30$/);

// Record with compact constructor
test('record toString',
`record Point(int x, int y) {}
Point p = new Point(10, 20);
System.out.println(p);`,
out => out.includes('Point') && out.includes('10') && out.includes('20'));

console.log('\n=== Pattern Matching instanceof ===');
// Pattern matching with instanceof (Java 16+)
test('pattern matching instanceof',
`Object obj = "Hello";
if (obj instanceof String s) {
    System.out.println(s.toUpperCase());
} else {
    System.out.println("Not a string");
}`,
/^HELLO$/);

// Pattern matching with complex condition
test('pattern matching with length check',
`Object obj = "Java";
if (obj instanceof String s && s.length() > 3) {
    System.out.println("Long: " + s);
} else if (obj instanceof String s) {
    System.out.println("Short: " + s);
} else {
    System.out.println("Not string");
}`,
/^Long: Java$/);

console.log('\n=== Sealed Classes ===');
// Sealed classes (simplified - just test instantiation and usage)
test('sealed class hierarchy usage',
`sealed interface Shape permits Circle, Rectangle {}
record Circle(double radius) implements Shape {}
record Rectangle(double w, double h) implements Shape {}
Shape s = new Circle(5.0);
System.out.println(s instanceof Circle);
System.out.println(s instanceof Shape);`,
/^true\ntrue$/);

console.log('\n=== Pattern Matching switch (Java 21+) ===');
// Pattern matching in switch
test('pattern matching switch on type',
`Object obj = 42;
String result = switch (obj) {
    case Integer i -> "Number: " + i;
    case String s -> "Text: " + s;
    default -> "Other";
};
System.out.println(result);`,
/^Number: 42$/);

// Guarded patterns
test('guarded pattern in switch',
`Object obj = 15;
String result = switch (obj) {
    case Integer i when i > 10 -> "Large: " + i;
    case Integer i -> "Small: " + i;
    default -> "Not a number";
};
System.out.println(result);`,
/^Large: 15$/);

console.log('\n=== More Collection Types ===');
// LinkedHashSet (order-preserving set)
test('LinkedHashSet iteration',
`var items = new java.util.LinkedHashSet<String>();
items.add("first");
items.add("second");
items.add("first");
System.out.println(items);`,
/\[first, second\]/);

// TreeSet (sorted set)
test('TreeSet sorted output',
`var nums = new java.util.TreeSet<Integer>();
nums.add(3);
nums.add(1);
nums.add(2);
System.out.println(nums);`,
/\[1, 2, 3\]/);

// ArrayDeque as stack
test('ArrayDeque stack operations',
`var stack = new java.util.ArrayDeque<String>();
stack.push("bottom");
stack.push("middle");
stack.push("top");
System.out.println(stack.pop());
System.out.println(stack.peek());`,
/^top\nmiddle$/);

// ArrayDeque as queue
test('ArrayDeque queue operations',
`var queue = new java.util.ArrayDeque<String>();
queue.offer("first");
queue.offer("second");
queue.offer("third");
System.out.println(queue.poll());
System.out.println(queue.poll());`,
/^first\nsecond$/);

console.log('\n=== Enum with values() ===');
// Enum iteration
test('enum values iteration',
`enum Color { RED, GREEN, BLUE }
for (Color c : Color.values()) {
    System.out.println(c);
}`,
/^RED\nGREEN\nBLUE$/);

// Enum with fields
test('enum with fields',
`enum Status {
    PENDING(1, "Waiting"),
    ACTIVE(2, "In Progress"),
    DONE(3, "Complete");
    
    private final int code;
    private final String label;
    
    Status(int code, String label) {
        this.code = code;
        this.label = label;
    }
    
    int getCode() { return code; }
    String getLabel() { return label; }
}
System.out.println(Status.ACTIVE.getCode());
System.out.println(Status.ACTIVE.getLabel());`,
/^2\nIn Progress$/);

console.log('\n=== var with complex types ===');
test('var with ArrayList',
`var list = new ArrayList<String>();
list.add("hello");
list.add("world");
System.out.println(list.size());
System.out.println(list.get(0));`,
/^2\nhello$/);

test('var with HashMap',
`var scores = new HashMap<String, Integer>();
scores.put("Alice", 90);
scores.put("Bob", 85);
System.out.println(scores.get("Alice"));
System.out.println(scores.size());`,
/^90\n2$/);

console.log('\n=== Text Blocks (Java 15+) ===');
test('text block',
`String json = """
    {
        "name": "Alice",
        "age": 30
    }
    """;
System.out.println(json.trim());`,
/^\{\n\s+"name": "Alice",\n\s+"age": 30\n\s*\}$/m);

console.log('\n=== Nested class access ===');
// Anonymous class usage (simplified)
test('anonymous Runnable',
`Runnable r = new Runnable() {
    public void run() {
        System.out.println("Running...");
    }
};
r.run();`,
/^Running\.\.\.$/);

console.log('\n=== All tests complete ===');
