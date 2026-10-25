package org.firstinspires.ftc.sim;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;

/** Immutable per-camera AprilTag observation passed by the deterministic world sensor frame. */
public final class SimulatorAprilTagObservation {
    public final int id;
    public final String camera;
    public final long captureTimeMillis;
    public final long availableTimeMillis;
    public final double xMeters, yMeters, zMeters;
    public final double qx, qy, qz, qw;
    public final double rangeMeters, bearingRadians, elevationRadians;

    private SimulatorAprilTagObservation(
            int id, String camera, long captureTimeMillis, long availableTimeMillis,
            double xMeters, double yMeters, double zMeters,
            double qx, double qy, double qz, double qw,
            double rangeMeters, double bearingRadians, double elevationRadians) {
        this.id = id; this.camera = camera;
        this.captureTimeMillis = captureTimeMillis; this.availableTimeMillis = availableTimeMillis;
        this.xMeters = xMeters; this.yMeters = yMeters; this.zMeters = zMeters;
        this.qx = qx; this.qy = qy; this.qz = qz; this.qw = qw;
        this.rangeMeters = rangeMeters; this.bearingRadians = bearingRadians;
        this.elevationRadians = elevationRadians;
    }

    static SimulatorAprilTagObservation parse(String key, String encoded) {
        String[] fields = encoded.split(",", -1);
        if (fields.length != 14) {
            throw new IllegalArgumentException("AprilTag observation must contain 14 fields");
        }
        int id = integer(fields[0], "tag id");
        String camera;
        try {
            camera = URLDecoder.decode(fields[1], "UTF-8");
        } catch (UnsupportedEncodingException impossibleUtf8Failure) {
            throw new IllegalStateException("UTF-8 is unavailable", impossibleUtf8Failure);
        }
        if (camera.length() == 0) throw new IllegalArgumentException("AprilTag camera cannot be empty");
        long capture = longNumber(fields[2], "capture time");
        long available = longNumber(fields[3], "available time");
        return new SimulatorAprilTagObservation(
                id, camera, capture, available,
                number(fields[4], "tag x"), number(fields[5], "tag y"), number(fields[6], "tag z"),
                number(fields[7], "tag quaternion x"), number(fields[8], "tag quaternion y"),
                number(fields[9], "tag quaternion z"), number(fields[10], "tag quaternion w"),
                number(fields[11], "tag range"), number(fields[12], "tag bearing"),
                number(fields[13], "tag elevation"));
    }

    private static int integer(String value, String field) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException failure) { throw new IllegalArgumentException(field + " must be an integer", failure); }
    }

    private static long longNumber(String value, String field) {
        try { return Long.parseLong(value); }
        catch (NumberFormatException failure) { throw new IllegalArgumentException(field + " must be an integer", failure); }
    }

    private static double number(String value, String field) {
        try {
            double parsed = Double.parseDouble(value);
            if (!Double.isFinite(parsed)) throw new NumberFormatException("not finite");
            return parsed;
        } catch (NumberFormatException failure) {
            throw new IllegalArgumentException(field + " must be finite numeric data", failure);
        }
    }
}
