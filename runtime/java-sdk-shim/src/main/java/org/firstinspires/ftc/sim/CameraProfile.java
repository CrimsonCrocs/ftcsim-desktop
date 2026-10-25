package org.firstinspires.ftc.sim;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

/** A webcam that is explicitly connected to this robot's world-generated camera observations. */
final class CameraProfile {
    final String name;

    private CameraProfile(String name) {
        if (name == null || name.length() < 1 || name.length() > 128 || !name.equals(name.trim())) {
            throw new IllegalArgumentException("Camera name must be trimmed and contain 1 through 128 characters");
        }
        for (int index = 0; index < name.length(); index++) {
            if (Character.isISOControl(name.charAt(index))) {
                throw new IllegalArgumentException("Camera name cannot contain control characters");
            }
        }
        this.name = name;
    }

    static CameraProfile parse(String encoded) {
        String[] fields = encoded.split(",", -1);
        if (fields.length != 2 || !"v1".equals(fields[0])) {
            throw new IllegalArgumentException("Camera profile must use the v1 two-field format");
        }
        try {
            return new CameraProfile(URLDecoder.decode(fields[1], "UTF-8"));
        } catch (UnsupportedEncodingException impossibleUtf8Failure) {
            throw new IllegalStateException("UTF-8 is unavailable", impossibleUtf8Failure);
        }
    }
}
