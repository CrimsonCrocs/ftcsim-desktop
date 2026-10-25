package com.qualcomm.robotcore.hardware;

/** Control/Expansion Hub supply-voltage surface. */
public interface VoltageSensor extends HardwareDevice {
    double getVoltage();
}
