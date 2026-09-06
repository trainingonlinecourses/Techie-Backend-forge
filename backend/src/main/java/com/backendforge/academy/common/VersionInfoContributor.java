package com.backendforge.academy.common;

import org.springframework.boot.actuate.info.Info;
import org.springframework.boot.actuate.info.InfoContributor;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

@Component
public class VersionInfoContributor implements InfoContributor {
    @Override
    public void contribute(Info.Builder builder) {
        try {
            Path versionFile = Path.of(System.getProperty("user.dir"), "version.txt");
            if (Files.exists(versionFile)) {
                String version = Files.readString(versionFile).trim();
                builder.withDetail("appVersion", version);
            }
        } catch (IOException ignored) {
            builder.withDetail("appVersion", "unknown");
        }
    }
}
