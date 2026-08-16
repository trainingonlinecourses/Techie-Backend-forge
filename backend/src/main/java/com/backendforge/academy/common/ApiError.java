package com.backendforge.academy.common;

import java.util.List;

/** Uniform error body returned by the API. */
public record ApiError(String timestamp, int status, String error, String message, String path,
                       List<FieldError> fieldErrors) {

    public record FieldError(String field, String message) {}

    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(java.time.Instant.now().toString(), status, error, message, path, null);
    }

    public static ApiError of(int status, String error, String message, String path, List<FieldError> fieldErrors) {
        return new ApiError(java.time.Instant.now().toString(), status, error, message, path, fieldErrors);
    }
}
