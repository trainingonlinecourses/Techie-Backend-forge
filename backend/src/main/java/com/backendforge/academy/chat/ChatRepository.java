package com.backendforge.academy.chat;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ChatRepository extends JpaRepository<ChatMessage, Long> {

    List<ChatMessage> findTop50ByUserIdOrderByCreatedAtAsc(Long userId);

    void deleteByUserId(Long userId);
}
