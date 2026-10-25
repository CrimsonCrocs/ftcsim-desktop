package com.qualcomm.robotcore.hardware;
/** Digital contact switch. A configured digital sensor is active low. */
public interface TouchSensor extends HardwareDevice {
    double getValue();
    boolean isPressed();
}
