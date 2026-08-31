const fs = require('fs');
const path = require('path');

const modulesPath = path.join(__dirname, '../backend/src/main/resources/content/modules.json');
const modules = JSON.parse(fs.readFileSync(modulesPath, 'utf-8'));

// Define the new group ordering
const groupOrder = {
  // ========== JAVA CORE ==========
  'java': 1,
  'java-8': 2,
  'java-11': 3,
  'java-17': 4,
  'java-21': 5,
  'java-25': 6,
  'java-26': 7,
  'java-advanced-language': 8,
  'java-collections-deep': 9,
  'java-streams-deep': 10,
  'java-concurrency-deep': 11,
  'java-memory-model': 12,
  'java-generics-deep': 13,
  'java-strings-deep': 14,
  'java-io-nio': 15,
  'java-networking': 16,
  'java-time-api': 17,
  'java-functional-programming': 18,
  'java-reflection-annotations': 19,
  'java-annotation-processing': 20,
  'java-exceptions-deep': 21,
  'java-arrays-deep': 22,
  'java-wrappers-deep': 23,
  'java-nested-classes': 24,
  'java-enums-deep': 25,
  'java-xml-processing': 26,
  'java-serialization-networking': 27,
  'java-jpms': 28,

  // ========== JAVA TESTING ==========
  'java-testing': 29,
  'junit5-deep': 30,
  'mockito-deep': 31,

  // ========== SOFTWARE ENGINEERING ==========
  'data-structures-algorithms': 32,
  'design-patterns': 33,
  'solid-clean-code': 34,

  // ========== SPRING CORE ==========
  'spring-core': 35,
  'spring-aop': 36,
  'spring-transactions-deep': 37,
  'spring-configuration': 38,
  'spring-profiles-deep': 39,
  'spring-scheduling-async': 40,
  'spring-cache': 41,
  'spring-logging': 42,
  'spring-lombok': 43,

  // ========== SPRING BOOT ==========
  'spring-boot': 44,
  'spring-boot-internals': 45,
  'spring-boot-fullstack': 46,
  'spring-boot-devtools': 47,
  'spring-actuator-deep': 48,
  'spring-autoconfig': 49,
  'spring-starters': 50,
  'spring-configproperties': 51,
  'spring-shell': 52,
  'spring-session': 53,
  'spring-testing-advanced': 54,
  'spring-rest-clients': 55,
  'spring-webmvc-advanced': 56,
  'spring-file-upload': 57,

  // ========== BUILD TOOLS ==========
  'maven-gradle': 58,
  'jvm-performance': 59,

  // ========== SPRING DATA ==========
  'spring-data': 60,
  'spring-data-jpa-deep': 61,
  'spring-data-jdbc': 62,
  'spring-jdbc': 63,
  'db-migrations': 64,
  'database-design': 65,
  'postgresql-deep': 66,
  'sql-advanced': 67,
  'redis-deep': 68,
  'mongodb-deep': 69,

  // ========== SECURITY ==========
  'spring-security': 70,
  'spring-security-advanced': 71,
  'spring-security-jwt-deep': 72,
  'oauth2-oidc': 73,
  'owasp-security': 74,

  // ========== HTTP & API ==========
  'http-basics': 75,
  'rest-best-practices': 76,
  'openapi-rest-docs': 77,
  'spring-web-apis': 78,
  'spring-webflux': 79,
  'grpc-apis': 80,
  'graphql-deep': 81,
  'websockets-deep': 82,
  'jackson-json': 83,
  'elasticsearch-deep': 84,

  // ========== MESSAGING ==========
  'spring-kafka': 85,
  'kafka-deep': 86,
  'spring-amqp': 87,
  'spring-messaging': 88,
  'spring-integration': 89,
  'event-driven-architecture': 90,

  // ========== RESILIENCE & DISTRIBUTED ==========
  'resilience-circuit-breaker': 91,
  'spring-cloud': 92,
  'microservices-patterns': 93,
  'distributed-systems': 94,
  'spring-modulith': 95,

  // ========== AI ==========
  'spring-ai': 96,

  // ========== CAPSTONE ==========
  'capstone': 97,

  // ========== DEVOPS ==========
  'cloud-native': 98,
  'docker-deep': 99,
  'docker-compose-examples': 100,
  'kubernetes-deep': 101,
  'terraform-infra': 102,
  'cicd-devops': 103,
  'observability': 104,
  'graalvm-native': 105,

  // ========== PROJECTS ==========
  'projects': 106,
  'spring-batch': 107,
  'ddd-architecture': 108,
  'git-github-basics': 109
};

// Check for modules not in our ordering
const moduleIds = modules.map(m => m.id);
const missing = moduleIds.filter(id => !groupOrder[id]);
if (missing.length > 0) {
  console.log('⚠️  Modules not in groupOrder:', missing);
}

// Apply new ordering
modules.forEach(m => {
  if (groupOrder[m.id] !== undefined) {
    m.order = groupOrder[m.id];
  } else {
    console.log('⚠️  No order for:', m.id, m.title);
    // Assign at end
    m.order = 200 + modules.indexOf(m);
  }
});

// Sort by order
modules.sort((a, b) => a.order - b.order);

// Write back
fs.writeFileSync(modulesPath, JSON.stringify(modules, null, 2) + '\n', 'utf-8');

console.log(`✅ Reorganized ${modules.length} modules into logical groups`);
console.log('\nNew ordering:');
modules.forEach(m => {
  console.log(`  ${String(m.order).padStart(3)} | ${m.id.padEnd(30)} | ${m.title}`);
});
