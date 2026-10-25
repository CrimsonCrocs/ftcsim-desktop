package org.firstinspires.ftc.robotcore.external.navigation;

import java.util.Locale;

/** FTC SDK camera orientation value type. */
public class YawPitchRollAngles {
    private final AngleUnit unit;
    private final double yaw, pitch, roll;
    private final long acquisitionTime;
    public YawPitchRollAngles(AngleUnit unit, double yaw, double pitch, double roll, long acquisitionTime) {
        this.unit = unit; this.yaw = yaw; this.pitch = pitch; this.roll = roll; this.acquisitionTime = acquisitionTime;
    }
    public double getYaw() { return yaw; }
    public double getYaw(AngleUnit requested) { return requested.fromRadians(unit.toRadians(yaw)); }
    public double getPitch() { return pitch; }
    public double getPitch(AngleUnit requested) { return requested.fromRadians(unit.toRadians(pitch)); }
    public double getRoll() { return roll; }
    public double getRoll(AngleUnit requested) { return requested.fromRadians(unit.toRadians(roll)); }
    public long getAcquisitionTime() { return acquisitionTime; }

    @Override
    public String toString() {
        return String.format(Locale.US, "{yaw=%.3f, pitch=%.3f, roll=%.3f}",
                unit.toDegrees(yaw), unit.toDegrees(pitch), unit.toDegrees(roll));
    }
}
