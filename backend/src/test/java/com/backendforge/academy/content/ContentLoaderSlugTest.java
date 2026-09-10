package com.backendforge.academy.content;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Runtime backstop for duplicate lesson slugs (the CI guard is scripts/verify-content.mjs). */
class ContentLoaderSlugTest {

    @Test
    @DisplayName("Unique slugs pass")
    void uniqueSlugsPass() {
        assertThatCode(() -> ContentLoader.assertNoDuplicateSlugs(List.of("a", "b", "c")))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("A duplicate slug fails with the offending names listed")
    void duplicateSlugFails() {
        assertThatThrownBy(() ->
                ContentLoader.assertNoDuplicateSlugs(List.of("java-syntax", "records", "java-syntax")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Duplicate lesson slugs detected")
                .hasMessageContaining("java-syntax");
    }

    @Test
    @DisplayName("Multiple duplicates are all reported, sorted")
    void multipleDuplicatesReported() {
        assertThatThrownBy(() ->
                ContentLoader.assertNoDuplicateSlugs(List.of("b", "a", "b", "a")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("a, b");
    }
}
