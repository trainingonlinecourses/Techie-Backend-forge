package com.demo.messaging;

import com.demo.messaging.retry.Notification;
import com.demo.messaging.retry.NotificationListener;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.test.context.EmbeddedKafka;

import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Retry/DLT flow against the embedded broker: a message that always fails must
 * exhaust its retries and end up on the DLT; a healthy one is handled immediately.
 */
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "notifications")
class RetryDltTest {

    @Autowired KafkaTemplate<String, Object> kafka;
    @Autowired NotificationListener listener;

    @Test
    void failing_message_ends_in_dlt() {
        kafka.send("notifications", "n-fail", new Notification("n-fail", "boom fail"));

        await().atMost(30, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(listener.dead()).extracting(Notification::id).contains("n-fail"));
    }

    @Test
    void healthy_message_is_handled() {
        kafka.send("notifications", "n-ok", new Notification("n-ok", "hello world"));

        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(listener.handled()).extracting(Notification::id).contains("n-ok"));
    }
}
