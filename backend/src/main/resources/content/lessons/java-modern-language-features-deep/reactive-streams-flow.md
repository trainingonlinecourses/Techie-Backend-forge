---
title: Reactive Streams in the JDK — java.util.concurrent.Flow
summary: Java 9 introduced java.util.concurrent.Flow, a standard API for reactive streams — asynchronous streams of data with backpressure. The JDK includes the interfaces (Publisher, Subscriber, Subscription, Processor) and a base implementation (SubmissionPublisher). This lesson explains the reactive streams model, the four interfaces, how backpressure works through the Subscription, and how to use SubmissionPublisher to build a simple reactive pipeline.
order: 5
minutes: 24
topics: [reactive-streams, flow, publisher, subscriber, subscription, processor, backpressure, submission-publisher, java9, asynchronous, non-blocking]
docs:
  - https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/Flow.html
  - https://www.reactive-streams.org/
---

## The Concept, From Zero

Reactive programming is a style where you work with streams of data that arrive over time, and you define how to react to each piece of data as it arrives — rather than pulling data from a collection when you are ready. The reactive streams model is a standard for asynchronous streams with **backpressure** — a way for the consumer to tell the producer how much data it can handle, so a fast producer does not overwhelm a slow consumer.

Java 9 added `java.util.concurrent.Flow` as the standard API for reactive streams. It is not a full reactive programming library like Project Reactor or RxJava — it is the base-level standard that those libraries build on, and it gives the JDK a common language for asynchronous streams.

The reactive streams model has four interfaces:

- **Publisher** — produces items and calls the subscriber's `onNext`, `onError`, and `onComplete` methods. A publisher can serve many subscribers, and each subscriber gets its own `Subscription`.
- **Subscriber** — consumes items from a publisher. It has methods: `onSubscribe(subscription)`, `onNext(item)`, `onError(exception)`, `onComplete()`. The subscriber must request items via the subscription — this is the backpressure mechanism.
- **Subscription** — the link between a publisher and a subscriber. The subscriber calls `request(n)` to ask for `n` more items, and calls `cancel()` to stop receiving items.
- **Processor** — a component that is both a subscriber and a publisher. It receives items from an upstream publisher, transforms or filters them, and publishes them to a downstream subscriber.

The key idea is **backpressure**. The subscriber does not passively receive items as fast as the publisher produces them. Instead, the subscriber starts by receiving a `Subscription` in `onSubscribe`, and then explicitly requests items by calling `subscription.request(n)`. The publisher is supposed to send at most `n` items after each `request(n)`. This is the backpressure — the subscriber controls the pace.

Without backpressure, a fast publisher can flood a slow subscriber, and the subscriber would need unbounded buffers or risk being overwhelmed. With backpressure, the subscriber says "I can handle N more items right now," and the publisher respects that.

### The Flow Interfaces in Detail

#### Publisher

A `Publisher<T>` is something that produces items of type `T` for subscribers. Its main method is:

```java
void subscribe(Subscriber<? super T> subscriber);
```

When a subscriber calls `subscribe`, the publisher creates a `Subscription` for that subscriber and calls the subscriber's `onSubscribe(subscription)`. Then the publisher may start sending items via `onNext`, and eventually calls `onComplete` (if it finishes normally) or `onError` (if it fails).

A publisher can have multiple subscribers. Each subscriber gets its own subscription. The publisher is responsible for respecting backpressure for each subscriber independently.

#### Subscriber

A `Subscriber<T>` consumes items of type `T`. Its methods:

```java
void onSubscribe(Subscription subscription);
void onNext(T item);
void onError(Throwable throwable);
void onComplete();
```

- **`onSubscribe`** — called when the publisher is ready to send items. The subscriber receives the `Subscription` here and should store it so it can request items later.
- **`onNext`** — called for each item. The subscriber processes the item. If the subscriber has requested only N items, it should receive at most N `onNext` calls before it requests more.
- **`onError`** — called if the publisher fails. After this, no more `onNext` or `onComplete` calls are made.
- **`onComplete`** — called when the publisher has finished sending all items. After this, no more `onNext` calls are made.

A common mistake is to request all items at once (`subscription.request(Long.MAX_VALUE)`) and then process them as they come. This is effectively no backpressure — the subscriber is saying "send me everything," and the publisher sends everything as fast as it can. True backpressure means requesting only what you can handle at the moment.

