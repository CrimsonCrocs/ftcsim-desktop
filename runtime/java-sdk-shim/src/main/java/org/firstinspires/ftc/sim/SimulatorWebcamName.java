package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.util.SerialNumber;
import android.content.Context;
import org.firstinspires.ftc.robotcore.external.function.Continuation;
import org.firstinspires.ftc.robotcore.external.function.Consumer;
import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraCharacteristics;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.internal.system.Deadline;

/** FTC WebcamName backed by an explicitly configured, world-fed simulated camera. */
public final class SimulatorWebcamName implements WebcamName {
    private final String name;
    private final SimulatorVisionRuntime runtime;

    public SimulatorWebcamName(String name, SimulatorVisionRuntime runtime) {
        if (name == null || runtime == null) throw new IllegalArgumentException("camera name and runtime are required");
        this.name = name;
        this.runtime = runtime;
    }

    public SimulatorVisionRuntime getVisionRuntimeForSimulator() { return runtime; }
    public boolean isClosedForSimulator() { return runtime.isClosedForSimulator(); }

    @Override public boolean isWebcam() { return true; }
    @Override public boolean isCameraDirection() { return false; }
    @Override public boolean isSwitchable() { return false; }
    @Override public boolean isUnknown() { return false; }
    @Override public void asyncRequestCameraPermission(Context context, Deadline deadline,
            Continuation<? extends Consumer<Boolean>> continuation) {
        throw new UnsupportedOperationException("World-fed simulator cameras do not use Android camera permissions");
    }
    @Override public boolean requestCameraPermission(Deadline deadline) {
        throw new UnsupportedOperationException("World-fed simulator cameras do not use Android camera permissions");
    }
    @Override public CameraCharacteristics getCameraCharacteristics() {
        throw new UnsupportedOperationException("The world camera frame does not include pixel resolutions or camera modes");
    }

    @Override public SerialNumber getSerialNumber() {
        throw new UnsupportedOperationException("A world-fed camera has no USB serial number");
    }

    @Override public String getUsbDeviceNameIfAttached() {
        throw new UnsupportedOperationException("A world-fed camera has no attached USB device name");
    }

    @Override public boolean isAttached() { return !runtime.isClosedForSimulator(); }

    @Override public HardwareDevice.Manufacturer getManufacturer() { return HardwareDevice.Manufacturer.Other; }
    @Override public String getDeviceName() { return "FTC Simulator world-fed webcam"; }
    @Override public String getConnectionInfo() { return "WorldSensorFrame camera '" + name + "'"; }
    @Override public int getVersion() { return 1; }
    @Override public void resetDeviceConfigurationForOpMode() {
        throw new UnsupportedOperationException("A world-fed camera has no USB device configuration to reset");
    }
    @Override public void close() { runtime.closeForSimulator(); }
}
