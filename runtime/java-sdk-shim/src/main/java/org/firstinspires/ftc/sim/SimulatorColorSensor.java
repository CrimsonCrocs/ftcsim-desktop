package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.ColorSensor;
import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.hardware.I2cAddr;
import com.qualcomm.robotcore.hardware.NormalizedColorSensor;
import com.qualcomm.robotcore.hardware.NormalizedRGBA;

/** Color sensor whose RGBA readings come from the parent world observation. */
public final class SimulatorColorSensor implements ColorSensor, NormalizedColorSensor {
    private final String name;
    private int red;
    private int green;
    private int blue;
    private int alpha;
    private float gain = 1.0f;
    private I2cAddr i2cAddress;
    private long sampleTimeMillis = -1;

    public SimulatorColorSensor(String name) {
        if (name == null || name.length() == 0) throw new IllegalArgumentException("name cannot be empty");
        this.name = name;
    }

    @Override public synchronized int red() { requireSample(); return red; }
    @Override public synchronized int green() { requireSample(); return green; }
    @Override public synchronized int blue() { requireSample(); return blue; }
    @Override public synchronized int alpha() { requireSample(); return alpha; }

    @Override public synchronized int argb() {
        requireSample();
        return (alpha << 24) | (red << 16) | (green << 8) | blue;
    }

    @Override public synchronized NormalizedRGBA getNormalizedColors() {
        requireSample();
        NormalizedRGBA colors = new NormalizedRGBA();
        colors.red = normalize(red);
        colors.green = normalize(green);
        colors.blue = normalize(blue);
        colors.alpha = normalize(alpha);
        return colors;
    }

    @Override public synchronized float getGain() { return gain; }

    @Override public synchronized void setGain(float gain) {
        if (!Float.isFinite(gain) || gain <= 0) throw new IllegalArgumentException("gain must be finite and positive");
        this.gain = gain;
    }

    @Override public synchronized void enableLed(boolean enable) {
        throw new UnsupportedOperationException("The simulation color sensor has no controllable LED");
    }

    @Override public synchronized void setI2cAddress(I2cAddr address) {
        if (address == null) throw new IllegalArgumentException("address cannot be null");
        i2cAddress = address;
    }

    @Override public synchronized I2cAddr getI2cAddress() {
        if (i2cAddress == null) {
            throw new IllegalStateException("No I2C address was configured for color sensor '" + name + "'");
        }
        return i2cAddress;
    }

    public synchronized void applyFeedbackForSimulator(
            int red, int green, int blue, int alpha, long sampleTimeMillis) {
        this.red = channel(red, "red");
        this.green = channel(green, "green");
        this.blue = channel(blue, "blue");
        this.alpha = channel(alpha, "alpha");
        if (sampleTimeMillis < 0) throw new IllegalArgumentException("sample time cannot be negative");
        this.sampleTimeMillis = sampleTimeMillis;
    }

    public synchronized long getSampleTimeMillisForSimulator() { return sampleTimeMillis; }

    @Override public HardwareDevice.Manufacturer getManufacturer() { return HardwareDevice.Manufacturer.Lynx; }
    @Override public String getDeviceName() { return "FTC Simulator Color Sensor"; }
    @Override public String getConnectionInfo() { return "simulated color sensor '" + name + "'"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {}
    @Override public void close() {}

    private float normalize(int channel) {
        return Math.max(0.0f, Math.min(1.0f, channel / 255.0f * gain));
    }

    private static int channel(int value, String field) {
        if (value < 0 || value > 255) throw new IllegalArgumentException(field + " channel must be 0..255");
        return value;
    }

    private void requireSample() {
        if (sampleTimeMillis < 0) {
            throw new IllegalStateException("No color sensor frame has been applied for '" + name + "'");
        }
    }
}
