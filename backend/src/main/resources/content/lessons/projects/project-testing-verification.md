---
title: Project Testing & Verification — Proving Every Project Works
summary: How to test, verify, and run all 25 projects — Docker setup, integration tests, API testing, load testing, and CI/CD verification scripts.
order: 4
minutes: 60
topics: [testing, docker, verification, ci-cd, api-testing, load-testing]
docs:
  - https://docs.spring.io/spring-boot/reference/testing.html
  - https://docs.docker.com/compose/
---

## Why Testing Matters

Every project in this module is **verified to work**. Here's how:

1. **Unit Tests** — Test individual classes in isolation
2. **Integration Tests** — Test with real database and HTTP
3. **Docker Tests** — Run in isolated containers
4. **API Tests** — Verify endpoints with real HTTP calls

---

## Testing Any Project

### Step 1: Run Unit Tests

```bash
cd project-name

# Run all tests
mvn test

# Run specific test class
mvn test -Dtest=TaskServiceTest

# Run with coverage
mvn test jacoco:report
```

### Step 2: Run Integration Tests

```bash
# Start test database
docker-compose up -d db

# Run integration tests
mvn verify -Pintegration

# Or run all tests including integration
mvn verify
```

### Step 3: Run with Docker

```bash
# Build and start all services
docker-compose up --build -d

# Wait for services to start
sleep 30

# Test health endpoints
curl http://localhost:8080/actuator/health

# Test API endpoints
curl http://localhost:8080/api/tasks
curl http://localhost:8080/api/products

# View logs
docker-compose logs -f app
```

### Step 4: API Testing Script

```bash
#!/bin/bash
# test-api.sh — Test all endpoints for any project

BASE_URL="http://localhost:8080"
PASS=0
FAIL=0

test_endpoint() {
    local method=$1
    local url=$2
    local data=$3
    local expected=$4
    
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            -H "Content-Type: application/json" -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$url")
    fi
    
    status=$(echo "$response" | tail -1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$status" = "$expected" ]; then
        echo "✅ PASS: $method $url ($status)"
        ((PASS++))
    else
        echo "❌ FAIL: $method $url (expected $expected, got $status)"
        echo "   Response: $body"
        ((FAIL++))
    fi
}

echo "=== Testing Task Manager API ==="
test_endpoint GET "$BASE_URL/api/tasks" "" "200"
test_endpoint POST "$BASE_URL/api/tasks" '{"title":"Test Task","description":"Testing"}' "201"
test_endpoint GET "$BASE_URL/api/tasks/1" "" "200"
test_endpoint PUT "$BASE_URL/api/tasks/1" '{"title":"Updated","status":"IN_PROGRESS"}' "200"
test_endpoint DELETE "$BASE_URL/api/tasks/1" "" "204"
test_endpoint GET "$BASE_URL/api/tasks/999" "" "404"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
```

---

## Integration Test Template

```java
package com.backendforge.project;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.*;
import org.springframework.test.context.ActiveProfiles;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ProjectIntegrationTest {
    
    @Autowired
    private TestRestTemplate restTemplate;
    
    @Test
    void fullCrudFlow() {
        // Create
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        
        String createBody = """
            {
                "title": "Integration Test",
                "description": "Testing full CRUD flow"
            }
            """;
        
        ResponseEntity<String> createResponse = restTemplate.postForEntity(
            "/api/tasks", new HttpEntity<>(createBody, headers), String.class);
        assertEquals(HttpStatus.CREATED, createResponse.getStatusCode());
        
        // Read
        ResponseEntity<String> getResponse = restTemplate.getForEntity(
            "/api/tasks/1", String.class);
        assertEquals(HttpStatus.OK, getResponse.getStatusCode());
        assertTrue(getResponse.getBody().contains("Integration Test"));
        
        // Update
        String updateBody = """
            {
                "title": "Updated Task",
                "status": "IN_PROGRESS"
            }
            """;
        restTemplate.put("/api/tasks/1", new HttpEntity<>(updateBody, headers));
        
        // Delete
        restTemplate.delete("/api/tasks/1");
        ResponseEntity<String> deleteCheck = restTemplate.getForEntity(
            "/api/tasks/1", String.class);
        assertEquals(HttpStatus.NOT_FOUND, deleteCheck.getStatusCode());
    }
}
```

---

## Docker Testing

### Test Any Project with Docker

```bash
#!/bin/bash
# docker-test.sh — Run and test any project

PROJECT=$1
echo "=== Testing $PROJECT ==="

# Build and start
cd $PROJECT
docker-compose up --build -d

# Wait for startup
echo "Waiting for services to start..."
sleep 30

# Check health
HEALTH=$(curl -s http://localhost:8080/actuator/health)
if echo "$HEALTH" | grep -q '"status":"UP"'; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    docker-compose logs app
    exit 1
fi

# Run API tests
echo "Running API tests..."
./test-api.sh

# Cleanup
docker-compose down -v
echo "=== $PROJECT tests complete ==="
```

### Test All Projects

```bash
#!/bin/bash
# test-all.sh — Run tests for all 25 projects

PROJECTS=(
    "task-manager"
    "ecommerce-store"
    "blog-platform"
    "library-management"
    "hotel-booking"
    "employee-portal"
    "inventory-management"
    "social-feed"
    "recipe-app"
    "event-ticketing"
    "order-processing"
    "auth-service"
    "notification-service"
    "file-storage"
    "search-service"
    "payment-gateway"
    "chat-system"
    "api-gateway"
    "circuit-breaker"
    "event-driven"
    "cqrs-order"
    "event-sourcing-bank"
    "saga-orchestration"
    "distributed-config"
    "service-mesh"
)

PASS=0
FAIL=0

for project in "${PROJECTS[@]}"; do
    echo ""
    echo "=========================================="
    echo "Testing: $project"
    echo "=========================================="
    
    if ./docker-test.sh $project; then
        ((PASS++))
    else
        ((FAIL++))
    fi
done

echo ""
echo "=========================================="
echo "FINAL RESULTS: $PASS passed, $FAIL failed"
echo "=========================================="
```

---

## Load Testing

### Apache Bench

```bash
# Install Apache Bench
# macOS: brew install httpd
# Linux: apt-get install apache2-utils

# Test GET requests
ab -n 1000 -c 10 http://localhost:8080/api/tasks

# Test POST requests
ab -n 1000 -c 10 -p data.json -T application/json \
    http://localhost:8080/api/tasks
```

### JMeter

```bash
# Run JMeter test plan
jmeter -n -t test-plan.jmx -l results.jtl -e -o report/
```

---

## CI/CD Pipeline

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test All Projects

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
      
      - name: Install Docker Compose
        run: sudo apt-get install docker-compose
      
      - name: Build and Test
        run: |
          for project in */; do
            if [ -f "$project/docker-compose.yml" ]; then
              echo "Testing $project..."
              cd $project
              docker-compose up --build -d
              sleep 30
              ./test-api.sh
              docker-compose down -v
              cd ..
            fi
          done
      
      - name: Upload Test Results
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: */test-results/
```

---

## Quick Reference

```bash
# Run any project
docker-compose up --build -d

# Test any project
./test-api.sh

# View logs
docker-compose logs -f

# Stop all services
docker-compose down -v

# Run tests
mvn test

# Check health
curl http://localhost:8080/actuator/health
```
