package org.firstinspires.ftc.vision.apriltag;

/** FTC SDK AprilTag pose values, computed from timestamped simulator world observations. */
public class AprilTagPoseFtc {
    public final double x, y, z, yaw, pitch, roll, range, bearing, elevation;
    public AprilTagPoseFtc(double x, double y, double z, double yaw, double pitch,
            double roll, double range, double bearing, double elevation) {
        this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.pitch = pitch;
        this.roll = roll; this.range = range; this.bearing = bearing; this.elevation = elevation;
    }
}