#### Subscription

A `Subscription` represents the link between one publisher and one subscriber. Its methods:

```java
void request(long n);
void cancel();
```

- **`request(n)`** — the subscriber asks the publisher to send up to `n` more items (via `onNext`). The publisher should respect this and not send more than `n` items until the subscriber requests more.
- **`cancel()`** — the subscriber tells the publisher to stop sending items. After this, the publisher should not send more `onNext`, `onError`, or `onComplete` to this subscriber.

The `request` method is the backpressure mechanism. A subscriber that wants to control the pace requests a small number of items at a time. A subscriber that wants to receive everything requests a very large number (often `Long.MAX_VALUE`), which effectively disables backpressure for that subscriber.

#### Processor

A `Processor<T, R>` is both a `Subscriber<T>` and a `Publisher<R>`. It sits in the middle of a pipeline: it subscribes to an upstream publisher of `T`, transforms or filters the items, and publishes `R` items to a downstream subscriber.

```java
interface Processor<T, R> extends Subscriber<T>, Publisher<R> {
    // inherits subscribe(Subscriber<? super R>) from Publisher
    // inherits onSubscribe, onNext, onError, onComplete from Subscriber
}
```

A processor is a way to build a transformation stage in a reactive pipeline. For example, a processor might take `String` items, parse each one into an `Integer`, and publish `Integer` items downstream.

### Backpressure in Action

Here is a simple example of backpressure. A `SubmissionPublisher` (a concrete `Publisher` provided by the JDK) publishes items, and a subscriber requests them one at a time.

```java
import java.util.concurrent.Flow.*;
import java.util.concurrent.SubmissionPublisher;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

// A subscriber that requests items one at a time — backpressure in action
class OneAtATimeSubscriber implements Subscriber<String> {
    private Subscription subscription;
    private final String name;

    OneAtATimeSubscriber(String name) {
        this.name = name;
    }

    @Override
    public void onSubscribe(Subscription subscription) {
        this.subscription = subscription;
        // Start by requesting one item
        subscription.request(1);
    }

    @Override
    public void onNext(String item) {
        System.out.println(name + " received: " + item);
        // After processing one item, request the next one
        subscription.request(1);
    }

    @Override
    public void onError(Throwable t) {
        System.out.println(name + " error: " + t.getMessage());
    }

    @Override
    public void onComplete() {
        System.out.println(name + " complete");
    }
}

public class ReactiveDemo {
    public static void main(String[] args) {
        // A publisher that can publish strings
        try (SubmissionPublisher<String> publisher =
                     new SubmissionPublisher<>()) {

            publisher.subscribe(new OneAtATimeSubscriber("A"));
            publisher.subscribe(new OneAtATimeSubscriber("B"));

            // Publish some items
            for (int i = 1; i <= 5; i++) {
                publisher.submit("item-" + i);
            }
            publisher.close();   // signals onComplete to subscribers
        }
    }
}
```

Line by line:

- **`new SubmissionPublisher<>()`** — a concrete `Publisher` that allows you to `submit` items. It handles the mechanics of managing subscribers and their backpressure.
- **`publisher.subscribe(new OneAtATimeSubscriber("A"))`** — subscribes a subscriber. The publisher calls `onSubscribe` on the subscriber, passing a `Subscription`.
- **`subscription.request(1)`** in `onSubscribe` — the subscriber starts by requesting one item. This is backpressure: the subscriber says "send me one item at a time."
- **`onNext(String item)`** — receives one item, processes it, and then calls `subscription.request(1)` to request the next item. This controls the pace — the subscriber processes one item at a time, and the publisher only sends the next item after the subscriber asks for it.
- **`publisher.submit("item-" + i)`** — the publisher submits an item. The publisher will call `onNext` on each subscriber that has room in its backpressure window.
- **`publisher.close()`** — signals to all subscribers that the publisher is complete, so they receive `onComplete`.

This is a simple example, but it shows the backpressure model. If the subscriber processed items slowly (say, with a delay), the publisher would not overwhelm it — the subscriber only has one item pending at a time because it only requested one.

If the subscriber were to call `subscription.request(Long.MAX_VALUE)` in `onSubscribe`, the publisher would send all items as fast as it could, and the subscriber would receive them in a burst. That is still a valid use of the API, but it is not backpressure — it is "send everything and let the subscriber cope."

