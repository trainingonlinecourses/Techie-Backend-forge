package com.backendforge.academy.content;

import jakarta.persistence.*;

import java.util.ArrayList;
import java.util.List;

/** A top-level curriculum module, e.g. "Spring Security". */
@Entity
@Table(name = "modules")
public class Module {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, length = 2000)
    private String subtitle;

    @Column(nullable = false)
    private int orderIndex;

    @Column(nullable = false, length = 20)
    private String color;

    @Column(nullable = false)
    private String docsUrl;

    @ElementCollection(fetch = FetchType.EAGER)   // tiny metadata list — safe to load eagerly
    private List<String> tech = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public int getOrderIndex() { return orderIndex; }
    public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getDocsUrl() { return docsUrl; }
    public void setDocsUrl(String docsUrl) { this.docsUrl = docsUrl; }
    public List<String> getTech() { return tech; }
}
