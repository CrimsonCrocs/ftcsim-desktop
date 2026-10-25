package com.acmerobotics.roadrunner.ftc;

import com.acmerobotics.dashboard.FtcDashboard;
import com.acmerobotics.dashboard.canvas.Canvas;
import com.acmerobotics.dashboard.telemetry.TelemetryPacket;
import com.acmerobotics.roadrunner.Action;
import org.firstinspires.ftc.sim.SimulatorClock;

/** Runs the team's real actions once per world tick, including Sequential/Parallel/Sleep actions. */
public final class Actions {
    private Actions() {}
    public static void runBlocking(Action action) {
        if (action == null) throw new IllegalArgumentException("Action cannot be null");
        Canvas preview = new Canvas(); action.preview(preview);
        while (!Thread.currentThread().isInterrupted()) {
            TelemetryPacket packet = new TelemetryPacket();
            packet.fieldOverlay().getOperations().addAll(preview.getOperations());
            boolean running = action.run(packet);
            FtcDashboard.getInstance().sendTelemetryPacket(packet);
            if (!running) return;
            SimulatorClock.idle();
        }
    }
}
