package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Position;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.vision.VisionProcessor;
import java.util.ArrayList;

/** FTC 11.1 AprilTagProcessor ABI with an executable world-observation-backed subset. */
public abstract class AprilTagProcessor implements VisionProcessor {
    public static final int THREADS_DEFAULT = 3;
    public AprilTagProcessor() {}
    public static AprilTagProcessor easyCreateWithDefaults() { return new Builder().build(); }
    public abstract void setDecimation(float decimation);
    public abstract void setPoseSolver(PoseSolver poseSolver);
    public abstract int getPerTagAvgPoseSolveTime();
    public abstract ArrayList<AprilTagDetection> getDetections();
    public abstract ArrayList<AprilTagDetection> getFreshDetections();

    public enum TagFamily { TAG_36h11, TAG_25h9, TAG_16h5, TAG_standard41h12 }
    public enum PoseSolver {
        APRILTAG_BUILTIN, OPENCV_ITERATIVE, OPENCV_SOLVEPNP_EPNP,
        OPENCV_IPPE, OPENCV_IPPE_SQUARE, OPENCV_SQPNP
    }

    public static class Builder {
        private AprilTagLibrary library = AprilTagGameDatabase.getCurrentGameTagLibrary();
        private DistanceUnit distanceUnit = DistanceUnit.INCH;
        private AngleUnit angleUnit = AngleUnit.DEGREES;
        private TagFamily family = TagFamily.TAG_36h11;

        public Builder() {}

        public Builder setCameraPose(Position position, YawPitchRollAngles orientation) {
            throw unsupported("camera extrinsics; camera pose is already configured in the world");
        }
        public Builder setLensIntrinsics(double fx, double fy, double cx, double cy) {
            throw unsupported("pixel lens intrinsics; the world frame has no image projection");
        }
        public Builder setSuppressCalibrationWarnings(boolean suppress) {
            throw unsupported("native image calibration warnings");
        }
        public Builder setTagFamily(TagFamily value) {
            if (value != TagFamily.TAG_36h11) {
                throw unsupported("AprilTag family " + value + "; BIOBUZZ uses 36h11");
            }
            family = value;
            return this;
        }
        public Builder setTagLibrary(AprilTagLibrary value) {
            if (value == null) throw new IllegalArgumentException("tag library cannot be null");
            library = value;
            return this;
        }
        public Builder setOutputUnits(DistanceUnit distance, AngleUnit angle) {
            if (distance == null || angle == null) throw new IllegalArgumentException("pose output units cannot be null");
            distanceUnit = distance;
            angleUnit = angle;
            return this;
        }
        public Builder setDrawAxes(boolean draw) { throw unsupported("camera image overlays"); }
        public Builder setDrawCubeProjection(boolean draw) { throw unsupported("camera image overlays"); }
        public Builder setDrawTagOutline(boolean draw) { throw unsupported("camera image overlays"); }
        public Builder setDrawTagID(boolean draw) { throw unsupported("camera image overlays"); }
        public Builder setNumThreads(int count) { throw unsupported("native AprilTag worker threads"); }

        public AprilTagProcessor build() {
            if (family != TagFamily.TAG_36h11) throw unsupported("AprilTag family " + family);
            return new SimulatorAprilTagProcessor(library, distanceUnit, angleUnit);
        }
    }

    static UnsupportedOperationException unsupported(String capability) {
        return new UnsupportedOperationException("FTC Simulator does not support " + capability);
    }
}