### SubmissionPublisher — A Concrete Publisher

The JDK provides `SubmissionPublisher` as a concrete implementation of `Publisher`. It is a simple publisher that lets you submit items and has a built-in executor for delivering items to subscribers.

Key points about `SubmissionPublisher`:

- You create one with an optional executor and a buffer capacity.
- You call `submit(item)` to publish an item. The publisher delivers the item to all current subscribers that have room in their backpressure window.
- You call `close()` to signal completion — all subscribers receive `onComplete`.
- If you submit an item after closing, it throws an error.
- It uses the provided executor (or a default one) to deliver items asynchronously. This means `onNext` calls happen on a thread from the executor, not necessarily the thread that called `submit`.

```java
import java.util.concurrent.Flow.Subscriber;
import java.util.concurrent.Flow.Subscription;
import java.util.concurrent.SubmissionPublisher;

public class SubmissionPublisherDemo {
    static class PrintSubscriber implements Subscriber<String> {
        private Subscription sub;

        @Override
        public void onSubscribe(Subscription sub) {
            this.sub = sub;
            sub.request(2);   // request two items at a time
        }

        @Override
        public void onNext(String item) {
            System.out.println("  got: " + item);
            sub.request(2);   // request two more after processing two
        }

        @Override
        public void onError(Throwable t) {
            System.err.println("error: " + t);
        }

        @Override
        public void onComplete() {
            System.out.println("done");
        }
    }

    public static void main(String[] args) {
        try (var publisher = new SubmissionPublisher<String>()) {
            publisher.subscribe(new PrintSubscriber());

            publisher.submit("a");
            publisher.submit("b");
            publisher.submit("c");
            publisher.submit("d");
            publisher.submit("e");
        }   // close() called here — subscribers get onComplete
    }
}
```

In this example, the subscriber requests two items at a time, processes them, then requests two more. This is a simple pacing strategy — not as fine-grained as "one at a time," but still shows backpressure.

### A Processor — A Filtering Stage

A `Processor` sits between a publisher and a subscriber and transforms or filters items. The JDK does not provide many concrete processors, but you can implement one yourself. Here is a simple processor that filters out items that do not match a predicate and passes the rest through.

```java
import java.util.concurrent.Flow.*;
import java.util.concurrent.SubmissionPublisher;
import java.util.function.Predicate;

// A processor that filters items by a predicate
class FilterProcessor<T> implements Processor<T, T> {
    private final Predicate<T> predicate;
    private Subscription subscription;
    private SubmissionPublisher<T> downstream;

    FilterProcessor(Predicate<T> predicate) {
        this.predicate = predicate;
    }

    @Override
    public void onSubscribe(Subscription subscription) {
        this.subscription = subscription;
        // Create a downstream publisher for the filtered items
        this.downstream = new SubmissionPublisher<>();
        // Subscribe a simple pass-through subscriber to the downstream
        downstream.subscribe(new Subscriber<T>() {
            @Override
            public void onSubscribe(Subscription s) {
                // Forward all requests from the final subscriber
                s.request(Long.MAX_VALUE);
            }
            @Override
            public void onNext(T item) {
                // Pass the item to the final subscriber
                // (in a real processor, you would manage backpressure more carefully)
            }
            @Override
            public void onError(Throwable t) {
                downstream.closeExceptionally(t);
            }
            @Override
            public void onComplete() {
                downstream.close();
            }
        });
    }

    @Override
    public void onNext(T item) {
        if (predicate.test(item)) {
            downstream.submit(item);
        }
        // If the predicate does not match, the item is dropped
    }

    @Override
    public void onError(Throwable t) {
        downstream.closeExceptionally(t);
    }

    @Override
    public void onComplete() {
        downstream.close();
    }

    @Override
    public void subscribe(Subscriber<? super T> subscriber) {
        downstream.subscribe(subscriber);
    }
}
```

This is a simplified processor. A production-quality processor manages backpressure more carefully — it respects the upstream subscription's backpressure and tracks the downstream's demand. But the structure is right: the processor subscribes to an upstream publisher, filters the items, and publishes the ones that pass the predicate to a downstream subscriber.

### Why the JDK Has Flow — and What It Is Not

The JDK's `Flow` API is not a reactive programming library. It is the base standard that libraries like Project Reactor, RxJava, and others implement or align with. The JDK provides the interfaces and a simple `SubmissionPublisher`, but it does not provide a rich set of operators (map, filter, flatMap, buffer, debounce, etc.) out of the box. Those come from reactive libraries.

