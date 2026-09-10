package com.backendforge.academy.content;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ModuleRepository extends JpaRepository<Module, String> {

    /** id → content hash pairs for the seed fast-path (see ContentLoader). */
    @Query("select m.id, m.contentHash from Module m")
    List<Object[]> findAllIdAndHash();

    List<Module> findAllByOrderByOrderIndexAsc();

    void deleteAllInBatch();
}
