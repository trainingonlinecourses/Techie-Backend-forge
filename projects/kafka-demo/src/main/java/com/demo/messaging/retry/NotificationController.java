package com.demo.messaging.retry;

import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class NotificationController {

    private final KafkaTemplate<String, Object> kafka;
    private final NotificationListener listener;

    public NotificationController(KafkaTemplate<String, Object> kafka, NotificationListener listener) {
        this.kafka = kafka;
        this.listener = listener;
    }

    /**
     * Publish a notification. Include "fail" in the message to watch it retry and
     * land in the DLT: {@code POST /api/notifications {"id":"n1","message":"boom fail"}}
     */
    @PostMapping("/notifications")
    public void send(@RequestBody Notification n) {
        kafka.send("notifications", n.id(), n);
    }

    @GetMapping("/notifications/stats")
    public Map<String, List<Notification>> stats() {
        return Map.of("handled", listener.handled(), "dead", listener.dead());
    }
}
