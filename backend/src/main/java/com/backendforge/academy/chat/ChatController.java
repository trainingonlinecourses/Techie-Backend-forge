package com.backendforge.academy.chat;

import com.backendforge.academy.chat.ChatDtos.ChatAnswer;
import com.backendforge.academy.chat.ChatDtos.ChatHistoryDto;
import com.backendforge.academy.chat.ChatDtos.ChatRequest;
import com.backendforge.academy.common.NotFoundException;
import com.backendforge.academy.security.UserPrincipal;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** AI assistant endpoints (authenticated — chat history is per user). */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final AiChatService ai;
    private final ChatRepository chat;
    private final UserRepository users;

    public ChatController(AiChatService ai, ChatRepository chat, UserRepository users) {
        this.ai = ai;
        this.chat = chat;
        this.users = users;
    }

    @PostMapping
    @Transactional
    public ChatAnswer ask(@Valid @RequestBody ChatRequest req,
                          @AuthenticationPrincipal UserPrincipal principal) {
        User user = require(principal.user().getId());
        save(user, "user", req.message(), null);

        ChatAnswer answer = ai.answer(req.message(), user);
        save(user, "assistant", answer.answer(), answer.model());
        return answer;
    }

    @GetMapping("/history")
    public List<ChatHistoryDto> history(@AuthenticationPrincipal UserPrincipal principal) {
        return chat.findTop50ByUserIdOrderByCreatedAtAsc(principal.user().getId()).stream()
                .map(ChatHistoryDto::from)
                .toList();
    }

    @DeleteMapping("/history")
    @PreAuthorize("isAuthenticated()")
    public void clear(@AuthenticationPrincipal UserPrincipal principal) {
        chat.deleteByUserId(principal.user().getId());
    }

    private User require(Long id) {
        return users.findById(id)
                .orElseThrow(() -> new NotFoundException("User not found: " + id));
    }

    private void save(User user, String role, String content, String model) {
        ChatMessage m = new ChatMessage();
        m.setUser(user);
        m.setRole(role);
        m.setContent(content);
        m.setModel(model);
        chat.save(m);
    }
}
