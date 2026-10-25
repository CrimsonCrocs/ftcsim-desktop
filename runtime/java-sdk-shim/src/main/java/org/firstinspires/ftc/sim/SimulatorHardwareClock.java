package org.firstinspires.ftc.sim;

/** Virtual Pinpoint recalibration is synchronous; its hardware settling delay is already complete. */
public final class SimulatorHardwareClock {
    private SimulatorHardwareClock() {}
    public static void sleep(long milliseconds) {
        if (milliseconds < 0) throw new IllegalArgumentException("Duration cannot be negative");
    }
    public static void sleep(long milliseconds, int nanoseconds) {
        if (nanoseconds < 0 || nanoseconds > 999999) throw new IllegalArgumentException("Invalid nanoseconds");
        sleep(milliseconds);
    }
}
