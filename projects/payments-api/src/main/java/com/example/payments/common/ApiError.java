package com.example.payments.common;

import java.time.Instant;
import java.util.List;

public record ApiError(String timestamp, int status, String error, String message, String path,
                       List<FieldError> fieldErrors) {

    public record FieldError(String field, String message) {}

    public static ApiError of(int status, String error, String message, String path) {
        return new ApiError(Instant.now().toString(), status, error, message, path, null);
    }

    public static ApiError of(int status, String error, String message, String path,
                              List<FieldError> fieldErrors) {
        return new ApiError(Instant.now().toString(), status, error, message, path, fieldErrors);
    }
}
