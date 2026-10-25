package org.firstinspires.ftc.sim;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

/** Configured FTC hardware sensor name and the SDK interface exposed for it. */
final class SensorProfile {
    enum Kind { DIGITAL, ANALOG, DISTANCE, COLOR, ODOMETRY, PINPOINT }

    final String name;
    final Kind kind;

    private SensorProfile(String name, Kind kind) {
        this.name = validateName(name);
        this.kind = kind;
    }

    static SensorProfile parse(String encoded) {
        String[] fields = encoded.split(",", -1);
        if (fields.length != 3 || !"v1".equals(fields[0])) {
            throw new IllegalArgumentException("Sensor profile must use the v1 three-field format");
        }
        final Kind kind;
        try {
            kind = Kind.valueOf(fields[2].toUpperCase(java.util.Locale.ROOT));
        } catch (IllegalArgumentException failure) {
            throw new IllegalArgumentException("Unsupported sensor kind " + fields[2], failure);
        }
        return new SensorProfile(decode(fields[1]), kind);
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, "UTF-8");
        } catch (UnsupportedEncodingException impossibleUtf8Failure) {
            throw new IllegalStateException("UTF-8 is unavailable", impossibleUtf8Failure);
        }
    }

    private static String validateName(String name) {
        if (name == null || name.length() < 1 || name.length() > 128 || !name.equals(name.trim())) {
            throw new IllegalArgumentException(
                    "Sensor name must be trimmed and contain 1 through 128 characters");
        }
        for (int index = 0; index < name.length(); index++) {
            if (Character.isISOControl(name.charAt(index))) {
                throw new IllegalArgumentException("Sensor name cannot contain control characters");
            }
        }
        return name;
    }
}
