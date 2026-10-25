package org.firstinspires.ftc.sim;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

/** Validated physical motor metadata received from the Bun runner. */
final class MotorProfile {
    private static final double LEGACY_TICKS_PER_REVOLUTION = 537.7;
    private static final double LEGACY_MAX_RPM = 2800.0 * 60.0 / LEGACY_TICKS_PER_REVOLUTION;

    final String name;
    final String modelId;
    final double ticksPerRevolution;
    final double maxRpm;
    final double achievableMaxRpmFraction;

    private MotorProfile(
            String name,
            String modelId,
            double ticksPerRevolution,
            double maxRpm,
            double achievableMaxRpmFraction) {
        this.name = validateName(name);
        this.modelId = validateModelId(modelId);
        this.ticksPerRevolution = positive(ticksPerRevolution, "ticksPerRevolution");
        this.maxRpm = positive(maxRpm, "maxRpm");
        this.achievableMaxRpmFraction = positive(
                achievableMaxRpmFraction,
                "achievableMaxRpmFraction");
        if (achievableMaxRpmFraction > 1) {
            throw new IllegalArgumentException("achievableMaxRpmFraction cannot exceed 1");
        }
    }

    static MotorProfile legacy(String name) {
        return new MotorProfile(
                name,
                "legacy-generic-537.7",
                LEGACY_TICKS_PER_REVOLUTION,
                LEGACY_MAX_RPM,
                1);
    }

    static MotorProfile parse(String encoded) {
        String[] fields = encoded.split(",", -1);
        if (fields.length != 6 || !"v1".equals(fields[0])) {
            throw new IllegalArgumentException("Motor profile must use the v1 six-field format");
        }
        return new MotorProfile(
                decode(fields[1]),
                decode(fields[2]),
                parseDouble(fields[3], "ticksPerRevolution"),
                parseDouble(fields[4], "maxRpm"),
                parseDouble(fields[5], "achievableMaxRpmFraction"));
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, "UTF-8");
        } catch (UnsupportedEncodingException impossibleUtf8Failure) {
            throw new IllegalStateException("UTF-8 is unavailable", impossibleUtf8Failure);
        }
    }

    private static double parseDouble(String value, String field) {
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException failure) {
            throw new IllegalArgumentException(field + " must be a number", failure);
        }
    }

    private static double positive(double value, String field) {
        if (!Double.isFinite(value) || value <= 0) {
            throw new IllegalArgumentException(field + " must be finite and greater than 0");
        }
        return value;
    }

    private static String validateName(String name) {
        if (name == null || name.length() < 1 || name.length() > 128 || !name.equals(name.trim())) {
            throw new IllegalArgumentException(
                    "Motor name must be trimmed and contain 1 through 128 characters");
        }
        for (int index = 0; index < name.length(); index++) {
            if (Character.isISOControl(name.charAt(index))) {
                throw new IllegalArgumentException("Motor name cannot contain control characters");
            }
        }
        return name;
    }

    private static String validateModelId(String modelId) {
        if (modelId == null || !modelId.matches("[A-Za-z0-9][A-Za-z0-9._:-]{0,127}")) {
            throw new IllegalArgumentException("Motor modelId must be a safe identifier");
        }
        return modelId;
    }
}
