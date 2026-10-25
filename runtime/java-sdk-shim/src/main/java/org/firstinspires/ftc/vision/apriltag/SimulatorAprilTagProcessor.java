package org.firstinspires.ftc.vision.apriltag;

import android.graphics.Canvas;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.firstinspires.ftc.sim.SimulatorAprilTagObservation;
import org.firstinspires.ftc.sim.SimulatorVisionRuntime;
import org.opencv.core.Mat;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Adapter from visible WorldSensorFrame tags to the FTC AprilTagDetection value contract. */
public final class SimulatorAprilTagProcessor extends AprilTagProcessor {
    private final AprilTagLibrary library;
    private final DistanceUnit distanceUnit;
    private final AngleUnit angleUnit;
    private final Map<Integer, Long> consumedFreshTimes = new LinkedHashMap<Integer, Long>();
    private SimulatorVisionRuntime camera;
    private boolean enabled = true;

    SimulatorAprilTagProcessor(AprilTagLibrary library, DistanceUnit distanceUnit, AngleUnit angleUnit) {
        if (library == null || distanceUnit == null || angleUnit == null) {
            throw new IllegalArgumentException("tag library and output units are required");
        }
        this.library = library;
        this.distanceUnit = distanceUnit;
        this.angleUnit = angleUnit;
    }

    public synchronized void attachForSimulator(SimulatorVisionRuntime runtime) {
        if (runtime == null) throw new IllegalArgumentException("configured camera runtime is required");
        if (camera != null && camera != runtime) {
            throw new IllegalStateException("AprilTagProcessor is already connected to another camera");
        }
        camera = runtime;
    }

    public synchronized void setPortalEnabledForSimulator(boolean value) { enabled = value; }
    public synchronized boolean isEnabledForSimulator() { return enabled; }

    @Override public void setDecimation(float decimation) {
        throw unsupported("image detector decimation; synthetic geometry is already resolved by the world");
    }

    @Override public void setPoseSolver(PoseSolver poseSolver) {
        throw unsupported("native/OpenCV pose solvers; FTC poses are derived from world transforms");
    }

    @Override public int getPerTagAvgPoseSolveTime() {
        throw unsupported("native pose-solver timing; no image pose solver runs in this simulator");
    }

    @Override public ArrayList<AprilTagDetection> getDetections() {
        return detections(false);
    }

    @Override public ArrayList<AprilTagDetection> getFreshDetections() {
        return detections(true);
    }

    private synchronized ArrayList<AprilTagDetection> detections(boolean freshOnly) {
        if (!enabled) return new ArrayList<AprilTagDetection>();
        if (camera == null) throw new IllegalStateException("AprilTagProcessor is not attached to a configured VisionPortal camera");
        List<SimulatorAprilTagObservation> observations = camera.getObservationsForSimulator();
        ArrayList<AprilTagDetection> detections = new ArrayList<AprilTagDetection>();
        for (SimulatorAprilTagObservation observation : observations) {
            Long prior = consumedFreshTimes.get(observation.id);
            if (freshOnly && prior != null && observation.captureTimeMillis <= prior.longValue()) continue;
            AprilTagMetadata metadata = library.lookupTag(observation.id);
            AprilTagPoseFtc pose = metadata == null ? null : makePose(observation);
            long acquisitionTime = Math.multiplyExact(observation.captureTimeMillis, 1_000_000L);
            detections.add(new AprilTagDetection(
                    observation.id,
                    -1,
                    Float.NaN,
                    null,
                    null,
                    metadata,
                    pose,
                    null,
                    null,
                    acquisitionTime));
            if (freshOnly) consumedFreshTimes.put(observation.id, observation.captureTimeMillis);
        }
        return detections;
    }

