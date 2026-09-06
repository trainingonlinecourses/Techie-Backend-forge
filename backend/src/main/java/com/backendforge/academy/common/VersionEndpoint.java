package com.backendforge.academy.common;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

@RestController
@RequestMapping("/api/version")
public class VersionEndpoint {
    @GetMapping
    public String version() {
        try {
            Path versionFile = Path.of(System.getProperty("user.dir"), "version.txt");
            if (Files.exists(versionFile)) {
                return Files.readString(versionFile).trim();
            }
        } catch (IOException ignored) {
        }
        return "unknown";
    }
}
