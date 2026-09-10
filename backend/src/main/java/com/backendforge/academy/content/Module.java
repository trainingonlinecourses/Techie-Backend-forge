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

    /**
     * Learning-path level: foundation, intermediate, advanced or expert.
     * Named path_level because "level" is a reserved word in H2, and nullable
     * because Hibernate's ddl-auto=update cannot add a NOT NULL column to a
     * table that already has rows — the seeder fills it in moments after boot.
     */
    @Column(name = "path_level")
    private String level = "foundation";

    @ElementCollection(fetch = FetchType.EAGER)   // tiny metadata list — safe to load eagerly
    private List<String> tech = new ArrayList<>();

    /** SHA-256 (hex) of the module's source JSON entry — seed fast-path (see ContentLoader). */
    @Column(name = "content_hash", length = 64)
    private String contentHash;

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
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    public List<String> getTech() { return tech; }
    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }
}
