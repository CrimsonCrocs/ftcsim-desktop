package org.firstinspires.ftc.teamcode;

import java.util.function.LongSupplier;

public final class SimulationClockProbe {
    public static long nanos() { return System.nanoTime(); }
    public static long millis() { return System.currentTimeMillis(); }
    public static LongSupplier reference() { return System::nanoTime; }
    public static String literal() { return "java/lang/System"; }
    public static String lineSeparator() { return System.lineSeparator(); }
    public static void sleep() throws InterruptedException { Thread.sleep(25); }
}
