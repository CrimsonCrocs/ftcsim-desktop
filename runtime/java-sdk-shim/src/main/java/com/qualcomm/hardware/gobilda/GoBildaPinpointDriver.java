package com.qualcomm.hardware.gobilda;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;
import org.firstinspires.ftc.robotcore.external.navigation.UnnormalizedAngleUnit;

/**
 * FTC 11.1 GoBilda Pinpoint API adapter backed by parent-world odometry frames.
 *
 * <p>This mirrors the public FTC hardware API, while transport, I2C registers, calibration
 * hardware and raw pod counters remain unavailable. Pose and velocity observations are fed from
 * the configured Pinpoint sensor's simulated physical state.</p>
 */
public class GoBildaPinpointDriver implements HardwareDevice {
    public enum GoBildaOdometryPods { goBILDA_SWINGARM_POD, goBILDA_4_BAR_POD }
    public enum EncoderDirection { FORWARD, REVERSED }
    public enum DeviceStatus {
        NOT_READY, READY, CALIBRATING, FAULT_X_POD_NOT_DETECTED, FAULT_Y_POD_NOT_DETECTED,
        FAULT_NO_PODS_DETECTED, FAULT_IMU_RUNAWAY, FAULT_BAD_READ
    }
    public enum ErrorDetectionType { NONE, CRC, LOCAL_TEST }
    public enum ReadData { ONLY_UPDATE_HEADING }
    public enum Register {
        DEVICE_ID, DEVICE_VERSION, DEVICE_STATUS, DEVICE_CONTROL, LOOP_TIME, X_ENCODER_VALUE,
        Y_ENCODER_VALUE, X_POSITION, Y_POSITION, H_ORIENTATION, X_VELOCITY, Y_VELOCITY,
        H_VELOCITY, MM_PER_TICK, X_POD_OFFSET, Y_POD_OFFSET, YAW_SCALAR, BULK_READ,
        QUATERNION_W, QUATERNION_X, QUATERNION_Y, QUATERNION_Z, PITCH, ROLL, SET_BULK_READ
    }

    private double xMeters, yMeters, headingRadians;
    private double xVelocity, yVelocity, headingVelocity;
    private double pitchRadians, rollRadians;
    private double xPositionOffset, yPositionOffset, headingOffset;
    private double xPodOffset, yPodOffset, yawScalar = 1.0;
    private double ticksPerMeter;
    private double rawXDistance, rawYDistance;
    private EncoderDirection xDirection = EncoderDirection.FORWARD;
    private EncoderDirection yDirection = EncoderDirection.FORWARD;
    private GoBildaOdometryPods resolution = GoBildaOdometryPods.goBILDA_4_BAR_POD;
    private ErrorDetectionType errorDetectionType = ErrorDetectionType.NONE;
    private Register[] bulkReadScope = new Register[0];
    private long sampleTimeMillis = -1;
    private long previousSampleTimeMillis = -1;
    private long acquisitionTimeNanos;

    public GoBildaPinpointDriver() {}

    public synchronized void applyFeedbackForSimulator(
            double xMeters,
            double yMeters,
            double headingRadians,
            double xVelocity,
            double yVelocity,
            double headingVelocity,
            double pitchRadians,
            double rollRadians,
            long sampleTimeMillis) {
        finite(xMeters, "x"); finite(yMeters, "y"); finite(headingRadians, "heading");
        finite(xVelocity, "x velocity"); finite(yVelocity, "y velocity");
        finite(headingVelocity, "heading velocity"); finite(pitchRadians, "pitch");
        finite(rollRadians, "roll");
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        if (this.sampleTimeMillis >= 0 && sampleTimeMillis < this.sampleTimeMillis) {
            throw new IllegalArgumentException("Pinpoint sensor time cannot move backwards");
        }
        previousSampleTimeMillis = this.sampleTimeMillis;
        if (this.sampleTimeMillis >= 0) {
            double turn = AngleUnit.normalizeRadians(headingRadians - this.headingRadians);
            double middleHeading = this.headingRadians + turn * 0.5;
            double dx = xMeters - this.xMeters, dy = yMeters - this.yMeters;
            rawXDistance += Math.cos(middleHeading) * dx + Math.sin(middleHeading) * dy - xPodOffset * turn;
            rawYDistance += -Math.sin(middleHeading) * dx + Math.cos(middleHeading) * dy + yPodOffset * turn;
        }
        this.xMeters = xMeters;
        this.yMeters = yMeters;
        this.headingRadians = headingRadians;
        this.xVelocity = xVelocity;
        this.yVelocity = yVelocity;
        this.headingVelocity = headingVelocity;
        this.pitchRadians = pitchRadians;
        this.rollRadians = rollRadians;
        this.sampleTimeMillis = sampleTimeMillis;
        acquisitionTimeNanos = sampleTimeMillis * 1_000_000L;
    }

