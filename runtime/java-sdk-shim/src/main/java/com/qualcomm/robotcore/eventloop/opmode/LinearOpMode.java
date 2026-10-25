package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.sim.SimulatorClock;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Minimal source-compatible lifecycle surface for Java simulator experiments.
 *
 * <p>This deliberately models only the blocking LinearOpMode control flow used by common TeamCode
 * examples. The public simulator hooks at the end are not part of the FTC SDK; they let the local
 * proof runner supply state without Android dependencies.</p>
 */
public abstract class LinearOpMode extends OpMode {

    private final Object lifecycleLock = new Object();
    private final CountDownLatch waitForStartReached = new CountDownLatch(1);
    private volatile boolean started;
    private volatile boolean stopRequested;

    public abstract void runOpMode() throws InterruptedException;

    @Override public final void init() {}
    @Override public final void init_loop() {}
    @Override public final void start() {}
    @Override public final void loop() {}
    @Override public final void stop() {}

    public void waitForStart() {
        waitForStartReached.countDown();
        synchronized (lifecycleLock) {
            while (!started && !stopRequested) {
                try {
                    lifecycleLock.wait();
                } catch (InterruptedException interrupted) {
                    Thread.currentThread().interrupt();
                    return;
                }
            }
        }
    }

    public final boolean opModeIsActive() {
        return started && !stopRequested && !Thread.currentThread().isInterrupted();
    }

    public final boolean opModeInInit() {
        return !started && !stopRequested;
    }

    public final boolean isStarted() {
        return started || Thread.currentThread().isInterrupted();
    }

    public final boolean isStopRequested() {
        return stopRequested || Thread.currentThread().isInterrupted();
    }

    public final void idle() {
        SimulatorClock.idle();
    }

    public final void sleep(long milliseconds) {
        if (milliseconds < 0) throw new IllegalArgumentException("milliseconds cannot be negative");
        SimulatorClock.sleep(milliseconds);
    }

    // Simulator hooks. They are intentionally explicit rather than pretending to be FTC API.
    @Override public final void initializeForSimulator(
            HardwareMap simulatorHardwareMap,
            Telemetry simulatorTelemetry,
            Gamepad simulatorGamepad1,
            Gamepad simulatorGamepad2) {
        if (simulatorHardwareMap == null || simulatorTelemetry == null
                || simulatorGamepad1 == null || simulatorGamepad2 == null) {
            throw new IllegalArgumentException("Simulator context cannot contain null values");
        }
        super.initializeForSimulator(simulatorHardwareMap, simulatorTelemetry, simulatorGamepad1, simulatorGamepad2);
        started = false;
        stopRequested = false;
        resetRuntime();
    }

    public final boolean awaitWaitForStartForSimulator(long timeout, TimeUnit unit)
            throws InterruptedException {
        return waitForStartReached.await(timeout, unit);
    }

    public final void startForSimulator() {
        synchronized (lifecycleLock) {
            started = true;
            stopRequested = false;
            resetRuntime();
            lifecycleLock.notifyAll();
        }
    }

    public final void stopForSimulator() {
        synchronized (lifecycleLock) {
            stopRequested = true;
            lifecycleLock.notifyAll();
        }
    }

    @Override protected final void onStopRequestedForSimulator() { stopForSimulator(); }
}
