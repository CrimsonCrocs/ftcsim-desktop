package org.firstinspires.ftc.robotcore.external.hardware.camera;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import com.qualcomm.robotcore.util.SerialNumber;

/** FTC SDK webcam contract; simulator instances bind to named world camera streams. */
public interface WebcamName extends CameraName, HardwareDevice {
    SerialNumber getSerialNumber();
    String getUsbDeviceNameIfAttached();
    boolean isAttached();
}
