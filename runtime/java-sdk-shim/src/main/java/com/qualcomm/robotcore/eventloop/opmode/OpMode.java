package com.qualcomm.robotcore.eventloop.opmode;

import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.Telemetry;
import org.firstinspires.ftc.sim.SimulatorClock;

/** FTC iterative OpMode lifecycle, hosted by the simulator runner. */
public abstract class OpMode {
    public volatile HardwareMap hardwareMap = new HardwareMap();
    public Telemetry telemetry;
    public volatile Gamepad gamepad1 = new Gamepad();
    public volatile Gamepad gamepad2 = new Gamepad();
    public volatile double time;
    public static final java.util.HashMap<String,Object> blackboard = new java.util.HashMap<String,Object>();
    private volatile boolean simulatorStopRequested;

    public abstract void init();

    public void init_loop() {}

    public void start() {}

    public abstract void loop();

    public void stop() {}

    public double getRuntime() {
        return SimulatorClock.secondsSinceRuntimeReset();
    }

    public void resetRuntime() {
        SimulatorClock.resetRuntime();
    }

    public void updateTelemetry(Telemetry telemetry) { telemetry.update(); }

    public final void requestOpModeStop() { simulatorStopRequested=true;onStopRequestedForSimulator(); }
    protected void onStopRequestedForSimulator() {}
    public final boolean isStopRequestedForSimulator() { return simulatorStopRequested; }

    public void initializeForSimulator(
            HardwareMap map, Telemetry output, Gamepad first, Gamepad second) {
        hardwareMap = map;
        telemetry = output;
        gamepad1 = first;
        gamepad2 = second;
        time = 0;
        simulatorStopRequested = false;
        resetRuntime();
    }

    public final void updateRuntimeForSimulator() {
        time = getRuntime();
    }

    public final void updateRuntimeForSimulator(long simulationTimeMillis) {
        time = SimulatorClock.secondsSinceRuntimeResetAtForSimulator(simulationTimeMillis);
    }
}
