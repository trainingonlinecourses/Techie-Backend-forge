package com.backendforge.academy.content;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.backendforge.academy.content.ContentDtos.LessonSummaryDto;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Unit tests for prerequisite derivation: explicit {@code requires:} tags first,
 * then curriculum-path context, deduplicated and capped.
 */
@ExtendWith(MockitoExtension.class)
class PrereqDerivationTest {

    @Mock
    LessonRepository lessons;

    @Mock
    ModuleRepository modules;

    private ContentService service;

    private void setUpCurriculum(Lesson... flatLessons) {
        service = new ContentService(modules, lessons);

        // pathBefore() walks modules in order and lessons within each module via
        // the summary projection; the mock presents the whole curriculum as one
        // flat, ordered list.
        java.util.Map<String, Lesson> byId = new java.util.LinkedHashMap<>();
        List<LessonSummaryData> summaries = new java.util.ArrayList<>();
        Module onlyModule = new Module();
        onlyModule.setId("m1");
        onlyModule.setTitle("Module 1");
        lenient().when(modules.findAllByOrderByOrderIndexAsc()).thenReturn(List.of(onlyModule));

        for (Lesson l : flatLessons) {
            byId.put(l.getId(), l);
            summaries.add(new LessonSummaryData(l.getId(), l.getModuleId(), l.getTitle(),
                    l.getSummary(), l.getOrderIndex(), l.getMinutes(), l.isCapstone()));
        }
        lenient().when(lessons.findAllSummaries()).thenReturn(summaries);
        lenient().when(modules.findById(anyString())).thenAnswer(inv ->
                "m1".equals(inv.getArgument(0)) ? Optional.of(onlyModule) : Optional.empty());
        lenient().when(lessons.findById(anyString())).thenAnswer(inv ->
                Optional.ofNullable(byId.get(inv.getArgument(0, String.class))));
    }

    private static Lesson lesson(String id, String moduleId, int order) {
        Lesson l = new Lesson();
        l.setId(id);
        l.setModuleId(moduleId);
        l.setTitle("Title of " + id);
        l.setSummary("Summary of " + id);
        l.setOrderIndex(order);
        l.setMinutes(10);
        return l;
    }

    @Test
    @DisplayName("First lesson of the curriculum has no prerequisites")
    void firstLessonHasNoPrereqs() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        setUpCurriculum(a, b);

        assertThat(service.derivePrereqs(a)).isEmpty();
    }

    @Test
    @DisplayName("Second lesson derives the single lesson before it")
    void secondLessonDerivesPrevious() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        setUpCurriculum(a, b);

        List<LessonSummaryDto> prereqs = service.derivePrereqs(b);
        assertThat(prereqs).hasSize(1);
        assertThat(prereqs.get(0).id()).isEqualTo("a");
    }

    @Test
    @DisplayName("Derived path context is capped at three lessons")
    void derivedContextIsCapped() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        Lesson c = lesson("c", "m1", 3);
        Lesson d = lesson("d", "m1", 4);
        Lesson e = lesson("e", "m1", 5);
        setUpCurriculum(a, b, c, d, e);

        List<LessonSummaryDto> prereqs = service.derivePrereqs(e);
        assertThat(prereqs).extracting(LessonSummaryDto::id)
                .containsExactly("b", "c", "d");
    }

    @Test
    @DisplayName("Explicit requires: tags come first and survive even when unknown or duplicated")
    void explicitTagsComeFirst() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        Lesson c = lesson("c", "m1", 3);
        Lesson d = lesson("d", "m1", 4);
        setUpCurriculum(a, b, c, d);
        // unknown slug and a duplicate tag — loader skips unknowns, derivation dedupes
        d.getPrereqs().addAll(List.of("no-such-lesson", "a", "a"));

        List<LessonSummaryDto> prereqs = service.derivePrereqs(d);
        assertThat(prereqs).extracting(LessonSummaryDto::id)
                .containsExactly("a", "b", "c"); // tag first, then path context, no dupes
    }

    @Test
    @DisplayName("A lesson tagged as its own prerequisite still appears exactly once")
    void selfReferenceIsDeduplicated() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        setUpCurriculum(a, b);
        b.getPrereqs().add("a");
        // the derived path for b is exactly [a] — the tag must not duplicate it

        assertThat(service.derivePrereqs(b)).extracting(LessonSummaryDto::id)
                .containsExactly("a");
    }

    @Test
    @DisplayName("Explicit tags survive even when the tagged lesson is not in the DB")
    void unknownTaggedSlugIsSkipped() {
        Lesson a = lesson("a", "m1", 1);
        Lesson b = lesson("b", "m1", 2);
        setUpCurriculum(a, b);
        b.getPrereqs().add("ghost");

        assertThat(service.derivePrereqs(b)).extracting(LessonSummaryDto::id)
                .containsExactly("a");
    }

    @Test
    @DisplayName("Derivation spans module borders using module order")
    void spansModuleBorders() {
        Lesson a1 = lesson("a1", "m1", 1);
        Lesson b1 = lesson("b1", "m2", 1);
        Module m1 = new Module();
        m1.setId("m1");
        m1.setTitle("Module 1");
        Module m2 = new Module();
        m2.setId("m2");
        m2.setTitle("Module 2");

        service = new ContentService(modules, lessons);
        lenient().when(modules.findAllByOrderByOrderIndexAsc()).thenReturn(List.of(m1, m2));
        lenient().when(modules.findAll()).thenReturn(List.of(m1, m2)); // moduleTitles()
        lenient().when(lessons.findAllSummaries()).thenReturn(List.of(
                new LessonSummaryData("a1", "m1", "Title of a1", "Summary of a1", 1, 10, false),
                new LessonSummaryData("b1", "m2", "Title of b1", "Summary of b1", 1, 10, false)));
        lenient().when(modules.findById(anyString())).thenAnswer(inv ->
                switch (inv.getArgument(0, String.class)) {
                    case "m1" -> Optional.of(m1);
                    case "m2" -> Optional.of(m2);
                    default -> Optional.empty();
                });
        lenient().when(lessons.findById(anyString())).thenAnswer(inv ->
                "a1".equals(inv.getArgument(0)) ? Optional.of(a1) : Optional.empty());

        List<LessonSummaryDto> prereqs = service.derivePrereqs(b1);
        assertThat(prereqs).extracting(LessonSummaryDto::id).containsExactly("a1");
        assertThat(prereqs.get(0).moduleTitle()).isEqualTo("Module 1");
    }

    @Test
    @DisplayName("Parser accepts inline lists, quoted entries, and blank values")
    void parsesInlineListsAndBlanks() {
        assertThat(ContentLoader.parsePrereqSlugs("[a, b, c]")).containsExactly("a", "b", "c");
        assertThat(ContentLoader.parsePrereqSlugs("[\"a\", 'b']")).containsExactly("a", "b");
        assertThat(ContentLoader.parsePrereqSlugs("single-slug")).containsExactly("single-slug");
        assertThat(ContentLoader.parsePrereqSlugs("")).isEmpty();
        assertThat(ContentLoader.parsePrereqSlugs(null)).isEmpty();
        assertThat(ContentLoader.parsePrereqSlugs("  ")).isEmpty();
    }
}
