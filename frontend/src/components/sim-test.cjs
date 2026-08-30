const { simulateJava } = require('./JavaSimulator');

const tests = [
  // Lambda basic
  {
    name: 'Lambda expression',
    code: `
      public static void main(String[] args) {
        var add = (int a, int b) -> a + b;
        System.out.println(add.apply(3, 4));
      }
    `,
    expected: '7'
  },
  // ArrayList forEach with lambda
  {
    name: 'ArrayList forEach with lambda',
    code: `
      public static void main(String[] args) {
        var nums = new ArrayList<Integer>();
        nums.add(1);
        nums.add(2);
        nums.add(3);
        nums.forEach(n -> System.out.println(n));
      }
    `,
    expected: '1\n2\n3'
  },
  // HashMap stream
  {
    name: 'HashMap stream',
    code: `
      public static void main(String[] args) {
        var map = new HashMap<String, Integer>();
        map.put("a", 1);
        map.put("b", 2);
        map.put("c", 3);
        System.out.println(map.size());
      }
    `,
    expected: '3'
  },
  // try/catch
  {
    name: 'try/catch exception handling',
    code: `
      public static void main(String[] args) {
        try {
          int x = 10 / 0;
          System.out.println(x);
        } catch (Exception e) {
          System.out.println("caught error");
        }
      }
    `,
    expected: 'caught error'
  },
  // ArrayList streams
  {
    name: 'ArrayList stream filter+map+collect',
    code: `
      public static void main(String[] args) {
        var nums = new ArrayList<Integer>();
        nums.add(1);
        nums.add(2);
        nums.add(3);
        nums.add(4);
        var result = nums.stream()
            .filter(n -> n > 2)
            .map(n -> n * 10)
            .toList();
        System.out.println(result.size());
      }
    `,
    expected: '2'
  },
  // Stream forEach
  {
    name: 'Stream forEach',
    code: `
      public static void main(String[] args) {
        var nums = new ArrayList<Integer>();
        nums.add(10);
        nums.add(20);
        nums.add(30);
        nums.stream()
            .filter(n -> n > 15)
            .forEach(n -> System.out.println(n));
      }
    `,
    expected: '20\n30'
  },
  // switch expression
  {
    name: 'Switch expression',
    code: `
      public static void main(String[] args) {
        int day = 3;
        switch (day) {
          case 1 -> System.out.println("Monday");
          case 2 -> System.out.println("Tuesday");
          case 3 -> System.out.println("Wednesday");
          default -> System.out.println("Other");
        }
      }
    `,
    expected: 'Wednesday'
  },
  // Optional
  {
    name: 'Optional',
    code: `
      public static void main(String[] args) {
        var opt = Optional.of(42);
        if (opt.isPresent()) {
          System.out.println(opt.get());
        }
      }
    `,
    expected: '42'
  },
  // Stream count
  {
    name: 'Stream count',
    code: `
      public static void main(String[] args) {
        var nums = new ArrayList<Integer>();
        nums.add(1);
        nums.add(2);
        nums.add(3);
        var count = nums.stream().count();
        System.out.println(count);
      }
    `,
    expected: '3'
  },
  // ArrayList sort with lambda
  {
    name: 'ArrayList sort with lambda',
    code: `
      public static void main(String[] args) {
        var nums = new ArrayList<Integer>();
        nums.add(3);
        nums.add(1);
        nums.add(2);
        nums.sort((a, b) -> a - b);
        System.out.println(nums.toString());
      }
    `,
    expected: '[1, 2, 3]'
  }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = simulateJava(test.code);
  const actual = result.output;
  if (actual === test.expected) {
    console.log(`✅ ${test.name}: PASS`);
    passed++;
  } else {
    console.log(`❌ ${test.name}: FAIL`);
    console.log(`   Expected: ${JSON.stringify(test.expected)}`);
    console.log(`   Actual:   ${JSON.stringify(actual)}`);
    if (result.errors.length > 0) {
      console.log(`   Errors:   ${result.errors.join(', ')}`);
    }
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
process.exit(failed > 0 ? 1 : 0);
