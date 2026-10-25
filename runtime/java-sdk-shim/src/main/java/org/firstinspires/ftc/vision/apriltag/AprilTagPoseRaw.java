package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;

/** FTC raw pose ABI; raw OpenCV solver output is not part of the world sensor contract. */
public class AprilTagPoseRaw {
    public final double x, y, z;
    public final MatrixF R;
    public AprilTagPoseRaw(double x, double y, double z, MatrixF rotation) {
        this.x = x; this.y = y; this.z = z; this.R = rotation;
    }
}
