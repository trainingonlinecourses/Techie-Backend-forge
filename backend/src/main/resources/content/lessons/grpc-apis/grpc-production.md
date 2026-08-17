---
title: gRPC in Production
module: grpc-apis
order: 5
minutes: 22
topics: ["TLS", "load balancing", "gRPC-Web", "observability", "health checks", "reflection"]
docs:
  - title: "gRPC production best practices"
    url: "https://grpc.io/docs/guides/performance/"
---

# gRPC in Production

The .proto is done and the calls work locally. Production gRPC adds five concerns: TLS, load balancing (HTTP/2 changes everything), browser access (gRPC-Web), observability, and health checking. This lesson covers each with the standard solutions.

## TLS: Never Plaintext in Production

```java
// Server
@Bean
public GrpcServerConfigurer serverConfigurer() {
    return builder -> builder
        .useTransportSecurity(certChain, privateKey)   // PEM files
        .intercept(tracingInterceptor);
}

// Client
ManagedChannel channel = ManagedChannelBuilder
    .forAddress(host, 443)
    .useTransportSecurity()                            // TLS by default
    .build();
```

Or via properties:

```yaml
grpc:
  server:
    security:
      enabled: true
      certificate-chain: classpath:cert.pem
      private-key: classpath:key.pem
```

## Load Balancing: The HTTP/2 Problem

HTTP/2 multiplexes many streams over one connection. Classic round-robin load balancers balance *connections*, not *requests* — with a few long-lived gRPC connections, traffic skews to whichever backend got the connection.

### The Solutions

| Approach | How |
|----------|-----|
| **Client-side LB** | Client does the balancing: pick, round_robin, or xds policies |
| **L4 proxy with client-side** | Nginx/Envoy balances *connections*, gRPC client balances *streams* |
| **xDS** | Envoy/control-plane-driven — the modern service-mesh answer |
| **DNS** | Client resolves DNS and round-robins (works for simple cases) |

```java
// Client-side round robin over multiple addresses
NameResolverRegistry.getDefaultRegistry().register(
    new StaticNameResolverProvider(List.of(
        new EquivalentAddressGroup(new SocketAddress[]{inet("10.0.0.1", 9090)}),
        new EquivalentAddressGroup(new SocketAddress[]{inet("10.0.0.2", 9090)}))));

ManagedChannel channel = ManagedChannelBuilder
    .forTarget("static:///backends")
    .defaultLoadBalancingPolicy("round_robin")
    .build();
```

**The rule**: with HTTP/2 + gRPC, load balancing moves to the client or to a proxy like Envoy — plain TCP round-robin won't spread load correctly.

## gRPC-Web: Browsers Can't Speak HTTP/2 gRPC

Browsers can't set gRPC trailers. **gRPC-Web** is a proxy-translated variant:

```
Browser ──HTTP/1.1 gRPC-Web──▶ gRPC-Web proxy (Envoy) ──HTTP/2 gRPC──▶ Server
```

```yaml
# Envoy listener for gRPC-Web
http_filters:
  - name: envoy.filters.http.grpc_web
    typed_config:
      "@type": type.googleapis.com/envoy.extensions.filters.http.grpc_web.v3.GrpcWeb
  - name: envoy.filters.http.router
```

Client side — use the `@grpc/grpc-js` with `grpc-web` mode or the `grpc-web` JS library against the proxy URL.

## Observability

### Metrics

```yaml
grpc:
  client:
    interceptors: [com.acme.GrpcMetricsInterceptor]
```

```java
@Component
public class GrpcMetricsInterceptor implements ClientInterceptor {

    private final MeterRegistry registry;

    @Override
    public <ReqT, RespT> ClientCall<ReqT, RespT> interceptCall(
            MethodDescriptor<ReqT, RespT> method, CallOptions callOptions, Channel next) {

        return new ForwardingClientCall.SimpleForwardingClientCall<>(
                next.newCall(method, callOptions)) {

            private final Timer.Sample sample =
                Timer.start(registry);

            @Override
            public void onClose(Status status, Metadata trailers) {
                sample.stop(Timer.builder("grpc.client.latency")
                    .tag("service", method.getServiceName())
                    .tag("method", method.getBareMethodName())
                    .tag("status", status.getCode().name())
                    .register(registry));
                super.onClose(status, trailers);
            }
        };
    }
}
```

### Tracing

Micrometer Tracing instruments gRPC automatically (with `micrometer-tracing-bridge-brave` + gRPC dependencies) — spans propagate via `grpc-trace-bin` metadata across service boundaries.

### Logging

```yaml
logging:
  level:
    io.grpc: INFO          # connection lifecycle
    com.acme.grpc: DEBUG   # your calls
```

## Health Checking

gRPC has a standard health service (`grpc.health.v1.Health`) — Kubernetes probes can use it:

```java
// Server: register the health service
@Bean
public GrpcServerConfigurer healthConfigurer() {
    return builder -> builder.addService(healthStatusManager.getHealthService());
}

// Update status per dependency
healthStatusManager.setStatus("", HealthCheckResponse.ServingStatus.SERVING);
healthStatusManager.setStatus("course-db", HealthCheckResponse.ServingStatus.NOT_SERVING);
```

```yaml
# Kubernetes probe via grpc_health_probe
livenessProbe:
  exec:
    command: ["/bin/grpc_health_probe", "-addr=:9090"]
readinessProbe:
  exec:
    command: ["/bin/grpc_health_probe", "-addr=:9090"]
```

## Reflection: Discovery for Tools

gRPC reflection lets tools (grpcurl, Postman) discover services without the .proto:

```java
@Bean
public GrpcServerConfigurer reflectionConfigurer() {
    return builder -> builder.addService(
        ServerReflectionUtil.createProtoReflectionService());
}
```

```bash
grpcurl -plaintext localhost:9090 list
grpcurl -plaintext localhost:9090 describe academy.v1.CourseService
grpcurl -plaintext -d '{"id": 1}' localhost:9090 academy.v1.CourseService/GetCourse
```

## The Production Checklist

- ✅ TLS everywhere (server + client)
- ✅ Client-side load balancing (round_robin or xDS) — never raw TCP LB
- ✅ Deadlines on every call
- ✅ Channel reuse (one per service per process)
- ✅ gRPC-Web proxy for browser clients
- ✅ Metrics + tracing interceptors
- ✅ Health service wired to probes
- ✅ Reflection in dev/staging, disabled in prod if undesired
- ✅ Max message size bounded
- ✅ Retry policies only on idempotent calls

## Summary

| Concern | Production answer |
|---------|-------------------|
| Security | TLS via `useTransportSecurity` |
| Scale | Client-side LB / Envoy xDS |
| Browsers | gRPC-Web proxy |
| Metrics | Interceptors + Micrometer |
| Tracing | Micrometer Tracing (grpc-trace-bin) |
| Health | grpc.health.v1 + grpc_health_probe |
| Discovery | Reflection + grpcurl |

gRPC is production-ready out of the box — but only with the hardening layer: TLS, real load balancing (the HTTP/2 trap), deadlines, observability interceptors, and the health service. Add these and gRPC becomes your fastest, most reliable service-to-service protocol.
