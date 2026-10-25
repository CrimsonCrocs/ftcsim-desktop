package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.hardware.VoltageSensor;

/** Default Control Hub battery-voltage sensor. */
public final class SimulatorVoltageSensor implements VoltageSensor {
    private double voltage;
    private double currentAmps;

    public SimulatorVoltageSensor(double voltage) {
        applyFeedbackForSimulator(voltage);
    }

    @Override public synchronized double getVoltage() { return voltage; }

    public synchronized void applyFeedbackForSimulator(double voltage) {
        applyFeedbackForSimulator(voltage, 0.0);
    }

    public synchronized void applyFeedbackForSimulator(double voltage, double currentAmps) {
        if (!Double.isFinite(voltage) || voltage < 0 || voltage > 60) {
            throw new IllegalArgumentException("voltage must be finite and from 0 through 60 volts");
        }
        if (!Double.isFinite(currentAmps) || currentAmps < 0) {
            throw new IllegalArgumentException("current must be finite and non-negative");
        }
        this.voltage = voltage;
        this.currentAmps = currentAmps;
    }

    /** Total simulated supply current; FTC's stock VoltageSensor API exposes voltage only. */
    public synchronized double getCurrentAmpsForSimulator() { return currentAmps; }

    @Override public HardwareDevice.Manufacturer getManufacturer() {
        return HardwareDevice.Manufacturer.Lynx;
    }

    @Override public String getDeviceName() { return "FTC Simulator Control Hub Voltage Sensor"; }

    @Override public String getConnectionInfo() { return "simulated Control Hub"; }
}
