import { simulateJava } from './JavaSimulator.js';

const tests = [
  // Basic
  { name: 'Hello World', code: 'System.out.println("Hello, World!");', expected: 'Hello, World!' },
  { name: 'Variables', code: 'int x = 10; System.out.println(x);', expected: '10' },
  { name: 'String concat', code: 'String name = "Java"; int ver = 21; System.out.println(name + " " + ver);', expected: 'Java 21' },
  
  // For loops
  { name: 'For loop', code: 'for (int i = 0; i < 3; i++) { System.out.println(i); }', expected: '0\n1\n2' },
  { name: 'Nested for', code: 'for (int i = 1; i <= 2; i++) { for (int j = 1; j <= 2; j++) { System.out.print(i + "" + j + " "); } }', expected: '11 12 21 22 ' },
  
  // If/else
  { name: 'If/else', code: 'int x = 5; if (x > 3) { System.out.println("big"); } else { System.out.println("small"); }', expected: 'big' },
  
  // Arrays
  { name: 'Arrays', code: 'int[] nums = {10, 20, 30}; int sum = 0; for (int i = 0; i < nums.length; i++) { sum = sum + nums[i]; } System.out.println(sum);', expected: '60' },
  
  // String methods
  { name: 'String methods', code: 'String s = "Hello World"; System.out.println(s.toUpperCase()); System.out.println(s.contains("World")); System.out.println(s.length());', expected: 'HELLO WORLD\ntrue\n11' },
  
  // Math
  { name: 'Math methods', code: 'System.out.println(Math.abs(-5)); System.out.println(Math.max(10, 20)); System.out.println(Math.sqrt(16));', expected: '5\n20\n4' },
  
  // Ternary
  { name: 'Ternary', code: 'int age = 20; String r = (age >= 18) ? "adult" : "minor"; System.out.println(r);', expected: 'adult' },
  
  // ArrayList
  { name: 'ArrayList', code: 'ArrayList<String> list = new ArrayList<>(); list.add("Java"); list.add("Python"); list.add("C++"); System.out.println(list.size()); System.out.println(list.get(1)); list.remove(0); System.out.println(list.size());', expected: '3\nPython\n2' },
  
  // HashMap
  { name: 'HashMap', code: 'HashMap<String, Integer> map = new HashMap<>(); map.put("Alice", 90); map.put("Bob", 85); System.out.println(map.size()); System.out.println(map.get("Alice")); System.out.println(map.containsKey("Bob"));', expected: '2\n90\ntrue' },
  
  // For-each with ArrayList
  { name: 'For-each ArrayList', code: 'ArrayList<String> langs = new ArrayList<>(); langs.add("Java"); langs.add("Python"); for (String lang : langs) { System.out.println(lang); }', expected: 'Java\nPython' },
  
  // For-each with HashMap
  { name: 'For-each HashMap', code: 'HashMap<String, Integer> scores = new HashMap<>(); scores.put("Alice", 90); scores.put("Bob", 85); for (Map.Entry<String, Integer> entry : scores.entrySet()) { System.out.println(entry.getKey() + "=" + entry.getValue()); }', expected: 'Alice=90\nBob=85' },
  
  // Try/catch
  { name: 'Try/catch', code: 'try { int x = 10 / 0; System.out.println(x); } catch (Exception e) { System.out.println(e.toString()); } finally { System.out.println("done"); }', expected: 'Exception: java.lang.ArithmeticException: / by zero\ndone' },
  
  // Collections utility
  { name: 'Collections.sort', code: 'ArrayList<Integer> nums = new ArrayList<>(); nums.add(30); nums.add(10); nums.add(20); Collections.sort(nums); for (int n : nums) { System.out.print(n + " "); }', expected: '10 20 30 ' },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  const result = simulateJava(t.code);
  const output = result.output;
  const ok = output === t.expected;
  if (ok) {
    console.log(`✅ ${t.name}`);
    passed++;
  } else {
    console.log(`❌ ${t.name}`);
    console.log(`   Expected: ${JSON.stringify(t.expected)}`);
    console.log(`   Got:      ${JSON.stringify(output)}`);
    if (result.errors.length > 0) console.log(`   Errors:   ${result.errors.join('; ')}`);
    failed++;
  }
}

console.log(`\n${passed}/${tests.length} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
