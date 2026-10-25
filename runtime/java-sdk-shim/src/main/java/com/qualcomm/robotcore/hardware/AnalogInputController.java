package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.util.SerialNumber;

/** FTC 11.1 analog controller contract used by the SDK AnalogInput adapter. */
public interface AnalogInputController extends HardwareDevice {
    double getAnalogInputVoltage(int channel);

    double getMaxAnalogInputVoltage();

    SerialNumber getSerialNumber();
}
