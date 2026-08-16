# Spring Cloud Demo — 5 Services, End to End

A runnable microservices stack demonstrating the whole Spring Cloud module:

| Service | Port | Job |
|---|---|---|
| `eureka-server` | 8761 | Service registry (dashboard: http://localhost:8761) |
| `config-server` | 8888 | Centralized config (`config-server/src/main/resources/config/`) |
| `order-service` | 9001 | Business service: config client, Eureka client, resilient Feign call |
| `inventory-service` | 9002 | Downstream service with simulated latency/failures |
| `api-gateway` | 9090 | Single entry point: routes, circuit breaker, trace-id logging |

## Build everything (one command)

```bash
cd projects/spring-cloud-demo && mvn package
```

The aggregator `pom.xml` at the root builds all five services.

## Run it (5 terminals, in order)

```bash
cd projects/spring-cloud-demo

# 1. Registry
cd eureka-server && mvn spring-boot:run        # :8761

# 2. Config server
cd ../config-server && mvn spring-boot:run     # :8888

# 3. Inventory (config comes FROM the config server)
cd ../inventory-service && mvn spring-boot:run # :9002

# 4. Order
cd ../order-service && mvn spring-boot:run     # :9001

# 5. Gateway
cd ../api-gateway && mvn spring-boot:run       # :9090
```

## Try it

```bash
# Happy path — gateway → order → inventory, one trace id through all three
curl localhost:9090/api/orders/1/stock
# → {"orderId":1,"sku":"SKU-1001","stock":42,"status":"OK","app":"order-service"}

# Slow dependency — 3s delay > 2s time limiter → retries → fallback "UNAVAILABLE"
curl "localhost:9090/api/orders/1/stock?delayMs=3000"

# Failing dependency — open the circuit breaker, then watch the fallback kick in
for i in $(seq 1 12); do curl -s "localhost:9090/api/orders/1/stock?fail=true"; echo; done
# eventually: {"sku":"SKU-1001","stock":0,"status":"UNAVAILABLE",...}  (circuit OPEN, no calls)
```

Check the state: `curl localhost:9001/actuator/health` shows the circuit breaker, and
`curl localhost:8761` shows all three services registered.

## Distributed tracing

```bash
docker run -d -p 9411:9411 openzipkin/zipkin
curl localhost:9090/api/orders/1/stock
# open http://localhost:9411 → search "order-service" → waterfall: gateway → order → inventory
```

Every service sends spans to Zipkin with `management.zipkin.tracing.endpoint` and the gateway logs
the trace id for every request (`X-Trace-Id` response header).

## Config server

```bash
# The config is served centrally — change a value in
# config-server/src/main/resources/config/order-service.yml and restart config-server.
curl localhost:8888/order-service/default     # see what order-service fetches
curl -X POST localhost:9001/actuator/refresh  # re-pull without restart (with @RefreshScope)
```

## Ports at a glance

```
client ─▶ api-gateway :9090 ──lb://ORDER-SERVICE──▶ order-service :9001
                                └─Feign + breaker──▶ inventory-service :9002
     eureka :8761 ◀── register/heartbeat ◀── all services
     config :8888 ◀── config at startup ◀── order + inventory
     zipkin :9411 ◀── spans ◀── gateway + order + inventory
```
