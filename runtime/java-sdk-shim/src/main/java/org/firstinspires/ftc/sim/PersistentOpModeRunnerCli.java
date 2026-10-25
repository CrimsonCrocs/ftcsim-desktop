package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.SimDcMotorEx;
import com.qualcomm.robotcore.hardware.SimServo;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Modifier;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Persistent, newline-framed JVM worker. Browser physics remains authoritative: every TICK
 * supplies encoder/current feedback and receives only actuator commands and telemetry.
 */
public final class PersistentOpModeRunnerCli {
    private static final int MAX_CAPTURED_STDOUT_BYTES = 65_536;
    private final SimulatorRunnerContext context = new SimulatorRunnerContext();
    private final LinkedHashMap<String, SimDcMotorEx> motors =
            new LinkedHashMap<String, SimDcMotorEx>();
    private final LinkedHashMap<String, SimServo> servos = new LinkedHashMap<String, SimServo>();
    private final SimulatorIMU imu;
    private final SimulatorVoltageSensor voltageSensor;
    private Object opMode;
    private final SimulatorSensorHub sensorHub;
    private Thread linearWorker;
    private volatile boolean linearProgramCompleted;
    private final AtomicReference<Throwable> workerFailure = new AtomicReference<Throwable>();
    private String phase = "loaded";
    private long sequence = -1;
    private long lastTelemetryRevisionWritten = -1;
    private String robotId;
    private long worldTick = -1;

    private PersistentOpModeRunnerCli(Config config) throws Exception {
        imu = context.hardwareMap.putForSimulator("imu", new SimulatorIMU());
        voltageSensor = context.hardwareMap.putForSimulator("Control Hub", new SimulatorVoltageSensor(12.5));
        for (MotorProfile profile : config.motorProfiles.values()) {
            motors.put(profile.name, context.hardwareMap.putForSimulator(
                    profile.name,
                    new SimDcMotorEx(
                            profile.modelId,
                            profile.ticksPerRevolution,
                            profile.maxRpm,
                            profile.achievableMaxRpmFraction)));
        }
        for (String name : config.servoNames) {
            servos.put(name, context.hardwareMap.putForSimulator(name, new SimServo()));
        }
        sensorHub = new SimulatorSensorHub(context.hardwareMap, config.sensorProfiles, config.cameraProfiles);
        robotId = config.robotId;
        SimulatorLibraryRuntime.begin(context.telemetry);
        opMode = loadOpMode(config.opModeClass);
    }

    public static void main(String[] args) {
        PrintStream protocolOut = System.out;
        CappedOutputStream captured = new CappedOutputStream(MAX_CAPTURED_STDOUT_BYTES);
        try {
            System.setOut(new PrintStream(captured, true, StandardCharsets.UTF_8.name()));
            PersistentOpModeRunnerCli worker = new PersistentOpModeRunnerCli(Config.parse(args));
            worker.run(protocolOut, captured);
        } catch (Throwable failure) {
            protocolOut.println(errorEnvelope("", "LOAD_ERROR", describe(failure), true));
            protocolOut.flush();
            System.exit(3);
        }
    }

    private void run(PrintStream protocolOut, CappedOutputStream captured) throws IOException {
        BufferedReader reader = new BufferedReader(
                new InputStreamReader(System.in, StandardCharsets.UTF_8));
        run(reader, protocolOut, captured);
    }

