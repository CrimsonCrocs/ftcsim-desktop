package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.navigation.Pose3D;
import org.opencv.core.Point;

/** FTC detection data. Pixel-space corners, decoding confidence and localization are unavailable. */
public class AprilTagDetection {
    public final int id;
    public final int hamming;
    public final float decisionMargin;
    public final Point center;
    public final Point[] corners;
    public final AprilTagMetadata metadata;
    public final AprilTagPoseFtc ftcPose;
    public final AprilTagPoseRaw rawPose;
    public final Pose3D robotPose;
    public final long frameAcquisitionNanoTime;

    public AprilTagDetection(int id, int hamming, float decisionMargin, Point center,
            Point[] corners, AprilTagMetadata metadata, AprilTagPoseFtc ftcPose,
            AprilTagPoseRaw rawPose, Pose3D robotPose, long frameAcquisitionNanoTime) {
        this.id = id; this.hamming = hamming; this.decisionMargin = decisionMargin;
        this.center = center; this.corners = corners; this.metadata = metadata;
        this.ftcPose = ftcPose; this.rawPose = rawPose; this.robotPose = robotPose;
        this.frameAcquisitionNanoTime = frameAcquisitionNanoTime;
    }
}
