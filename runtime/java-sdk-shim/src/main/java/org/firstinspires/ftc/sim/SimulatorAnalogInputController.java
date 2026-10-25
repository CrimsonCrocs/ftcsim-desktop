package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.AnalogInputController;
import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.util.SerialNumber;

/** Feeds one FTC AnalogInput with the voltage measured at its configured sensor mount. */
public final class SimulatorAnalogInputController implements AnalogInputController {
    public static final double CONTROL_HUB_ANALOG_MAX_VOLTAGE = 3.3;

    private final String name;
    private double voltage;
    private long sampleTimeMillis = -1;

    public SimulatorAnalogInputController(String name) {
        if (name == null || name.length() == 0) throw new IllegalArgumentException("name cannot be empty");
        this.name = name;
    }

    @Override public synchronized double getAnalogInputVoltage(int channel) {
        if (channel != 0) throw new IllegalArgumentException("This configured sensor has one channel");
        requireSample();
        return voltage;
    }

    @Override public double getMaxAnalogInputVoltage() { return CONTROL_HUB_ANALOG_MAX_VOLTAGE; }

    @Override public SerialNumber getSerialNumber() { return SerialNumber.createFake(); }

    public synchronized void applyFeedbackForSimulator(double voltage, long sampleTimeMillis) {
        if (!Double.isFinite(voltage) || voltage < 0 || voltage > CONTROL_HUB_ANALOG_MAX_VOLTAGE) {
            throw new IllegalArgumentException("analog voltage must be within 0..3.3 V");
        }
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        this.voltage = voltage;
        this.sampleTimeMillis = sampleTimeMillis;
    }

    public synchronized long getSampleTimeMillisForSimulator() { return sampleTimeMillis; }

    @Override public HardwareDevice.Manufacturer getManufacturer() { return HardwareDevice.Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "FTC Simulator Analog Input Controller"; }
    @Override public String getConnectionInfo() { return "simulated analog channel '" + name + "'"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}

    private void requireSample() {
        if (sampleTimeMillis < 0) {
            throw new IllegalStateException("No analog sensor frame has been applied for '" + name + "'");
        }
    }
}
