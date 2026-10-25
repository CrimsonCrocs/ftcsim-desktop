package org.firstinspires.ftc.robotcore.external.navigation;

import java.util.Locale;

/** FTC angular-rate value object. Rates remain unnormalized by design. */
public class AngularVelocity {
    public UnnormalizedAngleUnit angleUnit;
    public float xRotationRate;
    public float yRotationRate;
    public float zRotationRate;
    public long acquisitionTime;

    public AngularVelocity() {
        this(UnnormalizedAngleUnit.DEGREES, 0, 0, 0, 0);
    }

    public AngularVelocity(
            AngleUnit unit, float xRotationRate, float yRotationRate,
            float zRotationRate, long acquisitionTime) {
        this(requireUnit(unit).getUnnormalized(), xRotationRate, yRotationRate,
                zRotationRate, acquisitionTime);
    }

    public AngularVelocity(
            UnnormalizedAngleUnit unit, float xRotationRate, float yRotationRate,
            float zRotationRate, long acquisitionTime) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        this.angleUnit = unit;
        this.xRotationRate = xRotationRate;
        this.yRotationRate = yRotationRate;
        this.zRotationRate = zRotationRate;
        this.acquisitionTime = acquisitionTime;
    }

    public AngularVelocity toAngleUnit(AngleUnit unit) {
        UnnormalizedAngleUnit destination = requireUnit(unit).getUnnormalized();
        return new AngularVelocity(
                destination,
                destination.fromUnit(angleUnit, xRotationRate),
                destination.fromUnit(angleUnit, yRotationRate),
                destination.fromUnit(angleUnit, zRotationRate),
                acquisitionTime);
    }

    @Override public String toString() {
        return String.format(Locale.ROOT, "AngularVelocity(%s %.3f %.3f %.3f)",
                angleUnit, xRotationRate, yRotationRate, zRotationRate);
    }

    private static AngleUnit requireUnit(AngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        return unit;
    }
}
