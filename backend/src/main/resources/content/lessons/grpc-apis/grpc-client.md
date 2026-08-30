---
title: gRPC Clients, Streaming and Deadlines
module: grpc-apis
order: 3
minutes: 25
topics: ["blocking stub", "async stub", "client streaming", "bidi streaming", "deadlines", "retry", "channel management"]
docs:
  - title: "gRPC client concepts"
    url: "https://grpc.io/docs/guides/concepts/"
summary: The client side of gRPC comes in three stubs — blocking, async, and streaming — generated from the same .proto. This lesson covers all three, plus ...
---

# gRPC Clients, Streaming and Deadlines

The client side of gRPC comes in three stubs — blocking, async, and streaming — generated from the same .proto. This lesson covers all three, plus the two production essentials: deadlines and channel reuse.

## The Three Stubs

```proto
service CourseService {
  rpc GetCourse(CourseRequest) returns (CourseReply);
  rpc ListCourses(ListCoursesRequest) returns (stream CourseReply);
  rpc UploadLessons(stream LessonUpload) returns (UploadReply);
  rpc Chat(stream ChatMessage) returns (stream ChatMessage);
}
```

protoc generates:

| Stub | Style | Use |
|------|-------|-----|
| `newBlockingStub` | Synchronous, blocking | Simple calls |
| `newStub` (async) | Callbacks | Non-blocking |
| `newFutureStub` | ListenableFuture | Future composition |

## Blocking Stub (the common case)

```java
ManagedChannel channel = ManagedChannelBuilder
    .forAddress("course-service", 9090)
    .usePlaintext()                          // dev only — TLS in prod
    .build();

CourseServiceGrpc.CourseServiceBlockingStub stub =
    CourseServiceGrpc.newBlockingStub(channel);

CourseReply reply = stub.getCourse(CourseRequest.newBuilder().setId(1L).build());
```

## Deadlines: The Client's Responsibility

**Always set a deadline** — a gRPC call without one can hang forever:

```java
// Per-call deadline
CourseReply reply = stub
    .withDeadline(Deadline.after(3, TimeUnit.SECONDS))
    .getCourse(request);

// Channel-level default
ManagedChannel channel = ManagedChannelBuilder.forAddress(host, port)
    .keepAliveTime(30, TimeUnit.SECONDS)
    .build();
```

Catch the timeout:

```java
try {
    return stub.withDeadline(Deadline.after(2, TimeUnit.SECONDS))
        .getCourse(request);
} catch (StatusRuntimeException e) {
    if (e.getStatus().getCode() == Status.Code.DEADLINE_EXCEEDED) {
        return fallbackCourse();
    }
    throw translate(e);
}
```

## Channel Reuse: The Golden Rule

**Channels are expensive; stubs are cheap.** Create one channel per service per process — never per call:

```java
@Configuration
public class GrpcClientConfig {

    @Bean(destroyMethod = "shutdown")
    public ManagedChannel courseChannel() {
        return ManagedChannelBuilder
            .forAddress(host, port)
            .useTransportSecurity()          // TLS
            .keepAliveTime(30, TimeUnit.SECONDS)
            .maxInboundMessageSize(4 * 1024 * 1024)
            .build();
    }

    @Bean
    public CourseServiceGrpc.CourseServiceBlockingStub courseStub(ManagedChannel channel) {
        return CourseServiceGrpc.newBlockingStub(channel);
    }
}
```

A channel multiplexes many RPCs over one HTTP/2 connection — creating one per request destroys that.

## Server Streaming Client

```java
Iterator<CourseReply> replies = stub.listCourses(
    ListCoursesRequest.newBuilder().setLimit(100).build());

while (replies.hasNext()) {
    CourseReply course = replies.next();   // arrives as produced
    process(course);
}
```

## Client Streaming

```java
StreamObserver<LessonUpload> uploader = asyncStub.uploadLessons(
    new StreamObserver<UploadReply>() {
        @Override
        public void onNext(UploadReply reply) { log.info("Uploaded: {}", reply.getCount()); }
        @Override
        public void onError(Throwable t) { log.error("Upload failed", t); }
        @Override
        public void onCompleted() { log.info("Upload done"); }
    });

for (Lesson lesson : lessons) {
    uploader.onNext(LessonUpload.newBuilder().setLesson(toProto(lesson)).build());
}
uploader.onCompleted();    // half-close: signal done sending
```

