package com.backendforge.academy.lab;

import com.backendforge.academy.content.ContentService;
import com.backendforge.academy.content.Lesson;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Per-topic practice lab with a 30-minute server session TTL.
 * <p>
 * A user picks a topic (lesson slug), the server loads that lesson's actual code
 * block as the starter, and the user edits/runs it in the browser simulator.
 * The session lives for 30 minutes and is cleaned up on expiry.
 */
@Service
public class LabService {

    private static final long SESSION_TTL_SECONDS = 30 * 60; // 30 minutes

    private final ContentService content;
    private final Map<String, LabSession> sessions = new ConcurrentHashMap<>();

    /** Package-private accessor for LabController.cleanup(). */
    Map<String, LabSession> sessions() {
        return sessions;
    }

    public LabService(ContentService content) {
        this.content = content;
    }

    /**
     * Start a lab session for a topic (lesson slug). Returns the starter code
     * extracted from that lesson plus a session id and expiry time.
     */
    public LabSession start(String topicSlug) {
        Lesson lesson = content.lessonEntity(topicSlug)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No lesson found for topic: " + topicSlug));

        // Extract the best code block from the lesson body — same logic as the
        // frontend extractCodeExample, so the lab runs the real topic code.
        String starterCode = extractStarterCode(lesson.getBody());

        String sessionId = topicSlug + "-" + System.currentTimeMillis();
        LabSession session = new LabSession(
                sessionId,
                topicSlug,
                lesson.getTitle(),
                lesson.getModuleId(),
                starterCode,
                Instant.now(),
                Instant.now().plusSeconds(SESSION_TTL_SECONDS),
                null
        );

        sessions.put(sessionId, session);
        return session;
    }

    /** Returns the session if it still exists and hasn't expired. */
    public LabSession status(String sessionId) {
        LabSession s = sessions.get(sessionId);
        if (s == null) return null;
        if (Instant.now().isAfter(s.expiresAt())) {
            sessions.remove(sessionId);
            return null;
        }
        return s;
    }

    /** Record user output for a session (so the frontend can show it persisted). */
    public void recordOutput(String sessionId, String output) {
        LabSession s = sessions.get(sessionId);
        if (s != null) {
            sessions.put(sessionId, new LabSession(
                    s.sessionId(), s.topicSlug(), s.lessonTitle(), s.moduleId(),
                    s.starterCode(), s.createdAt(), s.expiresAt(), output));
        }
    }

    /** How many minutes remain on a session. */
    public long minutesRemaining(String sessionId) {
        LabSession s = sessions.get(sessionId);
        if (s == null) return 0;
        long remaining = java.time.Duration.between(Instant.now(), s.expiresAt()).getSeconds();
        return Math.max(0, remaining / 60);
    }

    /**
     * Extend session by 15 minutes. Up to 3 extensions allowed (max 1.5h total).
     */
    public boolean extend(String sessionId) {
        LabSession s = sessions.get(sessionId);
        if (s == null) return false;
        long extensions = extensionCounters.getOrDefault(sessionId, 0L);
        if (extensions >= 3) return false;
        extensionCounters.put(sessionId, extensions + 1);
        Instant newExpiry = s.expiresAt().plusSeconds(15 * 60);
        sessions.put(sessionId, new LabSession(
                s.sessionId(), s.topicSlug(), s.lessonTitle(), s.moduleId(),
                s.starterCode(), s.createdAt(), newExpiry, s.lastOutput()));
        return true;
    }

    private final Map<String, Long> extensionCounters = new ConcurrentHashMap<>();

    /** Clean up expired sessions. Called periodically or on demand. */
    public void evictExpired() {
        Instant now = Instant.now();
        sessions.entrySet().removeIf(entry -> now.isAfter(entry.getValue().expiresAt()));
    }

    // ---- Extract the best code block from a lesson body ----
    // Mirrors the frontend extractCodeExample() priority:
    //  1. Blocks with System.out.println and main method
    //  2. Longest blocks with executable content
    private String extractStarterCode(String body) {
        java.util.regex.Matcher codeBlockRe = java.util.regex.Pattern.compile(
                "```java\\s*\\n([\\s\\S]*?)```").matcher(body);

        String best = null;
        int bestScore = -1;

        while (codeBlockRe.find()) {
            String block = codeBlockRe.group(1).trim();
            if (block.length() < 20) continue;

            int score = 0;
            score += block.split("\\n").length * 2;
            score += countMatches(block, "System\\.out\\.print") * 3;
            if (block.contains("public static void main")) score += 5;
            if (block.contains("class ") || block.contains("enum ") || block.contains("interface ")) score += 2;

            if (score > bestScore) {
                bestScore = score;
                best = block;
            }
        }

        if (best != null) {
            return best;
        }

        // Fallback: a topic-relevant starter based on the lesson body keywords
        String lower = body.toLowerCase();
        String snippet = body.replaceAll("[#`*\\n]", " ").trim().substring(0, Math.min(80, body.length()));

        if (lower.contains("array") || lower.contains("indexed")) {
            return "public class TopicDemo {\n"
                    + "    public static void main(String[] args) {\n"
                    + "        // Edit this code to experiment with " + snippet + "\n"
                    + "        String[] items = {\"edit\", \"me\"};\n"
                    + "        System.out.println(\"You have \" + items.length + \" items:\");\n"
                    + "        for (int i = 0; i < items.length; i++) {\n"
                    + "            System.out.println(\"  \" + (i + 1) + \". \" + items[i]);\n"
                    + "        }\n"
                    + "    }\n"
                    + "}";
        }
        return "public class TopicDemo {\n"
                + "    public static void main(String[] args) {\n"
                + "        // Edit this code to explore: " + snippet + "\n"
                + "        System.out.println(\"Your code here — edit and run!\");\n"
                + "    }\n"
                + "}";
    }

    private int countMatches(String text, String regex) {
        int count = 0;
        java.util.regex.Matcher m = java.util.regex.Pattern.compile(regex).matcher(text);
        while (m.find()) count++;
        return count;
    }
}