    private AprilTagPoseFtc makePose(SimulatorAprilTagObservation observation) {
        // Simulation coordinates are +X forward, +Y up, +Z right; FTC is +X right, +Y forward, +Z up.
        double x = distanceUnit.fromMeters(observation.zMeters);
        double y = distanceUnit.fromMeters(observation.xMeters);
        double z = distanceUnit.fromMeters(observation.yMeters);
        double range = distanceUnit.fromMeters(observation.rangeMeters);
        double bearing = angleUnit.fromRadians(observation.bearingRadians);
        double elevation = angleUnit.fromRadians(observation.elevationRadians);
        double[] angles = ftcEuler(observation.qx, observation.qy, observation.qz, observation.qw);
        return new AprilTagPoseFtc(x, y, z,
                angleUnit.fromRadians(angles[2]),
                angleUnit.fromRadians(angles[0]),
                angleUnit.fromRadians(angles[1]),
                range, bearing, elevation);
    }

    private static double[] ftcEuler(double qx, double qy, double qz, double qw) {
        double norm = Math.sqrt(qx*qx + qy*qy + qz*qz + qw*qw);
        if (!(norm > 1e-12) || !Double.isFinite(norm)) {
            throw new IllegalArgumentException("AprilTag rotation quaternion must be nonzero and finite");
        }
        double x = qx / norm, y = qy / norm, z = qz / norm, w = qw / norm;
        double[][] r = {
                { 1 - 2*(y*y + z*z), 2*(x*y - z*w), 2*(x*z + y*w) },
                { 2*(x*y + z*w), 1 - 2*(x*x + z*z), 2*(y*z - x*w) },
                { 2*(x*z - y*w), 2*(y*z + x*w), 1 - 2*(x*x + y*y) }
        };
        // Change basis into FTC camera axes: right=-simZ, forward=simX, up=simY.
        double[][] basis = { { 0, 0, 1 }, { 1, 0, 0 }, { 0, 1, 0 } };
        double[][] transformed = multiply(multiply(basis, r), transpose(basis));
        double rollAboutFtcY = Math.asin(clamp(-transformed[2][0], -1, 1));
        double cos = Math.cos(rollAboutFtcY);
        double pitchAboutFtcX;
        double yawAboutFtcZ;
        if (Math.abs(cos) > 1e-8) {
            pitchAboutFtcX = Math.atan2(transformed[2][1], transformed[2][2]);
            yawAboutFtcZ = Math.atan2(transformed[1][0], transformed[0][0]);
        } else {
            pitchAboutFtcX = Math.atan2(-transformed[1][2], transformed[1][1]);
            yawAboutFtcZ = 0;
        }
        return new double[] { pitchAboutFtcX, rollAboutFtcY, yawAboutFtcZ };
    }

    private static double[][] transpose(double[][] matrix) {
        double[][] result = new double[matrix.length][matrix.length];
        for (int row = 0; row < matrix.length; row++) {
            for (int column = 0; column < matrix.length; column++) result[row][column] = matrix[column][row];
        }
        return result;
    }

    private static double[][] multiply(double[][] left, double[][] right) {
        double[][] result = new double[left.length][right[0].length];
        for (int row = 0; row < left.length; row++) {
            for (int column = 0; column < right[0].length; column++) {
                for (int index = 0; index < right.length; index++) result[row][column] += left[row][index] * right[index][column];
            }
        }
        return result;
    }

    private static double clamp(double value, double minimum, double maximum) {
        return Math.max(minimum, Math.min(maximum, value));
    }

    @Override public void init(int width, int height, CameraCalibration calibration) {
        throw unsupported("native image processor initialization; VisionPortal consumes world observations directly");
    }
    @Override public Object processFrame(Mat frame, long captureTimeNanos) {
        throw unsupported("native OpenCV frame processing; arbitrary camera pipelines are unsupported");
    }
    @Override public void onDrawFrame(Canvas canvas, int onscreenWidth, int onscreenHeight,
            float scaleBmpPxToCanvasPx, float scaleCanvasDensity, Object userContext) {
        throw unsupported("native camera image overlays");
    }
}