    /** Desktop restart host: a fresh classloader and streams, without exiting the host JVM. */
    public static void runForDesktop(String[] args, java.io.InputStream input, java.io.OutputStream output) throws Exception {
        PrintStream previousOut = System.out;
        PrintStream protocolOut = new PrintStream(output, true, StandardCharsets.UTF_8.name());
        CappedOutputStream captured = new CappedOutputStream(MAX_CAPTURED_STDOUT_BYTES);
        try {
            System.setOut(new PrintStream(captured, true, StandardCharsets.UTF_8.name()));
            PersistentOpModeRunnerCli worker = new PersistentOpModeRunnerCli(Config.parse(args));
            worker.run(new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8)), protocolOut, captured);
        } catch (Throwable failure) {
            protocolOut.println(errorEnvelope("", "LOAD_ERROR", describe(failure), true));
            protocolOut.flush();
        } finally {
            System.setOut(previousOut);
        }
    }

    private void run(BufferedReader reader, PrintStream protocolOut, CappedOutputStream captured) throws IOException {
        String line;
        while ((line = reader.readLine()) != null) {
            String requestId = "";
            boolean shouldExit = false;
            try {
                String[] fields = line.split("\\t", -1);
                if (fields.length < 2) throw new IllegalArgumentException("Malformed command");
                String command = fields[0];
                requestId = fields[1];
                if ("INIT".equals(command)) {
                    if (fields.length == 2) initialize();
                    else {
                        requireFieldCount(fields, 8);
                        initialize(
                                fields[2], Long.parseLong(fields[3]), Long.parseLong(fields[4]),
                                fields[5], fields[6], fields[7]);
                    }
                } else if ("START".equals(command)) {
                    requireFieldCount(fields, 2);
                    start();
                } else if ("TICK".equals(command)) {
                    if (fields.length == 8) {
                        tick(
                                Long.parseLong(fields[2]), Long.parseLong(fields[3]),
                                fields[4], fields[5], fields[6], fields[7]);
                    } else {
                        requireFieldCount(fields, 12);
                        tick(
                                Long.parseLong(fields[2]), Long.parseLong(fields[3]),
                                fields[4], fields[5], fields[6], fields[7],
                                fields[8], Long.parseLong(fields[9]), Long.parseLong(fields[10]), fields[11]);
                    }
                } else if ("HANDOFF".equals(command)) {
                    requireFieldCount(fields, 9);
                    handoff(
                            fields[2], fields[3], Long.parseLong(fields[4]), Long.parseLong(fields[5]),
                            fields[6], fields[7], fields[8]);
                } else if ("STOP".equals(command) || "RESET".equals(command)) {
                    requireFieldCount(fields, 2);
                    stop();
                } else if ("CLOSE".equals(command)) {
                    requireFieldCount(fields, 2);
                    stop();
                    phase = "closed";
                    shouldExit = true;
                } else {
                    throw new IllegalArgumentException("Unknown command " + command);
                }
                throwIfWorkerFailed();
                protocolOut.println(successEnvelope(requestId, captured));
            } catch (Throwable failure) {
                neutralize();
                protocolOut.println(errorEnvelope(requestId, "RUNTIME_ERROR", describe(failure), false));
                shouldExit = true;
            }
            protocolOut.flush();
            if (shouldExit) break;
        }
        stop();
    }

    private void initialize() throws Exception {
        if (!"loaded".equals(phase) && !"stopped".equals(phase)) {
            throw new IllegalStateException("INIT is only valid for a loaded worker");
        }
        SimulatorClock.reset();
        initializeCurrentOpMode();
    }

    private void initialize(
            String robotId,
            long tick,
            long simulationTimeMillis,
            String encodedMotors,
            String encodedRobotSensors,
            String encodedPhysicalSensors) throws Exception {
        if (!"loaded".equals(phase) && !"stopped".equals(phase)) {
            throw new IllegalStateException("INIT is only valid for a loaded worker");
        }
        SimulatorClock.reset();
        SimulatorClock.synchronizeTo(simulationTimeMillis);
        sensorHub.resetVisionConsumersForSimulator();
        applyWorldFeedback(robotId, tick, simulationTimeMillis,
                encodedMotors, encodedRobotSensors, encodedPhysicalSensors);
        initializeCurrentOpMode();
    }

    private void initializeCurrentOpMode() throws Exception {
        sensorHub.resetVisionConsumersForSimulator();
        SimulatorLibraryRuntime.begin(context.telemetry);
        if (!"loaded".equals(phase) && !"stopped".equals(phase)) {
            throw new IllegalStateException("INIT is only valid for a loaded or stopped OpMode");
        }
        linearProgramCompleted = false;
        if (opMode instanceof LinearOpMode) {
            SimulatorClock.beginLinearWorkerForSimulator();
            final LinearOpMode linear = (LinearOpMode) opMode;
            linear.initializeForSimulator(
                    context.hardwareMap, context.telemetry, context.gamepad1, context.gamepad2);
            linearWorker = new Thread(new Runnable() {
                @Override
                public void run() {
                    boolean returnedNormally = false;
                    try {
                        linear.runOpMode();
                        returnedNormally = true;
                    } catch (Throwable failure) {
                        if (!(failure instanceof InterruptedException && linear.isStopRequested())) {
                            workerFailure.set(failure);
                        }
                    } finally {
                        // A LinearOpMode that returns has no future control loop to own outputs.
                        // Keep the match clock alive, but immediately leave actuators safe.
                        neutralize();
                        linearProgramCompleted = returnedNormally && workerFailure.get() == null;
                        SimulatorClock.signalLinearWorkerCompletedForSimulator();
                    }
                }
            }, "ftc-linear-opmode");
            linearWorker.setDaemon(true);
            linearWorker.start();
            if (!linear.awaitWaitForStartForSimulator(Boolean.getBoolean("ftcsim.debug") ? 86400 : 2, TimeUnit.SECONDS)) {
                throwIfWorkerFailed();
                throw new IllegalStateException("LinearOpMode did not call waitForStart() during INIT");
            }
        } else {
            OpMode iterative = (OpMode) opMode;
            iterative.initializeForSimulator(
                    context.hardwareMap, context.telemetry, context.gamepad1, context.gamepad2);
            long updateCount = context.telemetry.getUserUpdateCountForSimulator();
            iterative.init();
            updateIterativeTelemetry(updateCount);
        }
        phase = "initialized";
        if (((OpMode) opMode).isStopRequestedForSimulator()) stop();
    }

    private void start() {
        if (!"initialized".equals(phase)) {
            throw new IllegalStateException("START requires an initialized OpMode");
        }
        if (opMode instanceof LinearOpMode) {
            ((LinearOpMode) opMode).startForSimulator();
            // Establish a control barrier: TeamCode processes the neutral start frame and reaches
            // idle before the first browser tick mutates its gamepad fields.
            awaitLinearLoopForCurrentTick();
        } else {
            ((OpMode) opMode).start();
        }
        SimulatorClock.resetRuntime();
        phase = "running";
        if (((OpMode) opMode).isStopRequestedForSimulator()) stop();
        Thread.yield();
    }

    private void tick(
            long nextSequence,
            long deltaMillis,
            String encodedGamepad1,
            String encodedGamepad2,
            String encodedMotors,
            String encodedRobotSensors) throws Exception {
        if (!"initialized".equals(phase) && !"running".equals(phase)) {
            throw new IllegalStateException("TICK requires an initialized or running OpMode");
        }
        if (nextSequence <= sequence) {
            throw new IllegalArgumentException("Tick sequence must increase monotonically");
        }
        if (deltaMillis != 20) throw new IllegalArgumentException("Control tick must be 20 ms");
        applyGamepad(context.gamepad1, encodedGamepad1);
        applyGamepad(context.gamepad2, encodedGamepad2);
        applyMotorFeedback(encodedMotors);
        applyRobotSensorFeedback(
                encodedRobotSensors, (SimulatorClock.nowMillis() + deltaMillis) * 1_000_000L);
        ((OpMode) opMode).updateRuntimeForSimulator(SimulatorClock.nowMillis() + deltaMillis);
        SimulatorClock.advance(deltaMillis);
        sequence = nextSequence;
        if (!(opMode instanceof LinearOpMode)) {
            OpMode iterative = (OpMode) opMode;
            long updateCount = context.telemetry.getUserUpdateCountForSimulator();
            if ("running".equals(phase)) iterative.loop();
            else {
                iterative.init_loop();
                if (robotId != null) neutralize();
            }
            updateIterativeTelemetry(updateCount);
        } else {
            awaitLinearLoopForCurrentTick();
        }
        throwIfWorkerFailed();
        if (((OpMode) opMode).isStopRequestedForSimulator()) stop();
    }

    private void tick(
            long nextSequence,
            long deltaMillis,
            String encodedGamepad1,
            String encodedGamepad2,
            String encodedMotors,
            String encodedRobotSensors,
            String robotId,
            long tick,
            long simulationTimeMillis,
            String encodedPhysicalSensors) throws Exception {
        if (!"initialized".equals(phase) && !"running".equals(phase)) {
            throw new IllegalStateException("TICK requires an initialized or running OpMode");
        }
        if (nextSequence <= sequence) {
            throw new IllegalArgumentException("Tick sequence must increase monotonically");
        }
        if (deltaMillis != 20) throw new IllegalArgumentException("Control tick must be 20 ms");
        if (simulationTimeMillis <= SimulatorClock.nowMillis()) {
            throw new IllegalArgumentException("World timestamp must advance beyond the previous tick");
        }
        applyGamepad(context.gamepad1, encodedGamepad1);
        applyGamepad(context.gamepad2, encodedGamepad2);
        applyWorldFeedback(robotId, tick, simulationTimeMillis,
                encodedMotors, encodedRobotSensors, encodedPhysicalSensors);
        ((OpMode) opMode).updateRuntimeForSimulator(simulationTimeMillis);
        SimulatorClock.advanceTo(simulationTimeMillis);
        sequence = nextSequence;
        if (!(opMode instanceof LinearOpMode)) {
            OpMode iterative = (OpMode) opMode;
            long updateCount = context.telemetry.getUserUpdateCountForSimulator();
            if ("running".equals(phase)) iterative.loop();
            else {
                iterative.init_loop();
                if (robotId != null) neutralize();
            }
            updateIterativeTelemetry(updateCount);
        } else {
            awaitLinearLoopForCurrentTick();
        }
        throwIfWorkerFailed();
        if (((OpMode) opMode).isStopRequestedForSimulator()) stop();
    }

    private void handoff(
            String nextEntryClass,
            String robotId,
            long tick,
            long simulationTimeMillis,
            String encodedMotors,
            String encodedRobotSensors,
            String encodedPhysicalSensors) throws Exception {
        boolean alreadyStopped = "stopped".equals(phase);
        if (!alreadyStopped && !"initialized".equals(phase) && !"running".equals(phase)) {
            throw new IllegalStateException("HANDOFF requires an initialized, running, or stopped OpMode");
        }
        if (nextEntryClass == null || nextEntryClass.length() == 0) {
            throw new IllegalArgumentException("HANDOFF entry class cannot be empty");
        }
        if (alreadyStopped) {
            if (linearWorker != null && linearWorker.isAlive()) {
                throw new IllegalStateException("Stopped OpMode worker is still running before HANDOFF");
            }
            linearWorker = null;
            SimulatorClock.reopenForSimulatorHandoff();
            neutralize();
        } else {
            stopCurrentForHandoff();
        }
        SimulatorClock.synchronizeTo(simulationTimeMillis);
        sensorHub.resetVisionConsumersForSimulator();
        applyWorldFeedback(robotId, tick, simulationTimeMillis,
                encodedMotors, encodedRobotSensors, encodedPhysicalSensors);
        SimulatorLibraryRuntime.begin(context.telemetry);
        opMode = loadOpMode(nextEntryClass);
        initializeCurrentOpMode();
        context.telemetry.flushPendingForSimulatorLifecycle();
        // INIT code may set a motor before the field transition ends. The next OpMode starts neutral.
        neutralize();
    }

    private void stopCurrentForHandoff() throws Exception {
        Throwable stopFailure = null;
        try {
            if (opMode instanceof LinearOpMode) {
                ((LinearOpMode) opMode).stopForSimulator();
                if (linearWorker != null) {
                    linearWorker.interrupt();
                    linearWorker.join(250);
                    if (linearWorker.isAlive()) {
                        throw new IllegalStateException(
                                "AUTO OpMode did not stop before TELEOP handoff");
                    }
                }
            } else if (opMode instanceof OpMode && !"loaded".equals(phase)) {
                ((OpMode) opMode).stop();
            }
        } catch (Throwable failure) {
            stopFailure = failure;
        } finally {
            neutralize();
            phase = "stopped";
            linearWorker = null;
        }
        if (stopFailure != null) {
            if (stopFailure instanceof Exception) throw (Exception) stopFailure;
            throw new IllegalStateException("AUTO OpMode failed while stopping for handoff", stopFailure);
        }
    }

    private void updateIterativeTelemetry(long updateCountBeforeCallback) {
        if (context.telemetry.getUserUpdateCountForSimulator() == updateCountBeforeCallback) {
            context.telemetry.update();
        }
    }

    private void awaitLinearLoopForCurrentTick() {
        Thread worker = linearWorker;
        if (linearProgramCompleted || worker == null || !worker.isAlive()) {
            // Do not spend a control-tick timeout waiting for a program that has already returned.
            // The world owns time progression; an ended OpMode simply leaves neutral outputs.
            neutralize();
            return;
        }
        // A fixed 20 ms wall wait could expire during JIT or host contention and
        // silently publish the previous tick. Wait for a real cooperative yield.
        // Desktop gives the reply a separate bounded transport allowance. The
        // web runner retains its default; neither path may publish a missed yield.
        int budget = Math.max(1, Math.min(300, Integer.getInteger("ftcsim.cooperativeDeadlineMillis", 120)));
        if (!SimulatorClock.awaitLinearLoopForCurrentTick(budget)) {
            neutralize();
            throw new IllegalStateException("LinearOpMode did not yield at idle() or sleep() within the control deadline");
        }
    }

    private void stop() {
        if ("closed".equals(phase) || "stopped".equals(phase)) return;
        try {
            if (opMode instanceof LinearOpMode) {
                ((LinearOpMode) opMode).stopForSimulator();
                SimulatorClock.close();
                if (linearWorker != null) {
                    linearWorker.interrupt();
                    linearWorker.join(250);
                }
            } else if (!"loaded".equals(phase)) {
                ((OpMode) opMode).stop();
            }
        } catch (Throwable ignored) {
            // Neutral output and process termination are stronger guarantees than a user stop hook.
        } finally {
            neutralize();
            phase = "stopped";
        }
    }

    private void neutralize() {
        for (DcMotor motor : motors.values()) motor.setPower(0);
        sensorHub.neutralizeOutputsForSimulator();
    }

    private void throwIfWorkerFailed() {
        Throwable failure = workerFailure.get();
        if (failure != null) throw new IllegalStateException("OpMode threw an exception", failure);
    }

    private void applyMotorFeedback(String encoded) throws Exception {
        if (encoded.length() == 0) return;
        for (String entry : encoded.split(";")) {
            String[] fields = entry.split(",", -1);
            if (fields.length != 5) throw new IllegalArgumentException("Malformed motor feedback");
            String name = decode(fields[0]);
            SimDcMotorEx motor = motors.get(name);
            if (motor == null) throw new IllegalArgumentException("Unknown motor " + name);
            motor.applyFeedbackForSimulator(
                    Double.parseDouble(fields[1]), Double.parseDouble(fields[2]),
                    Double.parseDouble(fields[3]), Boolean.parseBoolean(fields[4]));
        }
    }

    private void applyRobotSensorFeedback(String encoded, long acquisitionTimeNanos) {
        String[] fields = encoded.split(",", -1);
        if (fields.length != 7 && fields.length != 8) {
            throw new IllegalArgumentException("Malformed robot sensor feedback");
        }
        imu.applyFeedbackForSimulator(
                Double.parseDouble(fields[0]),
                Double.parseDouble(fields[1]),
                Double.parseDouble(fields[2]),
                Double.parseDouble(fields[3]),
                Double.parseDouble(fields[4]),
                Double.parseDouble(fields[5]),
                acquisitionTimeNanos);
        voltageSensor.applyFeedbackForSimulator(
                Double.parseDouble(fields[6]), fields.length == 8 ? Double.parseDouble(fields[7]) : 0.0);
    }

    private void applyWorldFeedback(
            String frameRobotId,
            long tick,
            long simulationTimeMillis,
            String encodedMotors,
            String encodedRobotSensors,
            String encodedPhysicalSensors) throws Exception {
        if (frameRobotId == null || frameRobotId.length() == 0) {
            throw new IllegalArgumentException("v3 sensor frame requires robotId");
        }
        if (tick < 0 || simulationTimeMillis < 0) {
            throw new IllegalArgumentException("v3 sensor frame tick and time cannot be negative");
        }
        if (robotId != null && !robotId.equals(frameRobotId)) {
            throw new IllegalArgumentException("A JVM worker cannot change robot identity mid-session");
        }
        if (tick < worldTick) throw new IllegalArgumentException("World tick cannot move backwards");
        String[] fields = encodedRobotSensors.split(",", -1);
        if (fields.length != 8) {
            throw new IllegalArgumentException("v3 robot sensor frame needs orientation, rates, voltage and current");
        }
        double yaw = Double.parseDouble(fields[0]);
        double pitch = Double.parseDouble(fields[1]);
        double roll = Double.parseDouble(fields[2]);
        double angularX = Double.parseDouble(fields[3]);
        double angularY = Double.parseDouble(fields[4]);
        double angularZ = Double.parseDouble(fields[5]);
        long acquisitionTimeNanos = simulationTimeMillis * 1_000_000L;
        applyMotorFeedback(encodedMotors);
        imu.applyFeedbackForSimulator(yaw, pitch, roll, angularX, angularY, angularZ, acquisitionTimeNanos);
        voltageSensor.applyFeedbackForSimulator(
                Double.parseDouble(fields[6]), Double.parseDouble(fields[7]));
        sensorHub.applyFeedbackForSimulator(
                encodedPhysicalSensors, frameRobotId, tick, simulationTimeMillis,
                yaw, pitch, roll, angularX, angularY, angularZ);
        robotId = frameRobotId;
        worldTick = tick;
    }

    private static void applyGamepad(Gamepad gamepad, String encoded) throws Exception {
        gamepad.beginSimulatorUpdate();
        if (encoded.length() > 0) {
            for (String entry : encoded.split("&")) {
                int equals = entry.indexOf('=');
                if (equals < 1) throw new IllegalArgumentException("Malformed gamepad input");
                String name = decode(entry.substring(0, equals));
                String value = decode(entry.substring(equals + 1));
                applyGamepadField(gamepad, name, value);
            }
        }
        gamepad.updateButtonAliases();
    }

    private static void applyGamepadField(Gamepad gamepad, String field, String value) {
        if ("left_stick_x".equals(field)) gamepad.left_stick_x = parseAxis(value, -1);
        else if ("left_stick_y".equals(field)) gamepad.left_stick_y = parseAxis(value, -1);
        else if ("right_stick_x".equals(field)) gamepad.right_stick_x = parseAxis(value, -1);
        else if ("right_stick_y".equals(field)) gamepad.right_stick_y = parseAxis(value, -1);
        else if ("left_trigger".equals(field)) gamepad.left_trigger = parseAxis(value, 0);
        else if ("right_trigger".equals(field)) gamepad.right_trigger = parseAxis(value, 0);
        else {
            boolean pressed = Boolean.parseBoolean(value);
            if ("a".equals(field) || "cross".equals(field)) gamepad.a = pressed;
            else if ("b".equals(field) || "circle".equals(field)) gamepad.b = pressed;
            else if ("x".equals(field) || "square".equals(field)) gamepad.x = pressed;
            else if ("y".equals(field) || "triangle".equals(field)) gamepad.y = pressed;
            else if ("dpad_up".equals(field)) gamepad.dpad_up = pressed;
            else if ("dpad_down".equals(field)) gamepad.dpad_down = pressed;
            else if ("dpad_left".equals(field)) gamepad.dpad_left = pressed;
            else if ("dpad_right".equals(field)) gamepad.dpad_right = pressed;
            else if ("left_bumper".equals(field)) gamepad.left_bumper = pressed;
            else if ("right_bumper".equals(field)) gamepad.right_bumper = pressed;
            else if ("left_stick_button".equals(field)) gamepad.left_stick_button = pressed;
            else if ("right_stick_button".equals(field)) gamepad.right_stick_button = pressed;
            else if ("start".equals(field) || "options".equals(field)) gamepad.start = pressed;
            else if ("back".equals(field) || "share".equals(field)) gamepad.back = pressed;
            else if ("guide".equals(field) || "ps".equals(field)) gamepad.guide = pressed;
            else if ("touchpad".equals(field)) gamepad.touchpad = pressed;
            else throw new IllegalArgumentException("Unsupported gamepad field " + field);
        }
    }

    private String successEnvelope(String requestId, CappedOutputStream captured) {
        StringBuilder json = new StringBuilder(2_048);
        json.append("{\"ok\":true,\"requestId\":");
        appendString(json, requestId);
        if (robotId != null) {
            json.append(",\"robotId\":"); appendString(json, robotId);
            json.append(",\"tick\":").append(worldTick);
        }
        appendFrame(json, captured);
        if (Boolean.getBoolean("ftcsim.debug") && (sequence < 0 || sequence % 5 == 0)) {
            json.append(",\"variables\":").append(SimulatorVariables.snapshot(opMode));
        }
        json.append('}');
        return json.toString();
    }

    private void appendFrame(StringBuilder json, CappedOutputStream captured) {
        json.append(",\"sequence\":").append(sequence);
        json.append(",\"phase\":"); appendString(json, phase);
        if (opMode instanceof LinearOpMode) {
            json.append(",\"programStatus\":");
            appendString(json, linearProgramCompleted ? "completed" : "running");
        }
        json.append(",\"simulationTimeMillis\":").append(SimulatorClock.nowMillis());
        json.append(",\"motors\":{");
        boolean first = true;
        for (Map.Entry<String, SimDcMotorEx> entry : motors.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendString(json, entry.getKey()); json.append(':');
            appendMotor(json, entry.getValue());
        }
        json.append("},\"servos\":{");
        first = true;
        for (Map.Entry<String, SimServo> entry : servos.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendString(json, entry.getKey()); json.append(':');
            json.append("{\"position\":").append(entry.getValue().getPosition());
            json.append(",\"direction\":");
            appendString(json, entry.getValue().getDirection().name()); json.append('}');
        }
        json.append("},\"digitalOutputs\":{");
        first = true;
        for (Map.Entry<String, Boolean> entry : sensorHub.getDigitalOutputsForSimulator().entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendString(json, entry.getKey()); json.append(':').append(entry.getValue());
        }
        json.append("},\"cameraFrameRequests\":[");
        first = true;
        for (String camera : sensorHub.getCameraFrameRequestsForSimulator()) {
            if (!first) json.append(',');
            first = false;
            appendString(json, camera);
        }
        json.append("],\"telemetry\":");
        SimulatorTelemetry.FrameSnapshot telemetry = context.telemetry.getLatestFrameSnapshot();
        appendStringMap(json, telemetry.getLegacyData());
        json.append(",\"telemetryRevision\":").append(telemetry.getRevision());
        if (telemetry.getRevision() != lastTelemetryRevisionWritten) {
            json.append(",\"telemetryUpdate\":");
            appendTelemetryUpdate(json, telemetry);
            lastTelemetryRevisionWritten = telemetry.getRevision();
        }
        CappedOutputStream.OutputChunk output = captured.drain();
        json.append(",\"capturedStdout\":"); appendString(json, output.text);
        json.append(",\"capturedStdoutTruncated\":").append(output.truncated);
        Gamepad.RumbleCommand rumble1 = context.gamepad1.consumeRumbleCommandForSimulator();
        Gamepad.RumbleCommand rumble2 = context.gamepad2.consumeRumbleCommandForSimulator();
        if (rumble1 != null || rumble2 != null) {
            json.append(",\"haptics\":{");
            boolean firstHaptic = true;
            if (rumble1 != null) {
                json.append("\"gamepad1\":"); appendRumble(json, rumble1);
                firstHaptic = false;
            }
            if (rumble2 != null) {
                if (!firstHaptic) json.append(',');
                json.append("\"gamepad2\":"); appendRumble(json, rumble2);
            }
            json.append('}');
        }
    }

    private static void appendRumble(StringBuilder json, Gamepad.RumbleCommand command) {
        json.append("{\"weakMagnitude\":").append(command.rumble1);
        json.append(",\"strongMagnitude\":").append(command.rumble2);
        json.append(",\"durationMillis\":").append(command.durationMs).append('}');
    }

    private static void appendTelemetryUpdate(
            StringBuilder json, SimulatorTelemetry.FrameSnapshot telemetry) {
        json.append("{\"revision\":").append(telemetry.getRevision());
        json.append(",\"simulationTimeMillis\":").append(telemetry.getSimulationTimeMillis());
        json.append(",\"rows\":[");
        boolean firstRow = true;
        for (SimulatorTelemetry.RowSnapshot row : telemetry.getRows()) {
            if (!firstRow) json.append(',');
            firstRow = false;
            json.append("{\"kind\":"); appendString(json, row.getKind());
            json.append(",\"caption\":"); appendString(json, row.getCaption());
            json.append(",\"composed\":"); appendString(json, row.getComposed());
            json.append(",\"items\":[");
            boolean firstItem = true;
            for (SimulatorTelemetry.ItemSnapshot item : row.getItems()) {
                if (!firstItem) json.append(',');
                firstItem = false;
                json.append("{\"caption\":"); appendString(json, item.getCaption());
                json.append(",\"value\":"); appendString(json, item.getValue());
                json.append(",\"retained\":").append(item.isRetained()).append('}');
            }
            json.append("]}");
        }
        json.append("],\"log\":[");
        boolean firstLog = true;
        for (String entry : telemetry.getLog()) {
            if (!firstLog) json.append(',');
            firstLog = false;
            appendString(json, entry);
        }
        json.append("],\"displayFormat\":");
        appendString(json, telemetry.getDisplayFormat().name());
        json.append(",\"captionValueSeparator\":");
        appendString(json, telemetry.getCaptionValueSeparator());
        json.append(",\"itemSeparator\":"); appendString(json, telemetry.getItemSeparator());
        json.append(",\"autoClear\":").append(telemetry.isAutoClear());
        json.append(",\"transmissionIntervalMillis\":")
                .append(telemetry.getTransmissionIntervalMillis()).append('}');
    }

    private static void appendMotor(StringBuilder json, SimDcMotorEx motor) {
        json.append("{\"power\":").append(motor.getPower());
        json.append(",\"direction\":"); appendString(json, motor.getDirection().name());
        json.append(",\"mode\":"); appendString(json, motor.getMode().name());
        json.append(",\"zeroPowerBehavior\":");
        appendString(json, motor.getZeroPowerBehavior().name());
        json.append(",\"enabled\":").append(motor.isMotorEnabled());
        json.append(",\"targetPosition\":").append(motor.getTargetPosition());
        json.append(",\"targetPositionTolerance\":")
                .append(motor.getTargetPositionTolerance());
        json.append(",\"velocitySetpointTicksPerSecond\":");
        Double velocity = motor.getVelocitySetpointForSimulator();
        if (velocity == null) json.append("null"); else json.append(velocity);
        json.append('}');
    }

    private static Object loadOpMode(String className) throws Exception {
        ClassLoader loader = Thread.currentThread().getContextClassLoader();
        if (!(loader instanceof SimulatorClassLoader)) {
            loader = new SimulatorClassLoader(loader);
            Thread.currentThread().setContextClassLoader(loader);
        }
        Class<?> loaded = Class.forName(className, true,
                loader);
        if (!LinearOpMode.class.isAssignableFrom(loaded)
                && !OpMode.class.isAssignableFrom(loaded)) {
            throw new IllegalArgumentException(className + " is not an FTC OpMode");
        }
        if (!Modifier.isPublic(loaded.getModifiers()) || Modifier.isAbstract(loaded.getModifiers())) {
            throw new IllegalArgumentException(className + " must be public and concrete");
        }
        Constructor<?> constructor = loaded.getDeclaredConstructor();
        if (!Modifier.isPublic(constructor.getModifiers())) {
            throw new IllegalArgumentException(className + " needs a public no-argument constructor");
        }
        try {
            return constructor.newInstance();
        } catch (InvocationTargetException failure) {
            throw new IllegalStateException("OpMode constructor failed", failure.getTargetException());
        }
    }

    private static void appendStringMap(StringBuilder json, Map<String, String> values) {
        json.append('{');
        boolean first = true;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendString(json, entry.getKey()); json.append(':'); appendString(json, entry.getValue());
        }
        json.append('}');
    }

    private static String errorEnvelope(
            String requestId, String kind, String message, boolean loading) {
        StringBuilder json = new StringBuilder(512);
        json.append("{\"ok\":false,\"requestId\":"); appendString(json, requestId);
        json.append(",\"error\":{\"kind\":"); appendString(json, kind);
        json.append(",\"message\":"); appendString(json, message);
        json.append("},\"neutralized\":true,\"loading\":").append(loading).append('}');
        return json.toString();
    }

    private static String describe(Throwable failure) {
        Throwable root = failure;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return root.getClass().getSimpleName() + ": "
                + (root.getMessage() == null ? "no message" : root.getMessage());
    }

    private static void appendString(StringBuilder json, String value) {
        json.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (character == '"') json.append("\\\"");
            else if (character == '\\') json.append("\\\\");
            else if (character == '\n') json.append("\\n");
            else if (character == '\r') json.append("\\r");
            else if (character == '\t') json.append("\\t");
            else if (character < 0x20) json.append(String.format("\\u%04x", (int) character));
            else json.append(character);
        }
        json.append('"');
    }

    private static float parseAxis(String value, double minimum) {
        double parsed = Double.parseDouble(value);
        if (!Double.isFinite(parsed) || parsed < minimum || parsed > 1) {
            throw new IllegalArgumentException("Gamepad axis is out of range");
        }
        return (float) parsed;
    }

    private static String decode(String value) throws Exception {
        return URLDecoder.decode(value, "UTF-8");
    }

    private static void requireFieldCount(String[] fields, int expected) {
        if (fields.length != expected) throw new IllegalArgumentException("Malformed command");
    }

    private static final class SimulatorRunnerContext {
        final com.qualcomm.robotcore.hardware.HardwareMap hardwareMap =
                new com.qualcomm.robotcore.hardware.HardwareMap();
        final Gamepad gamepad1 = new Gamepad();
        final Gamepad gamepad2 = new Gamepad();
        final SimulatorTelemetry telemetry = new SimulatorTelemetry();
    }

    private static final class Config {
        String opModeClass;
        String robotId;
        final LinkedHashMap<String, MotorProfile> motorProfiles =
                new LinkedHashMap<String, MotorProfile>();
        final java.util.List<String> servoNames = new java.util.ArrayList<String>();
        final java.util.List<SensorProfile> sensorProfiles =
                new java.util.ArrayList<SensorProfile>();
        final java.util.List<CameraProfile> cameraProfiles =
                new java.util.ArrayList<CameraProfile>();

        static Config parse(String[] args) {
            Config config = new Config();
            for (int index = 0; index < args.length; index += 2) {
                if (index + 1 >= args.length) throw new IllegalArgumentException("Missing argument value");
                String option = args[index];
                String value = args[index + 1];
                if ("--class".equals(option)) config.opModeClass = value;
                else if ("--motor".equals(option)) config.addMotor(MotorProfile.legacy(value));
                else if ("--motor-profile".equals(option)) {
                    config.addMotor(MotorProfile.parse(value));
                }
                else if ("--sensor".equals(option)) config.addSensor(SensorProfile.parse(value));
                else if ("--camera".equals(option)) config.addCamera(CameraProfile.parse(value));
                else if ("--servo".equals(option)) config.addServo(value);
                else if ("--robot-id".equals(option)) config.robotId = validateRobotId(value);
                else throw new IllegalArgumentException("Unknown argument " + option);
            }
            if (config.opModeClass == null) throw new IllegalArgumentException("--class is required");
            return config;
        }

        private void addMotor(MotorProfile profile) {
            if (motorProfiles.containsKey(profile.name) || servoNames.contains(profile.name)
                    || containsSensor(profile.name) || containsCamera(profile.name) || "imu".equals(profile.name)
                    || "Control Hub".equals(profile.name)) {
                throw new IllegalArgumentException(
                        "Hardware device name was configured more than once: " + profile.name);
            }
            motorProfiles.put(profile.name, profile);
        }

        private void addSensor(SensorProfile profile) {
            if (profile == null) throw new IllegalArgumentException("Sensor profile cannot be null");
            if (motorProfiles.containsKey(profile.name) || servoNames.contains(profile.name)
                    || containsSensor(profile.name) || containsCamera(profile.name) || "imu".equals(profile.name)
                    || "Control Hub".equals(profile.name)) {
                throw new IllegalArgumentException(
                        "Hardware device name was configured more than once: " + profile.name);
            }
            sensorProfiles.add(profile);
        }

        private void addCamera(CameraProfile profile) {
            if (motorProfiles.containsKey(profile.name) || servoNames.contains(profile.name)
                    || containsSensor(profile.name) || containsCamera(profile.name)
                    || "imu".equals(profile.name) || "Control Hub".equals(profile.name)) {
                throw new IllegalArgumentException(
                        "Hardware device name was configured more than once: " + profile.name);
            }
            cameraProfiles.add(profile);
        }

        private boolean containsCamera(String name) {
            for (CameraProfile profile : cameraProfiles) {
                if (profile.name.equals(name)) return true;
            }
            return false;
        }

        private void addServo(String name) {
            if (name == null || name.length() == 0 || !name.equals(name.trim())) {
                throw new IllegalArgumentException("Servo name must be non-empty and trimmed");
            }
            if (motorProfiles.containsKey(name) || servoNames.contains(name)
                    || containsSensor(name) || containsCamera(name) || "imu".equals(name) || "Control Hub".equals(name)) {
                throw new IllegalArgumentException("Hardware device name was configured more than once: " + name);
            }
            servoNames.add(name);
        }

        private boolean containsSensor(String name) {
            for (SensorProfile profile : sensorProfiles) {
                if (profile.name.equals(name)) return true;
            }
            return false;
        }

        private static String validateRobotId(String value) {
            if (value == null || value.length() == 0 || value.length() > 128 || !value.equals(value.trim())) {
                throw new IllegalArgumentException("robotId must be non-empty, trimmed and at most 128 characters");
            }
            for (int index = 0; index < value.length(); index++) {
                if (Character.isISOControl(value.charAt(index))) {
                    throw new IllegalArgumentException("robotId cannot contain control characters");
                }
            }
            return value;
        }
    }

    private static final class CappedOutputStream extends ByteArrayOutputStream {
        private final int limit;
        private boolean truncated;
        private int deliveredBytes;

        CappedOutputStream(int limit) { this.limit = limit; }

        @Override public synchronized void write(int value) {
            if (count < limit) super.write(value); else truncated = true;
        }

        @Override public synchronized void write(byte[] values, int offset, int length) {
            int remaining = limit - count;
            if (remaining > 0) super.write(values, offset, Math.min(length, remaining));
            if (length > remaining) truncated = true;
        }

        synchronized OutputChunk drain() {
            byte[] bytes = toByteArray();
            String text = new String(
                    bytes, deliveredBytes, bytes.length - deliveredBytes, StandardCharsets.UTF_8);
            deliveredBytes = bytes.length;
            boolean wasTruncated = truncated;
            truncated = false;
            return new OutputChunk(text, wasTruncated);
        }

        private static final class OutputChunk {
            final String text;
            final boolean truncated;

            OutputChunk(String text, boolean truncated) {
                this.text = text;
                this.truncated = truncated;
            }
        }
    }
}
