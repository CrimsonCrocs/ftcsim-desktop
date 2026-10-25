package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.hardware.IMU;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngularVelocity;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

/** Default Control Hub IMU driven exclusively by browser rigid-body feedback. */
public final class SimulatorIMU implements IMU {
    private Parameters parameters = new Parameters(null);
    private double yawRadians;
    private double pitchRadians;
    private double rollRadians;
    private double yawOffsetRadians;
    private double xRateRadiansPerSecond;
    private double yRateRadiansPerSecond;
    private double zRateRadiansPerSecond;
    private long acquisitionTime;

    @Override public synchronized boolean initialize(Parameters parameters) {
        if (parameters == null) throw new IllegalArgumentException("parameters cannot be null");
        this.parameters = parameters.copy();
        yawOffsetRadians = yawRadians;
        return true;
    }

    @Override public synchronized void resetYaw() { yawOffsetRadians = yawRadians; }

    @Override public synchronized YawPitchRollAngles getRobotYawPitchRollAngles() {
        return new YawPitchRollAngles(
                AngleUnit.RADIANS,
                AngleUnit.normalizeRadians(yawRadians - yawOffsetRadians),
                pitchRadians,
                rollRadians,
                acquisitionTime);
    }

    @Override public synchronized AngularVelocity getRobotAngularVelocity(AngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        return new AngularVelocity(
                unit,
                (float) unit.getUnnormalized().fromRadians(xRateRadiansPerSecond),
                (float) unit.getUnnormalized().fromRadians(yRateRadiansPerSecond),
                (float) unit.getUnnormalized().fromRadians(zRateRadiansPerSecond),
                acquisitionTime);
    }

    @Override public synchronized Quaternion getRobotOrientationAsQuaternion() {
        double cy = Math.cos((yawRadians-yawOffsetRadians)/2), sy = Math.sin((yawRadians-yawOffsetRadians)/2);
        double cp = Math.cos(pitchRadians/2), sp = Math.sin(pitchRadians/2);
        double cr = Math.cos(rollRadians/2), sr = Math.sin(rollRadians/2);
        return new Quaternion((float)(cr*cp*cy+sr*sp*sy), (float)(sr*cp*cy-cr*sp*sy),
                (float)(cr*sp*cy+sr*cp*sy), (float)(cr*cp*sy-sr*sp*cy), Math.max(1L, acquisitionTime));
    }

    @Override public synchronized org.firstinspires.ftc.robotcore.external.navigation.Orientation getRobotOrientation(
            org.firstinspires.ftc.robotcore.external.navigation.AxesReference reference,
            org.firstinspires.ftc.robotcore.external.navigation.AxesOrder order,AngleUnit unit) {
        return getRobotOrientationAsQuaternion().toOrientation(reference,order,unit);
    }

    public synchronized void applyFeedbackForSimulator(
            double yawRadians,
            double pitchRadians,
            double rollRadians,
            double xRateRadiansPerSecond,
            double yRateRadiansPerSecond,
            double zRateRadiansPerSecond,
            long acquisitionTime) {
        requireFinite(yawRadians, "yaw");
        requireFinite(pitchRadians, "pitch");
        requireFinite(rollRadians, "roll");
        requireFinite(xRateRadiansPerSecond, "x angular rate");
        requireFinite(yRateRadiansPerSecond, "y angular rate");
        requireFinite(zRateRadiansPerSecond, "z angular rate");
        this.yawRadians = yawRadians;
        this.pitchRadians = pitchRadians;
        this.rollRadians = rollRadians;
        this.xRateRadiansPerSecond = xRateRadiansPerSecond;
        this.yRateRadiansPerSecond = yRateRadiansPerSecond;
        this.zRateRadiansPerSecond = zRateRadiansPerSecond;
        this.acquisitionTime = acquisitionTime;
    }

    @Override public HardwareDevice.Manufacturer getManufacturer() {
        return HardwareDevice.Manufacturer.Lynx;
    }

    @Override public String getDeviceName() { return "FTC Simulator Control Hub IMU"; }

    @Override public String getConnectionInfo() { return "simulated Control Hub"; }

    @Override public synchronized void resetDeviceConfigurationForOpMode() {
        parameters = new Parameters(null);
        yawOffsetRadians = yawRadians;
    }

    private static void requireFinite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }
}
