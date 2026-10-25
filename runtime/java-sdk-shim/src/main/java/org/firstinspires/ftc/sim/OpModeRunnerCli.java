package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.SimDcMotorEx;
import com.qualcomm.robotcore.hardware.SimServo;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.PrintStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Process boundary for running one already-compiled {@link LinearOpMode} by class name.
 *
 * <p>The classpath is supplied by the caller. This CLI intentionally accepts no source code and
 * performs no compilation; it is the small execution protocol used after an isolated compiler has
 * produced classes. Every normal completion writes exactly one JSON line to the original stdout.
 * Output written by TeamCode is captured inside that JSON envelope.</p>
 */
public final class OpModeRunnerCli {
    private static final int DEFAULT_CYCLES = 50;
    private static final long DEFAULT_CYCLE_MILLIS = 20;
    private static final int MAX_CYCLES = 10_000;
    private static final long MAX_CYCLE_MILLIS = 1_000;
    private static final long MAX_SIMULATION_MILLIS = 30_000;
    private static final int MAX_DEVICES = 128;
    private static final int MAX_DEVICE_NAME_LENGTH = 128;
    private static final int MAX_CAPTURED_STDOUT_BYTES = 65_536;
    private static final long CLASS_LOAD_TIMEOUT_MILLIS = 2_000;
    private static final long RUNNER_OVERHEAD_MILLIS = 2_500;

    private OpModeRunnerCli() {}

    public static void main(String[] args) {
        PrintStream protocolOut = System.out;
        CappedOutputStream teamCodeOutput = new CappedOutputStream(MAX_CAPTURED_STDOUT_BYTES);
        try {
            System.setOut(new PrintStream(teamCodeOutput, true, StandardCharsets.UTF_8.name()));
        } catch (IOException impossibleUtf8Failure) {
            protocolOut.println(failureJson(
                    "INTERNAL_ERROR",
                    "The JVM does not support UTF-8 output capture",
                    "",
                    false));
            protocolOut.flush();
            System.exit(5);
            return;
        }

        int exitCode;
        String response;
        try {
            Config config = Config.parse(args);
            LinearOpMode opMode = loadOpModeBounded(config.opModeClass);
            Execution execution = executeBounded(config, opMode);
            response = successJson(
                    config,
                    execution,
                    teamCodeOutput.asUtf8(),
                    teamCodeOutput.wasTruncated());
            exitCode = 0;
        } catch (CliFailure failure) {
            response = failureJson(
                    failure.kind,
                    failure.getMessage(),
                    teamCodeOutput.asUtf8(),
                    teamCodeOutput.wasTruncated());
            exitCode = failure.exitCode;
        } catch (Throwable unexpected) {
            response = failureJson(
                    "INTERNAL_ERROR",
                    describeThrowable(unexpected),
                    teamCodeOutput.asUtf8(),
                    teamCodeOutput.wasTruncated());
            exitCode = 5;
        }

        protocolOut.println(response);
        protocolOut.flush();
        // This class is a process entry point. Always terminate so TeamCode-created threads cannot
        // keep a supposedly completed disposable worker alive.
        System.exit(exitCode);
    }

    private static Execution execute(Config config, LinearOpMode opMode) throws CliFailure {
        SimulatorRunner runner = new SimulatorRunner();
        LinkedHashMap<String, SimDcMotorEx> motors = new LinkedHashMap<String, SimDcMotorEx>();
        LinkedHashMap<String, SimServo> servos = new LinkedHashMap<String, SimServo>();

        for (MotorProfile profile : config.motorProfiles.values()) {
            SimDcMotorEx motor = runner.getHardwareMap().putForSimulator(
                    profile.name,
                    new SimDcMotorEx(
                            profile.modelId,
                            profile.ticksPerRevolution,
                            profile.maxRpm,
                            profile.achievableMaxRpmFraction));
            motors.put(profile.name, motor);
        }
        for (String name : config.servoNames) {
            SimServo servo = runner.getHardwareMap().putForSimulator(name, new SimServo());
            servos.put(name, servo);
        }
        for (GamepadAssignment assignment : config.gamepad1Assignments.values()) {
            assignment.apply(runner.getGamepad1());
        }
        for (GamepadAssignment assignment : config.gamepad2Assignments.values()) {
            assignment.apply(runner.getGamepad2());
        }

        try {
            SimulationResult result = runner.runForCycles(opMode, config.cycles, config.cycleMillis);
            return new Execution(result, motors, servos);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new CliFailure("RUN_ERROR", 4, "Runner was interrupted", interrupted);
        } catch (RuntimeException failure) {
            throw new CliFailure("RUN_ERROR", 4, describeThrowable(failure), failure);
        }
    }

