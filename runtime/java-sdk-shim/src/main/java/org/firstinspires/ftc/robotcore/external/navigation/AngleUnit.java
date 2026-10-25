package org.firstinspires.ftc.robotcore.external.navigation;

/** FTC SDK angle units used by AprilTag output poses. */
public enum AngleUnit {
    DEGREES((byte) 0), RADIANS((byte) 1);
    public final byte bVal;
    protected static final double TwoPi = Math.PI * 2.0;
    public static final float Pif = (float) Math.PI;

    AngleUnit(byte bVal) { this.bVal = bVal; }

    public double fromDegrees(double value) { return normalize(this == DEGREES ? value : Math.toRadians(value)); }
    public float fromDegrees(float value) { return normalize(this == DEGREES ? value : (float) Math.toRadians(value)); }
    public double fromRadians(double value) { return normalize(this == RADIANS ? value : Math.toDegrees(value)); }
    public float fromRadians(float value) { return normalize(this == RADIANS ? value : (float) Math.toDegrees(value)); }
    public double fromUnit(AngleUnit source, double value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return source==DEGREES?fromDegrees(value):fromRadians(value);
    }
    public float fromUnit(AngleUnit source, float value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return source==DEGREES?fromDegrees(value):fromRadians(value);
    }
    public double toRadians(double value) { return RADIANS.fromUnit(this,value); }
    public float toRadians(float value) { return RADIANS.fromUnit(this,value); }
    public double toDegrees(double value) { return DEGREES.fromUnit(this,value); }
    public float toDegrees(float value) { return DEGREES.fromUnit(this,value); }
    public double normalize(double value) { return this == DEGREES ? normalizeDegrees(value) : normalizeRadians(value); }
    public float normalize(float value) { return this == DEGREES ? normalizeDegrees(value) : normalizeRadians(value); }
    public static double normalizeDegrees(double value) { return normalize(value, 360.0); }
    public static float normalizeDegrees(float value) { return normalize(value, 360.0f); }
    public static double normalizeRadians(double value) { return normalize(value, TwoPi); }
    public static float normalizeRadians(float value) { return normalize(value, (float) TwoPi); }
    public UnnormalizedAngleUnit getUnnormalized() {
        return this == DEGREES ? UnnormalizedAngleUnit.DEGREES : UnnormalizedAngleUnit.RADIANS;
    }
    private static double normalize(double value, double period) {
        double result = value % period;
        if (result < -period / 2.0) result += period;
        if (result >= period / 2.0) result -= period;
        return result;
    }
    private static float normalize(float value, float period) {
        float result = value % period;
        if (result < -period / 2.0f) result += period;
        if (result >= period / 2.0f) result -= period;
        return result;
    }
}
