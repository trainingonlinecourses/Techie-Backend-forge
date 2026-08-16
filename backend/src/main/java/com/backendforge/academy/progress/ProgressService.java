package com.backendforge.academy.progress;

import com.backendforge.academy.common.NotFoundException;
import com.backendforge.academy.content.LessonRepository;
import com.backendforge.academy.user.User;
import com.backendforge.academy.user.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class ProgressService {

    private final ProgressRepository progress;
    private final LessonRepository lessons;
    private final UserRepository users;

    public ProgressService(ProgressRepository progress, LessonRepository lessons, UserRepository users) {
        this.progress = progress;
        this.lessons = lessons;
        this.users = users;
    }

    public Map<String, Boolean> progressMap(Long userId) {
        return progress.findByUserIdOrderByCompletedAtAsc(userId).stream()
                .collect(Collectors.toMap(ProgressEntry::getLessonId, e -> true, (a, b) -> a));
    }

    public List<String> completedLessonIds(Long userId) {
        return progress.findByUserIdOrderByCompletedAtAsc(userId).stream()
                .map(ProgressEntry::getLessonId)
                .toList();
    }

    public long completedCount(Long userId) {
        return progress.countByUserId(userId);
    }

    @Transactional
    public void markComplete(Long userId, String lessonId) {
        if (!lessons.existsById(lessonId)) {
            throw new NotFoundException("Lesson not found: " + lessonId);
        }
        if (!progress.existsByUserIdAndLessonId(userId, lessonId)) {
            User user = users.findById(userId)
                    .orElseThrow(() -> new NotFoundException("User not found: " + userId));
            ProgressEntry entry = new ProgressEntry();
            entry.setLessonId(lessonId);
            entry.setUser(user);
            progress.save(entry);
        }
    }

    @Transactional
    public void unmark(Long userId, String lessonId) {
        progress.deleteByUserIdAndLessonId(userId, lessonId);
    }
}
