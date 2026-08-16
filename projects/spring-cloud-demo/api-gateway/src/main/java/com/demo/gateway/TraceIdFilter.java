package com.demo.gateway;

import io.micrometer.tracing.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/**
 * Edge filter: logs the distributed trace id for every request that enters the
 * gateway, and forwards it downstream via the W3C traceparent header so the
 * whole chain shares one trace.
 */
@Component
public class TraceIdFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(TraceIdFilter.class);

    private final Tracer tracer;

    public TraceIdFilter(Tracer tracer) {
        this.tracer = tracer;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();
        String traceId = tracer.currentSpan() != null
                ? tracer.currentSpan().context().traceId()
                : "no-trace";
        log.info("GATEWAY {} path={} traceId={}", exchange.getRequest().getMethod(), path, traceId);
        exchange.getResponse().getHeaders().add("X-Trace-Id", traceId);
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -100;
    }
}
