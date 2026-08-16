package com.backendforge.academy.content;

import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;

/** A single lesson: metadata + full markdown body rendered by the frontend. */
@Entity
@Table(name = "lessons")
public class Lesson {

    @Id
    private String id;

    @Column(nullable = false)
    private String moduleId;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 4000)
    private String summary;

    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false)
    private int minutes;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String body;

    @ElementCollection(fetch = FetchType.EAGER)   // tiny metadata lists — safe to load eagerly
    private List<String> topics = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    private List<String> docs = new ArrayList<>();

    @Column(nullable = false)
    private boolean capstone;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getModuleId() { return moduleId; }
    public void setModuleId(String moduleId) { this.moduleId = moduleId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
    public int getMinutes() { return minutes; }
    public void setMinutes(int minutes) { this.minutes = minutes; }
    public String getBody() { return body; }
    public void setBody(String body) { this.body = body; }
    public List<String> getTopics() { return topics; }
    public List<String> getDocs() { return docs; }
    public boolean isCapstone() { return capstone; }
    public void setCapstone(boolean capstone) { this.capstone = capstone; }
}
