package com.backendforge.academy.content;

import com.backendforge.academy.content.ContentDtos.DocsSectionDto;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Loads {@code content/docs-index.json}: an organizational map of the official
 * documentation (docs.spring.io, docs.oracle.com, etc.) so learners always know
 * where each topic lives in the reference docs.
 */
@Service
public class DocsIndexService {

    private final ObjectMapper mapper;
    private List<DocsSectionDto> sections = List.of();

    public DocsIndexService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public void load() {
        try (InputStream in = getClass().getResourceAsStream("/content/docs-index.json")) {
            if (in == null) throw new IllegalStateException("content/docs-index.json missing");
            List<SectionRaw> raw = mapper.readValue(in, new TypeReference<>() {});
            List<DocsSectionDto> built = new ArrayList<>();
            for (SectionRaw s : raw) {
                built.add(new DocsSectionDto(s.title(), s.links().stream()
                        .map(l -> new ContentDtos.DocsLinkDto(l.title(), l.url(), l.description()))
                        .toList()));
            }
            this.sections = List.copyOf(built);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load docs index", e);
        }
    }

    public List<DocsSectionDto> sections() {
        return sections;
    }

    public long count() {
        return sections.stream().mapToLong(s -> s.links().size()).sum();
    }

    private record SectionRaw(String title, List<LinkRaw> links) {}
    private record LinkRaw(String title, String url, String description) {}
}
