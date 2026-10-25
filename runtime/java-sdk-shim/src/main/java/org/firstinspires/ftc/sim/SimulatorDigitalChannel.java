package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.DigitalChannelController;
import com.qualcomm.robotcore.hardware.HardwareDevice;

/** Digital input/output pin whose input level is set by the timestamped world frame. */
public final class SimulatorDigitalChannel implements DigitalChannel, com.qualcomm.robotcore.hardware.TouchSensor {
    private final String name;
    private Mode mode = Mode.INPUT;
    private boolean sensorState;
    private boolean outputState;
    private long sampleTimeMillis = -1;

    public SimulatorDigitalChannel(String name) {
        if (name == null || name.length() == 0) throw new IllegalArgumentException("name cannot be empty");
        this.name = name;
    }

    @Override public synchronized Mode getMode() { return mode; }

    @Override public synchronized void setMode(Mode mode) {
        if (mode == null) throw new IllegalArgumentException("mode cannot be null");
        this.mode = mode;
    }

    @Override public synchronized void setMode(DigitalChannelController.Mode mode) {
        if (mode == null) throw new IllegalArgumentException("mode cannot be null");
        setMode(mode.migrate());
    }

    @Override public synchronized boolean getState() {
        if (mode == Mode.OUTPUT) return outputState;
        requireSample();
        return sensorState;
    }

    @Override public synchronized boolean isPressed() {
        if(mode!=Mode.INPUT)throw new IllegalStateException("Touch sensor requires digital INPUT mode");
        return !getState();
    }
    @Override public double getValue() { return isPressed()?1.0:0.0; }

    @Override public synchronized void setState(boolean state) {
        if (mode != Mode.OUTPUT) {
            throw new IllegalStateException("Digital input '" + name + "' cannot be driven");
        }
        outputState = state;
    }

    public synchronized void applyFeedbackForSimulator(boolean state, long sampleTimeMillis) {
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        sensorState = state;
        this.sampleTimeMillis = sampleTimeMillis;
    }

    public synchronized long getSampleTimeMillisForSimulator() { return sampleTimeMillis; }

    public synchronized boolean getOutputStateForSimulator() { return outputState; }

    public synchronized void neutralizeForSimulator() { outputState = false; }

    @Override public HardwareDevice.Manufacturer getManufacturer() { return HardwareDevice.Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "FTC Simulator Digital Channel"; }
    @Override public String getConnectionInfo() { return "simulated digital channel '" + name + "'"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}

    private void requireSample() {
        if (sampleTimeMillis < 0) {
            throw new IllegalStateException("No digital sensor frame has been applied for '" + name + "'");
        }
    }
}