    public synchronized void update() { requireSample(); }

    public synchronized void update(ReadData ignored) {
        if (ignored == null) throw new IllegalArgumentException("read mode cannot be null");
        requireSample();
    }

    public synchronized void setBulkReadScope(Register... registers) {
        if (registers == null) throw new IllegalArgumentException("registers cannot be null");
        bulkReadScope = registers.clone();
    }

    public synchronized void setErrorDetectionType(ErrorDetectionType type) {
        if (type == null) throw new IllegalArgumentException("error detection type cannot be null");
        errorDetectionType = type;
    }

    public synchronized void setOffsets(double x, double y, DistanceUnit unit) {
        requireFiniteUnit(x, unit, "x offset"); requireFiniteUnit(y, unit, "y offset");
        xPodOffset = unit.toMeters(x);
        yPodOffset = unit.toMeters(y);
    }

    public synchronized void recalibrateIMU() { requireSample(); headingOffset = scaledHeading(); }

    public synchronized void resetPosAndIMU() {
        requireSample();
        xPositionOffset = xMeters;
        yPositionOffset = yMeters;
        headingOffset = scaledHeading();
        rawXDistance = 0; rawYDistance = 0;
    }

    public synchronized void setEncoderDirections(EncoderDirection x, EncoderDirection y) {
        if (x == null || y == null) throw new IllegalArgumentException("encoder direction cannot be null");
        xDirection = x;
        yDirection = y;
    }

    public synchronized void setEncoderResolution(GoBildaOdometryPods pods) {
        if (pods == null) throw new IllegalArgumentException("pod resolution cannot be null");
        resolution = pods;
        ticksPerMeter = (pods == GoBildaOdometryPods.goBILDA_SWINGARM_POD ? 13.26291192 : 19.89436789) * 1000.0;
    }

    public synchronized void setEncoderResolution(double ticksPerUnit, DistanceUnit unit) {
        if (!Double.isFinite(ticksPerUnit) || ticksPerUnit <= 0 || unit == null) {
            throw new IllegalArgumentException("encoder resolution must be finite and positive");
        }
        ticksPerMeter = ticksPerUnit / unit.toMeters(1.0);
        resolution = null;
    }

    public synchronized void setYawScalar(double scalar) {
        if (!Double.isFinite(scalar) || scalar <= 0) {
            throw new IllegalArgumentException("yaw scalar must be finite and positive");
        }
        yawScalar = scalar;
    }

    public synchronized void setPosition(Pose2D position) {
        if (position == null) throw new IllegalArgumentException("position cannot be null");
        requireSample();
        xPositionOffset = xMeters - position.getX(DistanceUnit.METER);
        yPositionOffset = yMeters - position.getY(DistanceUnit.METER);
        headingOffset = scaledHeading() - position.getHeading(AngleUnit.RADIANS);
    }

    public synchronized void setPosX(double x, DistanceUnit unit) {
        requireFiniteUnit(x, unit, "x position"); requireSample();
        xPositionOffset = xMeters - unit.toMeters(x);
    }

    public synchronized void setPosY(double y, DistanceUnit unit) {
        requireFiniteUnit(y, unit, "y position"); requireSample();
        yPositionOffset = yMeters - unit.toMeters(y);
    }

    public synchronized void setHeading(double heading, AngleUnit unit) {
        if (unit == null || !Double.isFinite(heading)) throw new IllegalArgumentException("heading must be finite");
        requireSample();
        headingOffset = scaledHeading() - unit.toRadians(heading);
    }

