---
title: Hexagonal Architecture (Ports & Adapters)
module: ddd-architecture
order: 3
minutes: 25
topics: ["hexagonal", "ports", "adapters", "domain isolation", "dependency rule", "Spring wiring"]
summary: Hexagonal architecture (also called Ports & Adapters) puts the domain at the center, surrounded by ports (interfaces) and adapters (implementations...
docs:
  - title: "Hexagonal architecture"
    url: "https://alistair.cockburn.us/hexagonal-architecture/"
---

# Hexagonal Architecture (Ports & Adapters)

Hexagonal architecture (also called Ports & Adapters) puts the **domain at the center**, surrounded by *ports* (interfaces) and *adapters* (implementations). The database, the HTTP layer, the message broker — all become swappable adapters. The domain doesn't know any of them exist.

## The Shape

```
      ┌────────────────────────────┐
      │          ADAPTERS          │
      │  REST controller           │
      │  gRPC service              │
      │  CLI / scheduled job       │
      └───────┬─────────┬──────────┘
              │  inbound │  ports
      ┌───────▼─────────▼──────────┐
      │          DOMAIN            │
      │   entities / use cases     │
      └───────┬─────────┬──────────┘
              │ outbound │ ports
      ┌───────▼─────────▼──────────┐
      │          ADAPTERS          │
      │  JPA repository            │
      │  Kafka publisher           │
      │  REST client               │
      └────────────────────────────┘
```

- **Inbound adapters** (controllers) call **inbound ports** (use-case interfaces)
- **Domain** calls **outbound ports** (repository/publisher interfaces)
- **Outbound adapters** (JPA, Kafka) implement the outbound ports

## The Dependency Rule

```
Dependencies point INWARD only:

Controller ──▶ UseCase (port) ◀── implemented by domain service
Domain ──▶ RepositoryPort (port) ◀── implemented by JPA adapter
```

**The domain never depends on Spring, JPA, HTTP, or Kafka.** Those are all adapters outside the hexagon.

## The Ports

### Inbound Port: The Use Case

```java
// Inbound port — what the application can DO
public interface PlaceOrderUseCase {
    OrderId placeOrder(PlaceOrderCommand command);
}

public record PlaceOrderCommand(Long customerId, List<OrderLineCommand> lines) {}
public record OrderLineCommand(String productCode, int quantity) {}
```

### Outbound Port: The Repository

```java
// Outbound port — what the domain NEEDS from the outside
public interface OrderRepositoryPort {
    Order findById(OrderId id);
    OrderId save(Order order);
    List<Order> findPlacedAfter(Instant since);
}

public interface PaymentGatewayPort {
    PaymentResult charge(Money amount, PaymentMethod method);
}
```

## The Domain (no Spring imports!)

```java
// Pure domain — no annotations, no Spring, no JPA
public class Order {
    private final OrderId id;
    private OrderStatus status;
    private final List<OrderLine> lines = new ArrayList<>();

    public Order(OrderId id) {
        this.id = id;
        this.status = OrderStatus.DRAFT;
    }

    public void addLine(Product product, int quantity) {
        if (status != OrderStatus.DRAFT) {
            throw new IllegalStateException("Cannot modify a placed order");
        }
        lines.add(new OrderLine(product, quantity));
    }

    public void confirm() {
        if (lines.isEmpty()) throw new IllegalStateException("Empty order");
        this.status = OrderStatus.PLACED;
    }

    public OrderId id() { return id; }
    public OrderStatus status() { return status; }
    public List<OrderLine> lines() { return List.copyOf(lines); }
}
```

**Test this with plain JUnit — no Spring context, no database.** This is the payoff of hexagonal: the core logic is unit-testable in milliseconds.

## The Domain Service (Use Case Implementation)

```java
// Inbound port implementation — still pure domain logic
public class PlaceOrderService implements PlaceOrderUseCase {

    private final OrderRepositoryPort orders;
    private final ProductRepositoryPort products;
    private final PaymentGatewayPort payments;

    public PlaceOrderService(OrderRepositoryPort orders,
                             ProductRepositoryPort products,
                             PaymentGatewayPort payments) {
        this.orders = orders;
        this.products = products;
        this.payments = payments;
    }

    @Override
    public OrderId placeOrder(PlaceOrderCommand command) {
        Order order = new Order(OrderId.generate());
        for (OrderLineCommand line : command.lines()) {
            Product product = products.findByCode(line.productCode());
            order.addLine(product, line.quantity());
        }
        order.confirm();
        return orders.save(order);
    }
}
```

No annotations — the service is a plain class taking ports as constructor args. Spring just wires it.

## The Adapters

### Outbound: JPA Repository Adapter

```java
// JPA-specific — OUTSIDE the hexagon
@Repository
public class JpaOrderRepositoryAdapter implements OrderRepositoryPort {

    private final JpaOrderRepository jpa;      // Spring Data interface
    private final OrderMapper mapper;

    @Override
    public Order findById(OrderId id) {
        return jpa.findById(id.value())
            .map(mapper::toDomain)
            .orElseThrow(() -> new OrderNotFoundException(id));
    }

    @Override
    public OrderId save(Order order) {
        return OrderId.of(jpa.save(mapper.toEntity(order)).getId());
    }
}
```

### Inbound: REST Controller Adapter

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {        // inbound adapter

    private final PlaceOrderUseCase placeOrder;   // depends on the PORT

    @PostMapping
    public ResponseEntity<OrderResponse> placeOrder(@Valid @RequestBody OrderRequest request) {
        OrderId id = placeOrder.placeOrder(request.toCommand());
        return ResponseEntity.created(URI.create("/api/orders/" + id.value()))
            .build();
    }
}
```

The controller knows the use-case *interface* — never the service class, never the repository.

## Spring Wiring

```java
@Configuration
public class OrderConfig {

    @Bean
    public PlaceOrderUseCase placeOrderUseCase(OrderRepositoryPort orders,
                                               ProductRepositoryPort products,
                                               PaymentGatewayPort payments) {
        return new PlaceOrderService(orders, products, payments);
    }

    @Bean
    public OrderRepositoryPort orderRepositoryPort(JpaOrderRepository jpa) {
        return new JpaOrderRepositoryAdapter(jpa);
    }
}
```

Or use `@Service`/`@Repository` on the adapters and services — Spring's annotations are an implementation detail of the wiring, not the architecture.

## The Benefits in Practice

| Benefit | How |
|---------|-----|
| Testability | Domain tests with fake ports — no Spring |
| Swappability | Swap JPA → MyBatis, Kafka → RabbitMQ by changing an adapter |
| Framework freedom | Domain has zero Spring imports |
| Clarity | The ports document the application's contract |
| Parallel work | Frontend, domain, persistence evolve independently |

## The Package Layout

```
com.acme.orders
├── domain            # entities, VOs, use-case ports, domain services
│   ├── model/        # Order, OrderLine, Money, OrderId
│   └── port/         # PlaceOrderUseCase, OrderRepositoryPort
├── application       # use-case implementations (PlaceOrderService)
├── adapter
│   ├── in/web/       # OrderController, DTOs
│   └── out/persistence/   # JpaOrderRepositoryAdapter, entities, mappers
│   └── out/messaging/     # KafkaPublisherAdapter
└── config/           # bean wiring
```

## Testing With Fake Ports

```java
class PlaceOrderServiceTest {

    // Fake ports — no Spring, no DB, milliseconds
    private final OrderRepositoryPort orders = new InMemoryOrderRepository();
    private final ProductRepositoryPort products = new InMemoryProductRepository();
    private final PaymentGatewayPort payments = new FakePaymentGateway();

    private final PlaceOrderService service =
        new PlaceOrderService(orders, products, payments);

    @Test
    void placesOrderAndConfirmsIt() {
        OrderId id = service.placeOrder(
            new PlaceOrderCommand(1L, List.of(new OrderLineCommand("P1", 2))));

        Order order = orders.findById(id);
        assertEquals(OrderStatus.PLACED, order.status());
    }
}
```

## Summary

| Element | Role |
|---------|------|
| Domain | Entities + use cases — no framework |
| Inbound ports | Use-case interfaces the outside calls |
| Outbound ports | What the domain needs (repository, gateway) |
| Inbound adapters | REST/gRPC/CLI → ports |
| Outbound adapters | JPA/Kafka/REST → ports |
| Wiring | Spring assembles the hexagon |

Hexagonal architecture is the discipline of *depending on abstractions you own*: the domain defines its ports, adapters implement them, and nothing leaks across. The payoff is a domain you can test without Spring and swap without rewrites — the architecture that makes DDD actually sustainable.
