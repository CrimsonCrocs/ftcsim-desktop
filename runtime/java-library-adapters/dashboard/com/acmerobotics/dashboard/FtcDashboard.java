package com.acmerobotics.dashboard;

import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.sim.SimulatorLibraryRuntime;
import org.firstinspires.ftc.sim.SimulatorClock;
import java.lang.reflect.Field;
import java.util.Map;

/** Bridges Dashboard packets to Studio telemetry, retaining real Dashboard canvas operations. */
public final class FtcDashboard {
    private static final FtcDashboard INSTANCE = new FtcDashboard();
    private int interval = 250;
    private FtcDashboard() {}
    public static FtcDashboard getInstance() { return INSTANCE; }
    public boolean isEnabled() { return true; }
    public Telemetry getTelemetry() { return SimulatorLibraryRuntime.telemetry(); }
    public int getTelemetryTransmissionInterval() { return interval; }
    public void setTelemetryTransmissionInterval(int milliseconds) {
        if (milliseconds < 0) throw new IllegalArgumentException("Interval cannot be negative");
        interval = milliseconds; getTelemetry().setMsTransmissionInterval(milliseconds);
    }
    public void clearTelemetry() { getTelemetry().clearAll(); }
    public void sendTelemetryPacket(TelemetryPacket packet) {
        if (packet == null) throw new IllegalArgumentException("Packet cannot be null");
        SimulatorLibraryRuntime.record("dashboard.packet", packet);
        try {
            Field field = TelemetryPacket.class.getDeclaredField("data"); field.setAccessible(true);
            Object data = field.get(packet);
            if (data instanceof Map) {
                int count = 0;
                for (Map.Entry<?, ?> entry : ((Map<?, ?>) data).entrySet()) {
                    if (count++ >= 128) break;
                    getTelemetry().addData(String.valueOf(entry.getKey()), entry.getValue());
                }
            }
            Field log = TelemetryPacket.class.getDeclaredField("log"); log.setAccessible(true);
            Object lines = log.get(packet);
            if (lines instanceof Iterable) {
                int count = 0;
                for (Object line : (Iterable<?>) lines) { if (count++ >= 128) break; getTelemetry().addLine(String.valueOf(line)); }
            }
            getTelemetry().update();
            // The 0.5.x quickstart's waitForIdle loop has no FTC idle call. Its sequence
            // runner publishes one packet per update; that is the cooperative boundary.
            // Iterative OpModes and 1.x Actions retain their own tick scheduling.
            if (Thread.currentThread().getName().equals("ftc-linear-opmode")) {
                for (StackTraceElement frame : Thread.currentThread().getStackTrace()) {
                    if (frame.getClassName().endsWith(".trajectorysequence.TrajectorySequenceRunner")
                            && frame.getMethodName().equals("update")) { SimulatorClock.idle(); break; }
                }
            }
        } catch (ReflectiveOperationException failure) {
            throw new IllegalStateException("Unsupported Dashboard packet layout", failure);
        }
    }
    public void updateConfig() { /* Static configuration values remain the team's actual fields. */ }
}
