package org.firstinspires.ftc.robotcore.external.navigation;

/** FTC field-pose ABI; world frames do not currently expose AprilTag field localization. */
public class Pose3D {
    protected final Position position;
    protected final YawPitchRollAngles orientation;
    public Pose3D(Position position, YawPitchRollAngles orientation) {
        this.position = position; this.orientation = orientation;
    }
    public YawPitchRollAngles getOrientation() { return orientation; }
    public Position getPosition() { return position; }
}
