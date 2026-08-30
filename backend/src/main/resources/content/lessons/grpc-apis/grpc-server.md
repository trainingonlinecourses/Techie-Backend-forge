---
title: Building a gRPC Server
module: grpc-apis
order: 2
minutes: 25
topics: ["gRPC", "service definitions", "Unary RPC", "server implementation", "Spring gRPC", "deadlines"]
summary: gRPC is RPC over HTTP/2 with protobuf payloads: typed method calls, streaming in both directions, deadlines, and firstclass error codes. This lesso...
docs:
  - title: "gRPC concepts"
    url: "https://grpc.io/docs/what-is-grpc/concepts/"
---

# Building a gRPC Server

gRPC is RPC over HTTP/2 with protobuf payloads: typed method calls, streaming in both directions, deadlines, and first-class error codes. This lesson builds a server from `.proto` to a working Spring Boot endpoint.

## The Service Definition

```proto
syntax = "proto3";

package academy.v1;

option java_package = "com.academy.proto";
option java_multiple_files = true;

message CourseRequest {
  int64 id = 1;
}

message CourseReply {
  int64 id = 1;
  string title = 2;
  string level = 3;
  int32 minutes = 4;
}

message ListCoursesRequest {
  int32 limit = 1;
}

message ListCoursesReply {
  repeated CourseReply courses = 1;
}

service CourseService {
  rpc GetCourse(CourseRequest) returns (CourseReply);
  rpc ListCourses(ListCoursesRequest) returns (ListCoursesReply);
}
```

protoc generates `CourseServiceGrpc` — the abstract server base class and the client stub.

## The Four RPC Types

| Type | Pattern |
|------|---------|
| **Unary** | `rpc Get(CourseRequest) returns (CourseReply)` |
| **Server streaming** | `rpc List(ListRequest) returns (stream CourseReply)` |
| **Client streaming** | `rpc Upload(stream Chunk) returns (UploadReply)` |
| **Bidirectional streaming** | `rpc Chat(stream Msg) returns (stream Msg)` |

## Implementing the Server (Spring gRPC)

```xml
<dependency>
    <groupId>net.devh</groupId>
    <artifactId>grpc-server-spring-boot-starter</artifactId>
    <version>3.1.0.RELEASE</version>
</dependency>
```

```java
@GrpcService
public class CourseGrpcService extends CourseServiceGrpc.CourseServiceImplBase {

    private final CourseRepository repository;

    @Override
    public void getCourse(CourseRequest request,
                          StreamObserver<CourseReply> responseObserver) {
        Course course = repository.findById(request.getId())
            .orElseThrow(() -> Status.NOT_FOUND
                .withDescription("Course " + request.getId() + " not found")
                .asRuntimeException());

        responseObserver.onNext(toReply(course));
        responseObserver.onCompleted();
    }

    private CourseReply toReply(Course c) {
        return CourseReply.newBuilder()
            .setId(c.getId()).setTitle(c.getTitle())
            .setLevel(c.getLevel()).setMinutes(c.getMinutes())
            .build();
    }
}
```

The `StreamObserver` protocol: `onNext(value)` (0 or more), `onError(Throwable)`, `onCompleted()`. Unary = exactly one `onNext` then `onCompleted`.

## Error Codes: gRPC's Status

gRPC has 17 standardized error codes — the equivalent of HTTP status but typed:

| Code | Meaning | HTTP analog |
|------|---------|-------------|
| OK | Success | 200 |
| NOT_FOUND | Resource absent | 404 |
| INVALID_ARGUMENT | Bad request | 400 |
| ALREADY_EXISTS | Duplicate | 409 |
| PERMISSION_DENIED | Forbidden | 403 |
| UNAUTHENTICATED | No/invalid creds | 401 |
| DEADLINE_EXCEEDED | Timed out | 504 |
| INTERNAL | Server error | 500 |
| UNAVAILABLE | Service down | 503 |

```java
throw Status.INVALID_ARGUMENT
    .withDescription("minutes must be positive")
    .withCause(e)
    .asRuntimeException();

// With metadata
Metadata trailers = new Metadata();
trailers.put(Key.of("trace-id", Metadata.ASCII_STRING_MARSHALLER), traceId);
throw Status.INTERNAL.asRuntimeException(trailers);
```

## Server Streaming

```java
@Override
public void listCourses(ListCoursesRequest request,
                        StreamObserver<CourseReply> responseObserver) {
    repository.findAll().limit(request.getLimit()).forEach(course -> {
        responseObserver.onNext(toReply(course));   // stream each one
    });
    responseObserver.onCompleted();
}
```

The client receives courses as they're produced — no full payload buffered.

## Deadlines on the Server

A server can (and should) check whether the client is still waiting:

```java
@Override
public void getCourse(CourseRequest request, StreamObserver<CourseReply> observer) {
    if (Context.current().isCancelled()) {        // client gave up
        observer.onError(Status.CANCELLED.asRuntimeException());
        return;
    }
    // ... heavy work, periodically check Context.current().isCancelled()
}
```

## Interceptors: Server-Side

```java
@Component
public class GrpcServerInterceptor implements ServerInterceptor {

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call, Metadata headers,
            ServerCallHandler<ReqT, RespT> next) {

        String traceId = headers.get(Key.of("trace-id", Metadata.ASCII_STRING_MARSHALLER));
        MDC.put("traceId", traceId != null ? traceId : "unknown");

        return Contexts.interceptCall(Context.current(), call, headers, next);
    }
}
```

Configured via `GrpcServerConfigurer`:

```java
@Bean
public GrpcServerConfigurer serverConfigurer() {
    return builder -> builder.intercept(grpcServerInterceptor);
}
```

## Configuring the Server

```yaml
grpc:
  server:
    port: 9090
    max-inbound-message-size: 4MB
    shutdown-grace-period: 30s
```

The gRPC server runs on its own port (default 9090) alongside Tomcat — HTTP for browsers, gRPC for services.

## Testing the Server

```java
@SpringBootTest
class GrpcServerTest {

    @Test
    void unaryGetCourseWorks() throws Exception {
        // Use the in-process channel — no real port
        Server server = InProcessServerBuilder.forName("test")
            .directExecutor()
            .addService(new CourseGrpcService(repository))
            .build().start();

        ManagedChannel channel = InProcessChannelBuilder.forName("test")
            .directExecutor().build();

        CourseServiceGrpc.CourseServiceBlockingStub stub =
            CourseServiceGrpc.newBlockingStub(channel);

        CourseReply reply = stub.getCourse(
            CourseRequest.newBuilder().setId(1L).build());

        assertEquals("Spring Boot", reply.getTitle());
        server.shutdownNow();
    }
}
```

## Summary

| Concern | gRPC answer |
|---------|-------------|
| Contract | .proto service + protoc-generated stubs |
| Transport | HTTP/2, binary protobuf |
| RPC types | Unary, server/client/bidi streaming |
| Errors | Status codes + metadata trailers |
| Server impl | `@GrpcService` extending the generated base |
| Deadlines | Context cancellation checks |
| Interceptors | ServerInterceptor for cross-cutting |

gRPC servers are typed and contract-first: the .proto is the API, the generated base class is the implementation skeleton, and Status codes give clients a precise error vocabulary. The next lesson covers the client side, streaming, and production hardening.
