package com.qualcomm.robotcore.hardware;

/** FTC 11.1 raw color sensor contract. */
public interface ColorSensor extends HardwareDevice {
    int red();
    int green();
    int blue();
    int alpha();
    int argb();
    void enableLed(boolean enable);
    void setI2cAddress(I2cAddr address);
    I2cAddr getI2cAddress();
}
