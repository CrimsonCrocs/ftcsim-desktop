package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.HardwareDevice;

/** Configured odometry observation with pose and velocity in the simulator's world frame. */
public final class SimulatorOdometrySensor implements HardwareDevice {
    private final String name;
    private double xMeters, yMeters, headingRadians, xVelocity, yVelocity, angularVelocity;
    private long sampleTimeMillis = -1;

    public SimulatorOdometrySensor(String name) {
        if (name == null || name.length() == 0) throw new IllegalArgumentException("name cannot be empty");
        this.name = name;
    }

    public synchronized double getXPositionMeters() { requireSample(); return xMeters; }
    public synchronized double getYPositionMeters() { requireSample(); return yMeters; }
    public synchronized double getHeadingRadians() { requireSample(); return headingRadians; }
    public synchronized double getXVelocityMetersPerSecond() { requireSample(); return xVelocity; }
    public synchronized double getYVelocityMetersPerSecond() { requireSample(); return yVelocity; }
    public synchronized double getAngularVelocityRadiansPerSecond() { requireSample(); return angularVelocity; }
    public synchronized long getSampleTimeMillis() { requireSample(); return sampleTimeMillis; }

    public synchronized void applyFeedbackForSimulator(
            double xMeters,
            double yMeters,
            double headingRadians,
            double xVelocity,
            double yVelocity,
            double angularVelocity,
            long sampleTimeMillis) {
        finite(xMeters, "x"); finite(yMeters, "y"); finite(headingRadians, "heading");
        finite(xVelocity, "x velocity"); finite(yVelocity, "y velocity");
        finite(angularVelocity, "angular velocity");
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        this.xMeters = xMeters;
        this.yMeters = yMeters;
        this.headingRadians = headingRadians;
        this.xVelocity = xVelocity;
        this.yVelocity = yVelocity;
        this.angularVelocity = angularVelocity;
        this.sampleTimeMillis = sampleTimeMillis;
    }

    @Override public Manufacturer getManufacturer() { return Manufacturer.Other; }
    @Override public String getDeviceName() { return "FTC Simulator Odometry Observation"; }
    @Override public String getConnectionInfo() { return "simulated odometry '" + name + "'"; }

    private void requireSample() {
        if (sampleTimeMillis < 0) {
            throw new IllegalStateException("No odometry frame has been applied for '" + name + "'");
        }
    }

    private static void finite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }
}
