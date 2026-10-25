package com.qualcomm.robotcore.hardware;

/** FTC 11.1 normalized color sensor contract. */
public interface NormalizedColorSensor extends HardwareDevice {
    NormalizedRGBA getNormalizedColors();
    float getGain();
    void setGain(float gain);
}