The value of the JDK's `Flow` is:

- **A standard.** Libraries can implement the same interfaces, and code that uses the interfaces can work with different implementations.
- **Backpressure as a first-class concept.** The JDK standardises the subscription-request model, so libraries that implement it share the same backpressure semantics.
- **A starting point.** You can build simple reactive pipelines with `SubmissionPublisher` and custom `Subscriber`s and `Processor`s without adding a dependency.

But for real reactive programming — rich operators, composition, error handling, cancellation, hot and cold streams — you use a library like Project Reactor (which is the basis of Spring WebFlux) or RxJava. Those libraries implement the `Flow` interfaces internally (or provide adapters to them), but they offer a much richer programming model.

### A Code Example — A Simple Pipeline with SubmissionPublisher

This example builds a small pipeline: a `SubmissionPublisher` produces strings, a custom filter processor drops some, and a subscriber prints what it receives. This shows publisher, processor, and subscriber working together.

```java
import java.util.concurrent.Flow.*;
import java.util.concurrent.SubmissionPublisher;
import java.util.function.Predicate;

public class PipelineDemo {

    // A simple filter processor — drops items that do not match the predicate
    static class SimpleFilter<T> implements Processor<T, T> {
        private final Predicate<T> predicate;
        private Subscription upstream;
        private SubmissionPublisher<T> downstream;

        SimpleFilter(Predicate<T> predicate) {
            this.predicate = predicate;
        }

        @Override
        public void onSubscribe(Subscription s) {
            this.upstream = s;
            this.downstream = new SubmissionPublisher<>();
            // Subscribe to upstream — request all (simple, not backpressure-aware)
            s.request(Long.MAX_VALUE);
        }

        @Override
        public void onNext(T item) {
            if (predicate.test(item)) {
                downstream.submit(item);
            }
            // else: drop the item
        }

        @Override
        public void onError(Throwable t) {
            downstream.closeExceptionally(t);
        }

        @Override
        public void onComplete() {
            downstream.close();
        }

        @Override
        public void subscribe(Subscriber<? super T> subscriber) {
            downstream.subscribe(subscriber);
        }
    }

    // A subscriber that prints what it receives
    static class PrintSubscriber implements Subscriber<String> {
        private Subscription sub;

        @Override
        public void onSubscribe(Subscription s) {
            this.sub = s;
            sub.request(Long.MAX_VALUE);   // request all — no backpressure in this demo
        }

        @Override
        public void onNext(String item) {
            System.out.println("  -> " + item);
        }

        @Override
        public void onError(Throwable t) {
            System.err.println("error: " + t);
        }

        @Override
        public void onComplete() {
            System.out.println("complete");
        }
    }

    public static void main(String[] args) {
        try (var source = new SubmissionPublisher<String>()) {

            // Build the pipeline: source -> filter -> subscriber
            var filter = new SimpleFilter<String>(s -> !s.startsWith("skip-"));
            source.subscribe(filter);
            filter.subscribe(new PrintSubscriber());

            // Submit items — some match the filter, some do not
            source.submit("apple");
            source.submit("skip-banana");
            source.submit("cherry");
            source.submit("skip-date");
            source.submit("elderberry");
        }   // close() — subscribers get onComplete
    }
}
```

Line by line:

- **`source = new SubmissionPublisher<String>()`** — the source publisher.
- **`filter = new SimpleFilter<String>(...)`** — a processor that filters out items starting with "skip-".
- **`source.subscribe(filter)`** — the filter subscribes to the source. The source will now send items to the filter.
- **`filter.subscribe(new PrintSubscriber())`** — the subscriber subscribes to the filter. The filter will send filtered items to the subscriber.
- **`source.submit("apple")`** — the source submits an item. The filter receives it in `onNext`, and because "apple" does not start with "skip-", the filter submits it to the downstream (the subscriber).
- **`source.submit("skip-banana")`** — the filter receives this item, but the predicate returns false, so the filter does **not** submit it downstream. The item is dropped.
- **`source.close()`** — the source signals completion. The filter receives `onComplete`, and in turn signals the downstream (the subscriber) with `onComplete`.

The output should show: `apple`, `cherry`, `elderberry` (the three items that pass the filter), and then "complete". The two "skip-" items are dropped.

