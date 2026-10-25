package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;

import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Small, intentionally non-production runner for the Java source compatibility proof.
 * It uses wall-clock sleeps; a real browser runtime must replace this with an isolated fixed-step
 * execution bridge.
 */
public final class SimulatorRunner {
    private final HardwareMap hardwareMap = new HardwareMap();
    private final Gamepad gamepad1 = new Gamepad();
    private final Gamepad gamepad2 = new Gamepad();
    private final SimulatorTelemetry telemetry = new SimulatorTelemetry();

    public HardwareMap getHardwareMap() {
        return hardwareMap;
    }

    public Gamepad getGamepad1() {
        return gamepad1;
    }

    public Gamepad getGamepad2() {
        return gamepad2;
    }

    public SimulatorTelemetry getTelemetry() {
        return telemetry;
    }

    public SimulationResult runForCycles(final LinearOpMode opMode, int cycleCount, long cycleMillis)
            throws InterruptedException {
        if (opMode == null) throw new IllegalArgumentException("opMode cannot be null");
        if (cycleCount < 1) throw new IllegalArgumentException("cycleCount must be positive");
        if (cycleMillis < 1) throw new IllegalArgumentException("cycleMillis must be positive");

        SimulatorClock.reset();
        SimulatorLibraryRuntime.begin(telemetry);
        opMode.initializeForSimulator(hardwareMap, telemetry, gamepad1, gamepad2);
        final AtomicReference<Throwable> failure = new AtomicReference<Throwable>();
        Thread worker = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    opMode.runOpMode();
                } catch (Throwable throwable) {
                    if (!(throwable instanceof InterruptedException && opMode.isStopRequested())) {
                        failure.set(throwable);
                    }
                }
            }
        }, "java-sdk-shim-opmode");
        // A TeamCode loop that ignores interruption must not keep the isolated runner JVM alive.
        worker.setDaemon(true);
        worker.start();

        boolean reachedWaitForStart = false;
        long waitForStartDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
        while (worker.isAlive() && failure.get() == null) {
            long remainingNanos = waitForStartDeadline - System.nanoTime();
            if (remainingNanos <= 0) break;
            reachedWaitForStart = opMode.awaitWaitForStartForSimulator(
                    Math.min(remainingNanos, TimeUnit.MILLISECONDS.toNanos(10)),
                    TimeUnit.NANOSECONDS);
            if (reachedWaitForStart) break;
        }
        if (failure.get() != null) {
            opMode.stopForSimulator();
            worker.interrupt();
            worker.join(1_000);
            throw new IllegalStateException("LinearOpMode threw an exception", failure.get());
        }
        if (!reachedWaitForStart) {
            opMode.stopForSimulator();
            worker.interrupt();
            worker.join(1_000);
            throw new IllegalStateException(
                    worker.isAlive()
                            ? "LinearOpMode did not call waitForStart() within one second"
                            : "LinearOpMode exited before calling waitForStart()");
        }

        opMode.startForSimulator();
        int completedCycles = 0;
        for (int cycle = 0; cycle < cycleCount && worker.isAlive(); cycle++) {
            Thread.sleep(cycleMillis);
            SimulatorClock.advance(cycleMillis);
            hardwareMap.advanceSimulation(cycleMillis / 1_000.0);
            completedCycles++;
        }

        opMode.stopForSimulator();
        SimulatorClock.close();
        worker.interrupt();
        worker.join(1_000);
        if (worker.isAlive()) {
            throw new IllegalStateException("LinearOpMode did not stop after the simulator requested stop");
        }
        if (failure.get() != null) {
            throw new IllegalStateException("LinearOpMode threw an exception", failure.get());
        }

        return new SimulationResult(completedCycles, telemetry.getLatestFrame());
    }
}