    private static LinearOpMode loadOpModeBounded(final String className) throws CliFailure {
        final AtomicReference<LinearOpMode> result = new AtomicReference<LinearOpMode>();
        final AtomicReference<CliFailure> failure = new AtomicReference<CliFailure>();
        final AtomicReference<Throwable> unexpected = new AtomicReference<Throwable>();
        Thread loader = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    result.set(loadOpMode(className));
                } catch (CliFailure loadFailure) {
                    failure.set(loadFailure);
                } catch (Throwable loadFailure) {
                    unexpected.set(loadFailure);
                }
            }
        }, "java-sdk-shim-class-loader");
        loader.setDaemon(true);
        loader.start();
        try {
            loader.join(CLASS_LOAD_TIMEOUT_MILLIS);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new CliFailure("LOAD_ERROR", 3, "Class loading was interrupted", interrupted);
        }
        if (loader.isAlive()) {
            loader.interrupt();
            throw new CliFailure(
                    "LOAD_ERROR",
                    3,
                    "OpMode class loading and construction exceeded "
                            + CLASS_LOAD_TIMEOUT_MILLIS + " milliseconds",
                    null);
        }
        if (failure.get() != null) throw failure.get();
        if (unexpected.get() != null) {
            throw new CliFailure(
                    "LOAD_ERROR", 3, describeThrowable(unexpected.get()), unexpected.get());
        }
        if (result.get() == null) {
            throw new CliFailure("LOAD_ERROR", 3, "OpMode class loading produced no instance", null);
        }
        return result.get();
    }

    private static Execution executeBounded(final Config config, final LinearOpMode opMode)
            throws CliFailure {
        final AtomicReference<Execution> result = new AtomicReference<Execution>();
        final AtomicReference<CliFailure> failure = new AtomicReference<CliFailure>();
        final AtomicReference<Throwable> unexpected = new AtomicReference<Throwable>();
        Thread supervisor = new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    result.set(execute(config, opMode));
                } catch (CliFailure runFailure) {
                    failure.set(runFailure);
                } catch (Throwable runFailure) {
                    unexpected.set(runFailure);
                }
            }
        }, "java-sdk-shim-run-supervisor");
        supervisor.setDaemon(true);
        supervisor.start();
        long timeoutMillis = config.cycles * config.cycleMillis + RUNNER_OVERHEAD_MILLIS;
        try {
            supervisor.join(timeoutMillis);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new CliFailure("RUN_ERROR", 4, "Runner supervision was interrupted", interrupted);
        }
        if (supervisor.isAlive()) {
            supervisor.interrupt();
            throw new CliFailure(
                    "RUN_ERROR",
                    4,
                    "OpMode execution exceeded " + timeoutMillis + " milliseconds",
                    null);
        }
        if (failure.get() != null) throw failure.get();
        if (unexpected.get() != null) {
            throw new CliFailure(
                    "RUN_ERROR", 4, describeThrowable(unexpected.get()), unexpected.get());
        }
        if (result.get() == null) {
            throw new CliFailure("RUN_ERROR", 4, "OpMode execution produced no result", null);
        }
        return result.get();
    }

    private static LinearOpMode loadOpMode(String className) throws CliFailure {
        try {
            ClassLoader loader = Thread.currentThread().getContextClassLoader();
            if (loader == null) loader = OpModeRunnerCli.class.getClassLoader();
            loader = new SimulatorClassLoader(loader);
            Thread.currentThread().setContextClassLoader(loader);
            // Validate type and constructor shape before running user-controlled class initializers.
            Class<?> loaded = Class.forName(className, false, loader);
            if (!LinearOpMode.class.isAssignableFrom(loaded)) {
                throw new CliFailure(
                        "LOAD_ERROR",
                        3,
                        className + " does not extend " + LinearOpMode.class.getName(),
                        null);
            }
            if (Modifier.isAbstract(loaded.getModifiers()) || loaded.isInterface()) {
                throw new CliFailure("LOAD_ERROR", 3, className + " is not instantiable", null);
            }

            Class<? extends LinearOpMode> opModeClass = loaded.asSubclass(LinearOpMode.class);
            Constructor<? extends LinearOpMode> constructor = opModeClass.getDeclaredConstructor();
            if (!Modifier.isPublic(opModeClass.getModifiers())
                    || !Modifier.isPublic(constructor.getModifiers())) {
                throw new CliFailure(
                        "LOAD_ERROR",
                        3,
                        className + " must be public and have a public no-argument constructor",
                        null);
            }
            return constructor.newInstance();
        } catch (CliFailure failure) {
            throw failure;
        } catch (InvocationTargetException failure) {
            Throwable target = failure.getTargetException();
            throw new CliFailure("LOAD_ERROR", 3, describeThrowable(target), target);
        } catch (ReflectiveOperationException failure) {
            throw new CliFailure("LOAD_ERROR", 3, describeThrowable(failure), failure);
        } catch (LinkageError failure) {
            throw new CliFailure("LOAD_ERROR", 3, describeThrowable(failure), failure);
        } catch (SecurityException failure) {
            throw new CliFailure("LOAD_ERROR", 3, describeThrowable(failure), failure);
        }
    }

    private static String successJson(
            Config config,
            Execution execution,
            String capturedStdout,
            boolean capturedStdoutTruncated) {
        StringBuilder json = new StringBuilder(1_024);
        json.append('{');
        json.append("\"ok\":true");
        json.append(",\"opModeClass\":");
        appendJsonString(json, config.opModeClass);
        json.append(",\"completedCycles\":").append(execution.result.getCompletedCycles());
        json.append(",\"telemetry\":");
        appendStringMap(json, execution.result.getLatestTelemetry());
        json.append(",\"motors\":{");
        boolean first = true;
        for (Map.Entry<String, SimDcMotorEx> entry : execution.motors.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendJsonString(json, entry.getKey());
            json.append(':');
            appendMotor(json, entry.getValue());
        }
        json.append('}');
        json.append(",\"servos\":{");
        first = true;
        for (Map.Entry<String, SimServo> entry : execution.servos.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendJsonString(json, entry.getKey());
            json.append(':');
            appendServo(json, entry.getValue());
        }
        json.append('}');
        json.append(",\"capturedStdout\":");
        appendJsonString(json, capturedStdout);
        json.append(",\"capturedStdoutTruncated\":").append(capturedStdoutTruncated);
        json.append('}');
        return json.toString();
    }

    private static String failureJson(
            String kind,
            String message,
            String capturedStdout,
            boolean capturedStdoutTruncated) {
        StringBuilder json = new StringBuilder(512);
        json.append("{\"ok\":false,\"error\":{\"kind\":");
        appendJsonString(json, kind);
        json.append(",\"message\":");
        appendJsonString(json, limit(message, 2_048));
        json.append("},\"capturedStdout\":");
        appendJsonString(json, capturedStdout);
        json.append(",\"capturedStdoutTruncated\":").append(capturedStdoutTruncated);
        json.append('}');
        return json.toString();
    }

    private static void appendMotor(StringBuilder json, SimDcMotorEx motor) {
        json.append('{');
        json.append("\"power\":").append(Double.toString(motor.getPower()));
        json.append(",\"currentPosition\":").append(motor.getCurrentPosition());
        json.append(",\"targetPosition\":").append(motor.getTargetPosition());
        json.append(",\"busy\":").append(motor.isBusy());
        json.append(",\"direction\":");
        appendJsonString(json, motor.getDirection().name());
        json.append(",\"mode\":");
        appendJsonString(json, motor.getMode().name());
        json.append(",\"zeroPowerBehavior\":");
        appendJsonString(json, motor.getZeroPowerBehavior().name());
        json.append('}');
    }

    private static void appendServo(StringBuilder json, SimServo servo) {
        json.append('{');
        json.append("\"position\":").append(Double.toString(servo.getPosition()));
        json.append(",\"physicalPosition\":")
                .append(Double.toString(servo.getPhysicalPositionForSimulator()));
        json.append(",\"direction\":");
        appendJsonString(json, servo.getDirection().name());
        json.append('}');
    }

    private static void appendStringMap(StringBuilder json, Map<String, String> values) {
        json.append('{');
        boolean first = true;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (!first) json.append(',');
            first = false;
            appendJsonString(json, entry.getKey());
            json.append(':');
            appendJsonString(json, entry.getValue());
        }
        json.append('}');
    }

    private static void appendJsonString(StringBuilder json, String value) {
        json.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"':
                    json.append("\\\"");
                    break;
                case '\\':
                    json.append("\\\\");
                    break;
                case '\b':
                    json.append("\\b");
                    break;
                case '\f':
                    json.append("\\f");
                    break;
                case '\n':
                    json.append("\\n");
                    break;
                case '\r':
                    json.append("\\r");
                    break;
                case '\t':
                    json.append("\\t");
                    break;
                default:
                    if (character < 0x20) {
                        json.append("\\u");
                        String hex = Integer.toHexString(character);
                        for (int padding = hex.length(); padding < 4; padding++) json.append('0');
                        json.append(hex);
                    } else {
                        json.append(character);
                    }
            }
        }
        json.append('"');
    }

    private static String describeThrowable(Throwable throwable) {
        StringBuilder description = new StringBuilder();
        Throwable current = throwable;
        for (int depth = 0; current != null && depth < 8; depth++) {
            if (depth > 0) description.append("; caused by ");
            description.append(current.getClass().getName());
            String message = current.getMessage();
            if (message != null && message.trim().length() > 0) {
                description.append(": ").append(message);
            }
            Throwable cause = current.getCause();
            if (cause == current) break;
            current = cause;
        }
        return description.toString();
    }

    private static String limit(String value, int maximumLength) {
        if (value == null) return "Unknown error";
        if (value.length() <= maximumLength) return value;
        return value.substring(0, maximumLength) + "…";
    }

    private static final class Config {
        private String opModeClass;
        private int cycles = DEFAULT_CYCLES;
        private long cycleMillis = DEFAULT_CYCLE_MILLIS;
        private boolean cyclesSpecified;
        private boolean cycleMillisSpecified;
        private final LinkedHashMap<String, MotorProfile> motorProfiles =
                new LinkedHashMap<String, MotorProfile>();
        private final Set<String> servoNames = new LinkedHashSet<String>();
        private final LinkedHashMap<String, GamepadAssignment> gamepad1Assignments =
                new LinkedHashMap<String, GamepadAssignment>();
        private final LinkedHashMap<String, GamepadAssignment> gamepad2Assignments =
                new LinkedHashMap<String, GamepadAssignment>();

        private static Config parse(String[] args) throws CliFailure {
            if (args == null) throw argumentError("Arguments cannot be null");
            Config config = new Config();
            for (int index = 0; index < args.length; index++) {
                String option = args[index];
                if ("--class".equals(option)) {
                    if (config.opModeClass != null) throw argumentError("--class may be specified once");
                    config.opModeClass = requiredValue(args, ++index, option);
                } else if ("--cycles".equals(option)) {
                    if (config.cyclesSpecified) throw argumentError("--cycles may be specified once");
                    config.cycles = parseInteger(requiredValue(args, ++index, option), option);
                    config.cyclesSpecified = true;
                } else if ("--cycle-ms".equals(option)) {
                    if (config.cycleMillisSpecified) {
                        throw argumentError("--cycle-ms may be specified once");
                    }
                    config.cycleMillis = parseLong(requiredValue(args, ++index, option), option);
                    config.cycleMillisSpecified = true;
                } else if ("--motor".equals(option)) {
                    config.addMotorProfile(
                            MotorProfile.legacy(requiredValue(args, ++index, option)));
                } else if ("--motor-profile".equals(option)) {
                    try {
                        config.addMotorProfile(MotorProfile.parse(
                                requiredValue(args, ++index, option)));
                    } catch (IllegalArgumentException failure) {
                        throw argumentError("Invalid --motor-profile: " + failure.getMessage());
                    }
                } else if ("--servo".equals(option)) {
                    config.addServo(requiredValue(args, ++index, option));
                } else if ("--gamepad1".equals(option)) {
                    config.addGamepadAssignment(
                            config.gamepad1Assignments,
                            requiredValue(args, ++index, option),
                            option);
                } else if ("--gamepad2".equals(option)) {
                    config.addGamepadAssignment(
                            config.gamepad2Assignments,
                            requiredValue(args, ++index, option),
                            option);
                } else {
                    throw argumentError("Unknown argument: " + option);
                }
            }

            if (config.opModeClass == null) throw argumentError("--class is required");
            config.opModeClass = config.opModeClass.trim();
            if (!isJavaClassName(config.opModeClass)) {
                throw argumentError("--class must be a fully-qualified Java class name");
            }
            if (config.cycles < 1 || config.cycles > MAX_CYCLES) {
                throw argumentError("--cycles must be between 1 and " + MAX_CYCLES);
            }
            if (config.cycleMillis < 1 || config.cycleMillis > MAX_CYCLE_MILLIS) {
                throw argumentError("--cycle-ms must be between 1 and " + MAX_CYCLE_MILLIS);
            }
            if (config.cycles * config.cycleMillis > MAX_SIMULATION_MILLIS) {
                throw argumentError(
                        "--cycles multiplied by --cycle-ms cannot exceed "
                                + MAX_SIMULATION_MILLIS + " milliseconds");
            }
            return config;
        }

        private void addMotorProfile(MotorProfile profile) throws CliFailure {
            addDeviceName(profile.name);
            motorProfiles.put(profile.name, profile);
        }

        private void addServo(String rawName) throws CliFailure {
            String name = validateDeviceName(rawName);
            addDeviceName(name);
            servoNames.add(name);
        }

        private void addDeviceName(String name) throws CliFailure {
            if (motorProfiles.size() + servoNames.size() >= MAX_DEVICES) {
                throw argumentError("No more than " + MAX_DEVICES + " devices may be configured");
            }
            if (motorProfiles.containsKey(name) || servoNames.contains(name)) {
                throw argumentError("Hardware device name was configured more than once: " + name);
            }
        }

        private void addGamepadAssignment(
                LinkedHashMap<String, GamepadAssignment> assignments,
                String rawAssignment,
                String option) throws CliFailure {
            GamepadAssignment assignment = GamepadAssignment.parse(rawAssignment, option);
            if (assignments.containsKey(assignment.field)) {
                throw argumentError(option + " field was assigned more than once: " + assignment.field);
            }
            assignments.put(assignment.field, assignment);
        }

        private static String requiredValue(String[] args, int index, String option) throws CliFailure {
            if (index >= args.length || args[index].startsWith("--")) {
                throw argumentError(option + " requires a value");
            }
            return args[index];
        }

        private static int parseInteger(String raw, String option) throws CliFailure {
            try {
                return Integer.parseInt(raw);
            } catch (NumberFormatException failure) {
                throw argumentError(option + " must be an integer");
            }
        }

        private static long parseLong(String raw, String option) throws CliFailure {
            try {
                return Long.parseLong(raw);
            } catch (NumberFormatException failure) {
                throw argumentError(option + " must be an integer");
            }
        }

        private static String validateDeviceName(String rawName) throws CliFailure {
            String name = rawName.trim();
            if (name.length() == 0) throw argumentError("Hardware device names cannot be empty");
            if (name.length() > MAX_DEVICE_NAME_LENGTH) {
                throw argumentError(
                        "Hardware device names cannot exceed " + MAX_DEVICE_NAME_LENGTH + " characters");
            }
            for (int index = 0; index < name.length(); index++) {
                if (Character.isISOControl(name.charAt(index))) {
                    throw argumentError("Hardware device names cannot contain control characters");
                }
            }
            return name;
        }

        private static boolean isJavaClassName(String value) {
            if (value.length() == 0 || value.startsWith(".") || value.endsWith(".")) return false;
            String[] parts = value.split("\\.", -1);
            if (parts.length < 2) return false;
            for (String part : parts) {
                if (part.length() == 0 || !Character.isJavaIdentifierStart(part.charAt(0))) return false;
                for (int index = 1; index < part.length(); index++) {
                    if (!Character.isJavaIdentifierPart(part.charAt(index))) return false;
                }
            }
            return true;
        }
    }

    private static final class GamepadAssignment {
        private final String field;
        private final boolean booleanValue;
        private final float floatValue;

        private GamepadAssignment(String field, boolean booleanValue, float floatValue) {
            this.field = field;
            this.booleanValue = booleanValue;
            this.floatValue = floatValue;
        }

        private static GamepadAssignment parse(String raw, String option) throws CliFailure {
            int separator = raw.indexOf('=');
            if (separator < 1 || separator == raw.length() - 1) {
                throw argumentError(option + " values must use field=value");
            }
            String field = raw.substring(0, separator);
            String value = raw.substring(separator + 1);
            ValueKind kind = valueKind(field);
            if (kind == null) throw argumentError("Unsupported gamepad field: " + field);

            if (kind == ValueKind.BUTTON) {
                if (!"true".equals(value) && !"false".equals(value)) {
                    throw argumentError(field + " must be true or false");
                }
                return new GamepadAssignment(field, Boolean.parseBoolean(value), 0);
            }

            final float parsed;
            try {
                parsed = Float.parseFloat(value);
            } catch (NumberFormatException failure) {
                throw argumentError(field + " must be a number");
            }
            if (!Float.isFinite(parsed)) throw argumentError(field + " must be finite");
            float minimum = kind == ValueKind.TRIGGER ? 0.0f : -1.0f;
            if (parsed < minimum || parsed > 1.0f) {
                throw argumentError(field + " must be between " + minimum + " and 1.0");
            }
            return new GamepadAssignment(field, false, parsed);
        }

        private void apply(Gamepad gamepad) {
            if ("left_stick_x".equals(field)) gamepad.left_stick_x = floatValue;
            else if ("left_stick_y".equals(field)) gamepad.left_stick_y = floatValue;
            else if ("right_stick_x".equals(field)) gamepad.right_stick_x = floatValue;
            else if ("right_stick_y".equals(field)) gamepad.right_stick_y = floatValue;
            else if ("left_trigger".equals(field)) gamepad.left_trigger = floatValue;
            else if ("right_trigger".equals(field)) gamepad.right_trigger = floatValue;
            else if ("a".equals(field)) gamepad.a = booleanValue;
            else if ("b".equals(field)) gamepad.b = booleanValue;
            else if ("x".equals(field)) gamepad.x = booleanValue;
            else if ("y".equals(field)) gamepad.y = booleanValue;
            else if ("dpad_up".equals(field)) gamepad.dpad_up = booleanValue;
            else if ("dpad_down".equals(field)) gamepad.dpad_down = booleanValue;
            else if ("dpad_left".equals(field)) gamepad.dpad_left = booleanValue;
            else if ("dpad_right".equals(field)) gamepad.dpad_right = booleanValue;
            else if ("left_bumper".equals(field)) gamepad.left_bumper = booleanValue;
            else if ("right_bumper".equals(field)) gamepad.right_bumper = booleanValue;
            else if ("left_stick_button".equals(field)) gamepad.left_stick_button = booleanValue;
            else if ("right_stick_button".equals(field)) gamepad.right_stick_button = booleanValue;
            else if ("start".equals(field)) gamepad.start = booleanValue;
            else if ("back".equals(field)) gamepad.back = booleanValue;
            else if ("guide".equals(field)) gamepad.guide = booleanValue;
        }

        private static ValueKind valueKind(String field) {
            if ("left_stick_x".equals(field) || "left_stick_y".equals(field)
                    || "right_stick_x".equals(field) || "right_stick_y".equals(field)) {
                return ValueKind.AXIS;
            }
            if ("left_trigger".equals(field) || "right_trigger".equals(field)) {
                return ValueKind.TRIGGER;
            }
            if ("a".equals(field) || "b".equals(field) || "x".equals(field) || "y".equals(field)
                    || "dpad_up".equals(field) || "dpad_down".equals(field)
                    || "dpad_left".equals(field) || "dpad_right".equals(field)
                    || "left_bumper".equals(field) || "right_bumper".equals(field)
                    || "left_stick_button".equals(field) || "right_stick_button".equals(field)
                    || "start".equals(field) || "back".equals(field) || "guide".equals(field)) {
                return ValueKind.BUTTON;
            }
            return null;
        }
    }

    private enum ValueKind {
        AXIS,
        TRIGGER,
        BUTTON
    }

    private static final class Execution {
        private final SimulationResult result;
        private final LinkedHashMap<String, SimDcMotorEx> motors;
        private final LinkedHashMap<String, SimServo> servos;

        private Execution(
                SimulationResult result,
                LinkedHashMap<String, SimDcMotorEx> motors,
                LinkedHashMap<String, SimServo> servos) {
            this.result = result;
            this.motors = motors;
            this.servos = servos;
        }
    }

    private static final class CliFailure extends Exception {
        private static final long serialVersionUID = 1L;
        private final String kind;
        private final int exitCode;

        private CliFailure(String kind, int exitCode, String message, Throwable cause) {
            super(message, cause);
            this.kind = kind;
            this.exitCode = exitCode;
        }
    }

    private static CliFailure argumentError(String message) {
        return new CliFailure("ARGUMENT_ERROR", 2, message, null);
    }

    private static final class CappedOutputStream extends OutputStream {
        private final int maximumBytes;
        private final ByteArrayOutputStream stored = new ByteArrayOutputStream();
        private boolean truncated;

        private CappedOutputStream(int maximumBytes) {
            this.maximumBytes = maximumBytes;
        }

        @Override
        public synchronized void write(int value) {
            if (stored.size() < maximumBytes) stored.write(value);
            else truncated = true;
        }

        @Override
        public synchronized void write(byte[] bytes, int offset, int length) {
            if (bytes == null) throw new NullPointerException("bytes");
            if (offset < 0 || length < 0 || offset > bytes.length || length > bytes.length - offset) {
                throw new IndexOutOfBoundsException();
            }
            int available = maximumBytes - stored.size();
            int accepted = Math.min(available, length);
            if (accepted > 0) stored.write(bytes, offset, accepted);
            if (accepted < length) truncated = true;
        }

        private synchronized String asUtf8() {
            return new String(stored.toByteArray(), StandardCharsets.UTF_8);
        }

        private synchronized boolean wasTruncated() {
            return truncated;
        }
    }
}