## Bidirectional Streaming

```java
StreamObserver<ChatMessage> requestObserver = asyncStub.chat(
    new StreamObserver<ChatMessage>() {
        @Override
        public void onNext(ChatMessage reply) {
            log.info("Tutor: {}", reply.getText());     // replies arrive as streamed
        }
        @Override
        public void onError(Throwable t) { ... }
        @Override
        public void onCompleted() { ... }
    });

requestObserver.onNext(ChatMessage.newBuilder().setText("Explain AOP").build());
// keep the requestObserver open — send more messages, receive replies
```

## Retry Configuration

```java
// Per-call retry with the API (gRPC 1.46+)
stub = stub.withWaitForReady();   // retry on UNAVAILABLE

// Or channel-level retry policy via a service config
ManagedChannel channel = ManagedChannelBuilder.forAddress(host, port)
    .defaultServiceConfig(Map.of(
        "methodConfig", List.of(Map.of(
            "name", List.of(Map.of()),
            "retryPolicy", Map.of(
                "maxAttempts", 3.0,
                "initialBackoff", "0.1s",
                "maxBackoff", "1s",
                "backoffMultiplier", 2.0,
                "retryableStatusCodes", List.of("UNAVAILABLE"))))))
    .enableRetry()
    .build();
```

**Retry only idempotent calls** — a retried non-idempotent RPC (like a payment charge) must be guarded by an idempotency key, exactly like HTTP.

## Error Translation

```java
public Course getCourse(long id) {
    try {
        return toDomain(stub.getCourse(CourseRequest.newBuilder().setId(id).build()));
    } catch (StatusRuntimeException e) {
        throw switch (e.getStatus().getCode()) {
            case NOT_FOUND -> new CourseNotFoundException(id);
            case DEADLINE_EXCEEDED -> new UpstreamTimeoutException("course-service");
            case UNAVAILABLE -> new UpstreamUnavailableException("course-service");
            default -> new GrpcCallException(e.getStatus().getCode().name(), e);
        };
    }
}
```

Map gRPC Status codes to your domain exceptions — clients shouldn't see raw gRPC errors.

## Testing the Client

```java
class GrpcClientTest {

    private Server server;
    private ManagedChannel channel;

    @BeforeEach
    void setUp() throws IOException {
        server = InProcessServerBuilder.forName("test")
            .directExecutor()
            .addService(new CourseServiceGrpc.CourseServiceImplBase() {
                @Override
                public void getCourse(CourseRequest request, StreamObserver<CourseReply> o) {
                    o.onNext(CourseReply.newBuilder().setTitle("Mocked").build());
                    o.onCompleted();
                }
            })
            .build().start();

        channel = InProcessChannelBuilder.forName("test").directExecutor().build();
    }

    @Test
    void clientReceivesReply() {
        CourseServiceGrpc.CourseServiceBlockingStub stub =
            CourseServiceGrpc.newBlockingStub(channel);
        CourseReply reply = stub.getCourse(CourseRequest.newBuilder().setId(1L).build());
        assertEquals("Mocked", reply.getTitle());
    }
}
```

## Summary

| Concern | gRPC client answer |
|---------|--------------------|
| Sync calls | Blocking stub |
| Async / callbacks | Async stub (`newStub`) |
| Futures | Future stub |
| Server streaming | `Iterator<Reply>` |
| Client streaming | `StreamObserver` half-close |
| Bidi streaming | Two observers |
| Timeout | `withDeadline` — always |
| Efficiency | One channel per service, reuse stubs |
| Retry | `withWaitForReady` / retry policy (idempotent only) |

gRPC clients are typed end to end: stubs generated from the contract, streaming via observers, deadlines as a first-class concept. Master the stub selection, reuse channels, set deadlines, and translate Status codes — and your services speak gRPC fluently.
