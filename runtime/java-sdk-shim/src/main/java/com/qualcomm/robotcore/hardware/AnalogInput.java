package com.qualcomm.robotcore.hardware;

/** Binary-compatible subset of the FTC 11.1 AnalogInput adapter. */
public class AnalogInput implements HardwareDevice {
    private final AnalogInputController controller;
    private final int channel;

    public AnalogInput(AnalogInputController controller, int channel) {
        if (controller == null) throw new IllegalArgumentException("controller cannot be null");
        if (channel < 0) throw new IllegalArgumentException("channel cannot be negative");
        this.controller = controller;
        this.channel = channel;
    }

    @Override public Manufacturer getManufacturer() { return Manufacturer.Lynx; }

    public double getVoltage() { return controller.getAnalogInputVoltage(channel); }

    public double getMaxVoltage() { return controller.getMaxAnalogInputVoltage(); }

    @Override public String getDeviceName() { return "FTC Simulator Analog Input"; }

    @Override public String getConnectionInfo() { return "simulated analog channel " + channel; }

    @Override public int getVersion() { return 1; }

    @Override public void resetDeviceConfigurationForOpMode() {}

    @Override public void close() {}
}
