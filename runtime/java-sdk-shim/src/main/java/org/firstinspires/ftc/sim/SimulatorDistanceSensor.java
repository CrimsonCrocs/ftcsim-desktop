package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/** Range sensor fed from collision-aware distance observations in the simulation world. */
public final class SimulatorDistanceSensor implements DistanceSensor {
    private final String name;
    private double distanceMeters;
    private long sampleTimeMillis = -1;

    public SimulatorDistanceSensor(String name) {
        if (name == null || name.length() == 0) throw new IllegalArgumentException("name cannot be empty");
        this.name = name;
    }

    @Override public synchronized double getDistance(DistanceUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        requireSample();
        return unit.fromMeters(distanceMeters);
    }

    public synchronized void applyFeedbackForSimulator(double distanceMeters, long sampleTimeMillis) {
        if (!Double.isFinite(distanceMeters) || distanceMeters < 0) {
            throw new IllegalArgumentException("distance must be finite and non-negative");
        }
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        this.distanceMeters = distanceMeters;
        this.sampleTimeMillis = sampleTimeMillis;
    }

    public synchronized long getSampleTimeMillisForSimulator() { return sampleTimeMillis; }

    @Override public HardwareDevice.Manufacturer getManufacturer() { return HardwareDevice.Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "FTC Simulator Distance Sensor"; }
    @Override public String getConnectionInfo() { return "simulated range sensor '" + name + "'"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}

    private void requireSample() {
        if (sampleTimeMillis < 0) {
            throw new IllegalStateException("No distance sensor frame has been applied for '" + name + "'");
        }
    }
}