This is a simple pipeline, but it shows the shape of a reactive stream: a source that produces, a processor that transforms/filters, and a subscriber that consumes. The backpressure is not fully managed here (the subscriber requests all, and the processor requests all from upstream), but the structure is correct.

## Where This Shows Up in an Organization

In a backend team, the JDK's `Flow` API shows up in two ways.

First, as the standard reactive streams API that Spring WebFlux and Project Reactor implement. If you use Spring WebFlux, the reactive streams interfaces are under the hood — `Flux` and `Mono` from Project Reactor implement `Publisher`, and the whole reactive HTTP and data stack is built on the reactive streams model with backpressure. Understanding the JDK's `Flow` interfaces helps you understand what WebFlux is doing, because the concepts are the same: publisher, subscriber, subscription, backpressure.

Second, as a lightweight way to build reactive pipelines without a heavy dependency. If you need a simple asynchronous pipeline — a producer that publishes items, a filter, and a subscriber — you can build it with `SubmissionPublisher` and custom subscribers without adding Project Reactor or RxJava. This is useful for internal tools, demos, and small pipelines where the full reactive library would be overkill.

The key concept to understand is backpressure. In a reactive stream, the subscriber controls the pace. This is different from a simple publish-subscribe where the publisher fires events at subscribers regardless of how fast they can handle them. Backpressure is what makes a reactive system resilient — a slow consumer does not get overwhelmed.

## Common Mistakes

| Mistake | Why it happens | Fix |
|---|---|
| Requesting Long.MAX_VALUE and thinking you have backpressure | Requesting the maximum effectively disables backpressure — the publisher sends everything | Request only what you can handle at the moment for real backpressure |
| Not storing the Subscription in onSubscribe | The subscriber needs the subscription to request more items and to cancel | Store it in a field so onNext, onError, and onComplete can use it |
| Calling request after onComplete or onError | After completion or error, the subscription is no longer active | Only request during the active phase — after onSubscribe and before onComplete/onError |
| Assuming SubmissionPublisher delivers items synchronously | SubmissionPublisher uses an executor to deliver items, so onNext calls happen asynchronously | Do not assume the order or thread of onNext calls unless you control the executor |
| Building a Processor without managing backpressure | A processor must respect the upstream subscription's demand and the downstream's demand | In a real processor, track demand from both sides and only process items when both can handle them |
| Using Flow when a simple callback or queue would do | Reactive streams are for asynchronous streams with backpressure; not every problem needs them | Use Flow when you genuinely need asynchronous streaming with backpressure; otherwise, consider simpler tools |
| Assuming the JDK provides rich operators | The JDK provides only the interfaces and SubmissionPublisher | Use Project Reactor, RxJava, or another library for map, filter, flatMap, and other operators |

## For the Practice Lab

In the lab, you will see a starter with a `SubmissionPublisher` that subscribes a subscriber that requests `Long.MAX_VALUE` in `onSubscribe` and then processes items as they arrive. Modify the subscriber to request items one at a time, with a small delay in `onNext` to simulate slow processing, and observe that the publisher respects the backpressure — the publisher does not flood the subscriber. Then add a second subscriber that requests two items at a time, and observe that each subscriber has its own backpressure window. Finally, implement a simple filter processor that drops items matching a predicate, and wire it between the source and the subscriber to build a small pipeline.

## Summary

Java 9 introduced `java.util.concurrent.Flow`, a standard API for reactive streams — asynchronous streams with backpressure. The four interfaces are `Publisher` (produces items), `Subscriber` (consumes items and requests them via a `Subscription`), `Subscription` (the link between publisher and subscriber, with `request(n)` for backpressure and `cancel()` to stop), and `Processor` (both a subscriber and a publisher, for transformation stages). The JDK provides `SubmissionPublisher` as a concrete publisher. Backpressure is the subscriber's way of controlling the pace — by calling `subscription.request(n)`, the subscriber tells the publisher how many more items it can handle. Requesting `Long.MAX_VALUE` disables backpressure. The JDK's `Flow` is the base standard that libraries like Project Reactor implement, but it does not provide rich operators — for a full reactive programming model, use a library like Project Reactor (the basis of Spring WebFlux) or RxJava. Understanding the JDK's `Flow` interfaces is the foundation for understanding reactive streams in Java.
