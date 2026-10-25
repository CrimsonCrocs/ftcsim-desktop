package com.acmerobotics.roadrunner.ftc;

import org.firstinspires.ftc.sim.SimulatorLibraryRuntime;

/** Keeps flight records in bounded worker memory rather than Android's on-device log directory. */
public final class FlightRecorder {
    public static final FlightRecorder INSTANCE = new FlightRecorder();
    private FlightRecorder() {}
    public static void write(String channel, Object value) { SimulatorLibraryRuntime.record("roadrunner." + channel, value); }
}
