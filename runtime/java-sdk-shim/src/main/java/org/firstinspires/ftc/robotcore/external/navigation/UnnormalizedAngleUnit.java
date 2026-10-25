package org.firstinspires.ftc.robotcore.external.navigation;

/** Unnormalized FTC angle units corresponding to AngleUnit. */
public enum UnnormalizedAngleUnit {
    DEGREES((byte) 0), RADIANS((byte) 1);
    public final byte bVal;
    UnnormalizedAngleUnit(byte bVal) { this.bVal = bVal; }
    public double fromDegrees(double value) { return this == DEGREES ? value : Math.toRadians(value); }
    public float fromDegrees(float value) { return this == DEGREES ? value : (float) Math.toRadians(value); }
    public double fromRadians(double value) { return this == RADIANS ? value : Math.toDegrees(value); }
    public float fromRadians(float value) { return this == RADIANS ? value : (float) Math.toDegrees(value); }
    public double fromUnit(UnnormalizedAngleUnit source, double value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return fromRadians(source.toRadians(value));
    }
    public float fromUnit(UnnormalizedAngleUnit source, float value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return fromRadians(source.toRadians(value));
    }
    public double fromUnit(AngleUnit source, double value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return fromRadians(source.toRadians(value));
    }
    public float fromUnit(AngleUnit source, float value) {
        if (source == null) throw new IllegalArgumentException("source unit cannot be null");
        return fromRadians(source.toRadians(value));
    }
    public double toDegrees(double value) { return this == DEGREES ? value : Math.toDegrees(value); }
    public float toDegrees(float value) { return this == DEGREES ? value : (float) Math.toDegrees(value); }
    public double toRadians(double value) { return this == RADIANS ? value : Math.toRadians(value); }
    public float toRadians(float value) { return this == RADIANS ? value : (float) Math.toRadians(value); }
    public AngleUnit getNormalized() { return this == DEGREES ? AngleUnit.DEGREES : AngleUnit.RADIANS; }
}
