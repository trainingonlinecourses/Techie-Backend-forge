---
title: gRPC vs REST: Choosing the Right Protocol
module: grpc-apis
order: 4
minutes: 20
topics: ["gRPC vs REST", "HTTP/2", "schema evolution", "browser support", "decision framework"]
docs:
  - title: "gRPC vs REST"
    url: "https://grpc.io/blog/grpc-vs-rest/"
---

# gRPC vs REST: Choosing the Right Protocol

gRPC and REST are both service-to-service protocols — but they optimize for different worlds. This lesson is the honest comparison: where each wins, where each hurts, and the decision framework for your specific situation.

## The Head-to-Head

| Dimension | REST | gRPC |
|-----------|------|------|
| Payload | JSON (human-readable) | Protobuf (binary) |
| Contract | OpenAPI spec (optional) | .proto (mandatory, compiled) |
| Transport | HTTP/1.1+ | HTTP/2 |
| Streaming | SSE / WebSocket (add-ons) | Native (4 RPC types) |
| Browser | Native | Needs gRPC-Web proxy |
| Tooling | curl, browsers, Postman | grpcurl, codegen |
| Error model | HTTP status + body | Status codes + trailers |
| Caching | HTTP caching headers | Not built-in |
| Discoverability | OpenAPI, self-describing | Reflection |
| Versioning | URL/header/media-type | Field numbers (additive) |

## Where gRPC Wins

### 1. Internal Service-to-Service Traffic

```java
// Typed, fast, streamable — ideal between backend services
CourseServiceGrpc.CourseServiceBlockingStub stub;
CourseReply reply = stub.getCourse(request);
```

- Typed contracts — compile-time safety across teams
- 6–10× smaller payloads, faster parsing
- Native streaming (bidi chat, event feeds)

### 2. Streaming Workloads

```java
// gRPC: first-class bidi streaming
StreamObserver<Event> observer = asyncStub.subscribe(handler);
// REST: SSE/WebSocket bolted on, no standard contract
```

### 3. Polyglot Service Meshes

The .proto compiles to Java, Go, Python, Node, C# — one contract, every language, no drift.

## Where REST Wins

### 1. Browser and Mobile Clients

```java
// REST: any browser can call it directly
fetch('/api/courses/1').then(r => r.json());
// gRPC: needs a gRPC-Web proxy in front
```

### 2. Public APIs

- Universal tooling (curl, Postman, any HTTP client)
- HTTP caching, CDNs, API gateways
- No client code generation required

### 3. Loose Coupling and Evolution

REST with optional OpenAPI tolerates "rough" clients; gRPC forces a contract update + regen for every schema change.

## The Contract Trade

```proto
// gRPC: the .proto IS the API — generated, versioned, compiled
message Course {
  int64 id = 1;
  string title = 2;
}
```

```yaml
# REST: the OpenAPI spec describes the API — often drifts from the code
openapi: 3.0.0
paths:
  /courses/{id}:
    get:
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Course'
```

gRPC's contract is enforced by the compiler; REST's contract is enforced by discipline.

## The Practical Reality: Most Systems Use Both

```
Public API (browsers, partners)  ──▶ REST / JSON
Internal services                 ──▶ gRPC (or REST — team preference)
Events / streaming                ──▶ gRPC streaming or Kafka
```

A typical architecture:

```
Browser ──▶ API Gateway (REST) ──▶ Service A ──gRPC──▶ Service B
                                        │
                                        └──gRPC/stream──▶ Service C
```

The gateway translates REST → gRPC at the edge; services talk gRPC internally.

## The Decision Framework

```
Client is a browser or mobile app?
├─ Yes → REST (or GraphQL)
├─ No  → is it polyglot backend-to-backend?
│        ├─ Yes → gRPC (typed, fast, streaming)
│        └─ No  → is it a simple CRUD service?
│                 ├─ Yes → REST is simpler
│                 └─ No  → complex contract + streaming? → gRPC
```

| Situation | Choice |
|-----------|--------|
| Public API | REST |
| Browser/mobile | REST (or GraphQL) |
| Internal polyglot services | gRPC |
| Streaming/bidi | gRPC |
| Simple CRUD | REST (less ceremony) |
| Mixed | Gateway REST → internal gRPC |

## Migration Path

Moving REST → gRPC isn't all-or-nothing:

1. Define the .proto for the internal contract
2. Run gRPC *alongside* REST on the same service
3. Point internal callers at gRPC; keep REST for external
4. Deprecate internal REST routes when callers migrate

Both can coexist on one Spring Boot app (Tomcat on 8080, gRPC on 9090).

## Summary

| | Choose gRPC | Choose REST |
|--|-------------|-------------|
| Payload | Binary, compact, typed | JSON, human-readable |
| Clients | Internal services | Browsers, mobile, partners |
| Streaming | Native | SSE/WebSocket bolted on |
| Contract | Compiler-enforced .proto | OpenAPI by discipline |
| Versioning | Additive field numbers | URL/header strategies |
| Best for | Service meshes, streaming, polyglot | Public APIs, quick iteration |

There's no universal winner — there's a per-boundary choice. REST stays for the edges (browsers, partners); gRPC shines inside the mesh (typed, fast, streaming, polyglot). Most mature systems end up with a REST gateway in front of gRPC services — the strengths of both, the weaknesses of neither.
