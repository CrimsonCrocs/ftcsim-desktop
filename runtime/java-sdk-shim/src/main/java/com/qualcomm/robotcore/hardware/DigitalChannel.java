package com.qualcomm.robotcore.hardware;

/** FTC 11.1 DigitalChannel contract used by input sensors and output pins. */
public interface DigitalChannel extends HardwareDevice {
    enum Mode { INPUT, OUTPUT }

    Mode getMode();

    void setMode(Mode mode);

    boolean getState();

    void setState(boolean state);

    void setMode(DigitalChannelController.Mode mode);
}
