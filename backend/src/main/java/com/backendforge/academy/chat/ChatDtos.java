package com.backendforge.academy.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

public final class ChatDtos {

    private ChatDtos() {}

    public record ChatRequest(
            @NotBlank(message = "message is required")
            @Size(max = 4000, message = "message is too long")
            String message,
            // Optional per-request LLM overrides for "bring your own key":
            // baseUrl (OpenAI-compatible, without /v1) and model name.
            String baseUrl,
            String model) {}

    public record Source(String lessonId, String title, String moduleTitle) {}

    public record ChatAnswer(String answer, List<Source> sources, String model, String provider) {}

    public record ChatHistoryDto(Long id, String role, String content, String model, Instant createdAt) {
        static ChatHistoryDto from(ChatMessage m) {
            return new ChatHistoryDto(m.getId(), m.getRole(), m.getContent(), m.getModel(), m.getCreatedAt());
        }
    }
}