    public int getDeviceID() { throw unsupported("device ID"); }
    public int getDeviceVersion() { throw unsupported("device firmware version"); }
    public synchronized float getYawScalar() { return (float) yawScalar; }
    public synchronized DeviceStatus getDeviceStatus() {
        return sampleTimeMillis >= 0 ? DeviceStatus.READY : DeviceStatus.NOT_READY;
    }
    public synchronized int getLoopTime() {
        requireSample();
        if (previousSampleTimeMillis < 0) return 0;
        long delta = sampleTimeMillis - previousSampleTimeMillis;
        return (int) Math.min(Integer.MAX_VALUE, delta * 1000L);
    }
    public synchronized double getFrequency() {
        int loop = getLoopTime();
        return loop <= 0 ? 0.0 : 1_000_000.0 / loop;
    }
    public synchronized int getEncoderX() { requireSample(); return (int) Math.round(rawXDistance * effectiveTicksPerMeter() * (xDirection == EncoderDirection.FORWARD ? 1 : -1)); }
    public synchronized int getEncoderY() { requireSample(); return (int) Math.round(rawYDistance * effectiveTicksPerMeter() * (yDirection == EncoderDirection.FORWARD ? 1 : -1)); }

    public synchronized double getPosX(DistanceUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromMeters(xMeters - xPositionOffset);
    }
    public synchronized double getPosY(DistanceUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromMeters(yMeters - yPositionOffset);
    }
    public synchronized double getHeading(AngleUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromRadians(scaledHeading() - headingOffset);
    }
    public synchronized double getHeading(UnnormalizedAngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        requireSample(); return unit.fromRadians(scaledHeading() - headingOffset);
    }
    public synchronized double getVelX(DistanceUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromMeters(xVelocity);
    }
    public synchronized double getVelY(DistanceUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromMeters(yVelocity);
    }
    public synchronized double getHeadingVelocity(UnnormalizedAngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        requireSample(); return unit.fromRadians(headingVelocity * yawScalar);
    }
    public synchronized float getXOffset(DistanceUnit unit) {
        requireUnit(unit); return (float) unit.fromMeters(xPodOffset);
    }
    public synchronized float getYOffset(DistanceUnit unit) {
        requireUnit(unit); return (float) unit.fromMeters(yPodOffset);
    }
    public synchronized Pose2D getPosition() {
        requireSample();
        return new Pose2D(DistanceUnit.METER, xMeters - xPositionOffset,
                yMeters - yPositionOffset, AngleUnit.RADIANS, scaledHeading() - headingOffset);
    }
    public synchronized Quaternion getQuaternion() {
        requireSample();
        double yaw = scaledHeading();
        double cy = Math.cos(yaw * 0.5), sy = Math.sin(yaw * 0.5);
        double cp = Math.cos(pitchRadians * 0.5), sp = Math.sin(pitchRadians * 0.5);
        double cr = Math.cos(rollRadians * 0.5), sr = Math.sin(rollRadians * 0.5);
        return new Quaternion(
                (float) (cr * cp * cy + sr * sp * sy),
                (float) (sr * cp * cy - cr * sp * sy),
                (float) (cr * sp * cy + sr * cp * sy),
                (float) (cr * cp * sy - sr * sp * cy),
                acquisitionTimeNanos);
    }
    public synchronized double getPitch(AngleUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromRadians(pitchRadians);
    }
    public synchronized double getRoll(AngleUnit unit) {
        requireUnit(unit); requireSample(); return unit.fromRadians(rollRadians);
    }

    @Override public Manufacturer getManufacturer() { return Manufacturer.GoBilda; }
    @Override public String getDeviceName() { return "goBILDA Pinpoint Odometry Computer (simulated)"; }
    @Override public String getConnectionInfo() { return "simulated Pinpoint odometry frame"; }

    private double scaledHeading() { return headingRadians * yawScalar; }
    private double effectiveTicksPerMeter() { return ticksPerMeter > 0 ? ticksPerMeter : 19894.36789; }
    private void requireSample() {
        if (sampleTimeMillis < 0) throw new IllegalStateException("No Pinpoint frame has been applied");
    }
    private static void requireUnit(DistanceUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
    }
    private static void requireUnit(AngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
    }
    private static void requireFiniteUnit(double value, DistanceUnit unit, String field) {
        if (!Double.isFinite(value) || unit == null) throw new IllegalArgumentException(field + " must be finite");
    }
    private static UnsupportedOperationException unsupported(String field) {
        return new UnsupportedOperationException("The simulator does not provide " + field);
    }
    private static void finite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }
}
