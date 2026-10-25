package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.util.SerialNumber;

/** FTC 11.1 controller shape needed by DigitalChannel binary references. */
public interface DigitalChannelController extends HardwareDevice {
    enum Mode {
        INPUT, OUTPUT;

        public DigitalChannel.Mode migrate() {
            return this == INPUT ? DigitalChannel.Mode.INPUT : DigitalChannel.Mode.OUTPUT;
        }
    }

    SerialNumber getSerialNumber();

    DigitalChannel.Mode getDigitalChannelMode(int channel);

    void setDigitalChannelMode(int channel, DigitalChannel.Mode mode);

    void setDigitalChannelMode(int channel, Mode mode);

    boolean getDigitalChannelState(int channel);

    void setDigitalChannelState(int channel, boolean state);
}
