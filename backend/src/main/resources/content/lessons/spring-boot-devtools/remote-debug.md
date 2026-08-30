---
title: Remote Debugging with DevTools
summary: How to debug a Spring Boot app running on a remote machine, setting up remote JVM debugging, SSH tunneling, and security considerations.
order: 4
minutes: 15
topics: [remote-debug, jdwp, ssh-tunnel, jvm-arguments, debugging]
docs:
  - https://docs.spring.io/spring-boot/reference/using/devtools.html
---

## The Concept, From Zero

Spring Boot DevTools lets you debug a remote application by setting up a JVM debug agent. You connect your IDE to the remote JVM over a network connection.

```bash
# Start the app with debug agent
java -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005 \
     -jar app.jar

# From your IDE: connect to localhost:5005 (via SSH tunnel)
```

---

## Line-by-Line Walkthrough

### 1. Remote JVM Configuration

```bash
# On the remote server
java -jar app.jar \
  --spring.devtools.remote.secret=mysecretkey \
  -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005
```

### 2. SSH Tunnel (Secure)

```bash
# From your local machine
ssh -L 5005:localhost:5005 user@remote-server

# Now connect IDE to localhost:5005
```

### 3. IDE Configuration (IntelliJ)

```
1. Run → Edit Configurations → + → Remote JVM Debug
2. Host: localhost
3. Port: 5005
4. Click Debug
```

---

## Real-World Scenarios

### Scenario 1: Debug staging environment

```bash
# On staging server
java -jar app.jar \
  --spring.profiles.active=staging \
  -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005

# From local machine
ssh -L 5005:localhost:5005 deploy@staging.example.com

# In IntelliJ: connect to localhost:5005, set breakpoints, debug
```

### Scenario 2: Remote restart

```bash
# DevTools remote restart allows live class reloading on remote
# Set the remote secret for security
export SPRING_DEVTOOLS_REMOTE_SECRET=mysecretkey
java -jar app.jar
```

---

## Security Considerations

```yaml
# application.yml — NEVER use default secret in production
spring:
  devtools:
    remote:
      secret: ${DEVTOOLS_SECRET:changeme}
      restart:
        enabled: true
```

```bash
# Always use SSH tunnel — don't expose debug port to public network
# The debug port allows arbitrary code execution
```

---

## Common Mistakes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Exposing debug port publicly | Security vulnerability | Always use SSH tunnel |
| Using default devtools secret | Unauthorized remote restart | Set a strong secret |
| Forgetting suspend=n | App hangs waiting for debugger | Use suspend=n unless you need early breakpoints |
| Not disabling in production | Performance + security risk | DevTools auto-disables in production (JAR packaging) |
