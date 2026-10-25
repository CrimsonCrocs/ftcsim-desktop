package com.qualcomm.robotcore.util;

import java.io.Serializable;

/** Minimal serial-number value needed by the SDK sensor controller interfaces. */
public abstract class SerialNumber implements Serializable {
    private static final long serialVersionUID = 1L;

    public abstract String getString();

    public static SerialNumber createFake() {
        return new SimulatedSerialNumber("FTC-SIM");
    }

    private static final class SimulatedSerialNumber extends SerialNumber {
        private static final long serialVersionUID = 1L;
        private final String value;

        SimulatedSerialNumber(String value) { this.value = value; }

        @Override public String getString() { return value; }

        @Override public String toString() { return value; }
    }
}
