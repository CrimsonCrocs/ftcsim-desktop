package org.firstinspires.ftc.sim;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.robotcore.hardware.AnalogInput;
import com.qualcomm.robotcore.hardware.HardwareMap;

import java.io.UnsupportedEncodingException;
import java.net.URLDecoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Installs only configured devices and applies one complete, timestamped world sensor frame. */
public final class SimulatorSensorHub {
    private final Map<String, SensorProfile> profiles = new LinkedHashMap<String, SensorProfile>();
    private final Map<String, SimulatorDigitalChannel> digital =
            new LinkedHashMap<String, SimulatorDigitalChannel>();
    private final Map<String, SimulatorAnalogInputController> analog =
            new LinkedHashMap<String, SimulatorAnalogInputController>();
    private final Map<String, SimulatorDistanceSensor> distance =
            new LinkedHashMap<String, SimulatorDistanceSensor>();
    private final Map<String, SimulatorColorSensor> color =
            new LinkedHashMap<String, SimulatorColorSensor>();
    private final Map<String, SimulatorOdometrySensor> odometry =
            new LinkedHashMap<String, SimulatorOdometrySensor>();
    private final Map<String, SparkFunOTOS> optical = new LinkedHashMap<String, SparkFunOTOS>();
    private final Map<String, GoBildaPinpointDriver> pinpoints =
            new LinkedHashMap<String, GoBildaPinpointDriver>();
    private final Map<String, SimulatorVisionRuntime> cameras =
            new LinkedHashMap<String, SimulatorVisionRuntime>();
    private List<SimulatorAprilTagObservation> aprilTags = Collections.emptyList();
    private long sampleTimeMillis = -1;

    public SimulatorSensorHub(HardwareMap hardwareMap, List<SensorProfile> configuredSensors) {
        this(hardwareMap, configuredSensors, Collections.<CameraProfile>emptyList());
    }

    public SimulatorSensorHub(
            HardwareMap hardwareMap,
            List<SensorProfile> configuredSensors,
            List<CameraProfile> configuredCameras) {
        if (hardwareMap == null || configuredSensors == null || configuredCameras == null) {
            throw new IllegalArgumentException("hardware map, sensor configuration and camera configuration are required");
        }
        for (SensorProfile profile : configuredSensors) {
            if (profile == null) throw new IllegalArgumentException("sensor configuration cannot contain null");
            if (profiles.put(profile.name, profile) != null) {
                throw new IllegalArgumentException("Duplicate configured sensor name '" + profile.name + "'");
            }
            switch (profile.kind) {
                case DIGITAL:
                    digital.put(profile.name, hardwareMap.putForSimulator(
                            profile.name, new SimulatorDigitalChannel(profile.name)));
                    break;
                case ANALOG:
                    SimulatorAnalogInputController controller =
                            new SimulatorAnalogInputController(profile.name);
                    analog.put(profile.name, controller);
                    hardwareMap.putForSimulator(profile.name, new AnalogInput(controller, 0));
                    break;
                case DISTANCE:
                    distance.put(profile.name, hardwareMap.putForSimulator(
                            profile.name, new SimulatorDistanceSensor(profile.name)));
                    break;
                case COLOR:
                    color.put(profile.name, hardwareMap.putForSimulator(
                            profile.name, new SimulatorColorSensor(profile.name)));
                    break;
                case ODOMETRY:
                    optical.put(profile.name, hardwareMap.putForSimulator(profile.name, new SparkFunOTOS()));
                    odometry.put(profile.name, hardwareMap.putForSimulator(
                            profile.name, new SimulatorOdometrySensor(profile.name)));
                    break;
                case PINPOINT:
                    pinpoints.put(profile.name, hardwareMap.putForSimulator(
                            profile.name, new GoBildaPinpointDriver()));
                    break;
                default:
                    throw new IllegalArgumentException("Unsupported configured sensor kind " + profile.kind);
            }
        }
        for (CameraProfile profile : configuredCameras) {
            if (profile == null) throw new IllegalArgumentException("camera configuration cannot contain null");
            if (profiles.containsKey(profile.name) || cameras.containsKey(profile.name)
                    || hardwareMap.contains(profile.name)) {
                throw new IllegalArgumentException("Duplicate configured camera or hardware name '" + profile.name + "'");
            }
            SimulatorVisionRuntime runtime = new SimulatorVisionRuntime(profile.name);
            cameras.put(profile.name, runtime);
            hardwareMap.putForSimulator(profile.name, new SimulatorWebcamName(profile.name, runtime));
        }
    }

    /** Parses flattened v3 values and rejects any missing configured measurement or unknown name. */
    public synchronized void applyFeedbackForSimulator(
            String encoded,
            String robotId,
            long tick,
            long simulationTimeMillis,
            double yawRadians,
            double pitchRadians,
            double rollRadians,
            double angularVelocityX,
            double angularVelocityY,
            double angularVelocityZ) {
        if (simulationTimeMillis < 0 || tick < 0) {
            throw new IllegalArgumentException("sensor frame time and tick cannot be negative");
        }
        if (robotId == null || robotId.length() == 0) {
            throw new IllegalArgumentException("sensor frame robotId cannot be empty");
        }
        finite(yawRadians, "yaw"); finite(pitchRadians, "pitch"); finite(rollRadians, "roll");
        finite(angularVelocityX, "angular velocity x");
        finite(angularVelocityY, "angular velocity y");
        finite(angularVelocityZ, "angular velocity z");
        if (sampleTimeMillis >= 0 && simulationTimeMillis < sampleTimeMillis) {
            throw new IllegalArgumentException("Sensor frame time cannot move backwards");
        }

        Map<String, String> values = decodeValues(encoded);
        Map<String, Double> seen = new LinkedHashMap<String, Double>();
        Map<String, List<SimulatorAprilTagObservation>> frameTags =
                new LinkedHashMap<String, List<SimulatorAprilTagObservation>>();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            int separator = entry.getKey().indexOf(':');
            if (separator < 1) throw new IllegalArgumentException("Malformed sensor field '" + entry.getKey() + "'");
            String category = entry.getKey().substring(0, separator);
            String name = entry.getKey().substring(separator + 1);
            String value = entry.getValue();
            if ("digital".equals(category)) {
                value = decode(value);
                SimulatorDigitalChannel sensor = required(digital, name, category);
                if (!("true".equals(value) || "false".equals(value))) {
                    throw new IllegalArgumentException("Digital sensor '" + name + "' must be true or false");
                }
                sensor.applyFeedbackForSimulator(Boolean.parseBoolean(value), simulationTimeMillis);
            } else if ("analog".equals(category)) {
                value = decode(value);
                SimulatorAnalogInputController sensor = required(analog, name, category);
                sensor.applyFeedbackForSimulator(number(value, "analog '" + name + "'"), simulationTimeMillis);
            } else if ("distance".equals(category)) {
                value = decode(value);
                SimulatorDistanceSensor sensor = required(distance, name, category);
                sensor.applyFeedbackForSimulator(number(value, "distance '" + name + "'"), simulationTimeMillis);
            } else if ("color".equals(category)) {
                value = decode(value);
                SimulatorColorSensor sensor = required(color, name, category);
                String[] channels = value.split(",", -1);
                if (channels.length != 4) throw new IllegalArgumentException("Color sensor '" + name + "' needs RGBA");
                sensor.applyFeedbackForSimulator(
                        integer(channels[0], "red"), integer(channels[1], "green"),
                        integer(channels[2], "blue"), integer(channels[3], "alpha"), simulationTimeMillis);
            } else if ("odometry".equals(category)) {
                value = decode(value);
                SensorProfile profile = profiles.get(name);
                if (profile == null || (profile.kind != SensorProfile.Kind.ODOMETRY
                        && profile.kind != SensorProfile.Kind.PINPOINT)) {
                    throw unknown(category, name);
                }
                String[] valuesByAxis = value.split(",", -1);
                if (valuesByAxis.length != 6) throw new IllegalArgumentException("Odometry sensor '" + name + "' needs six values");
                double x = number(valuesByAxis[0], "odometry x");
                double y = number(valuesByAxis[1], "odometry y");
                double heading = number(valuesByAxis[2], "odometry heading");
                double vx = number(valuesByAxis[3], "odometry x velocity");
                double vy = number(valuesByAxis[4], "odometry y velocity");
                double omega = number(valuesByAxis[5], "odometry angular velocity");
                SparkFunOTOS otos = optical.get(name);
                if (otos != null) otos.applyFeedbackForSimulator(x, y, heading, vx, vy, omega, simulationTimeMillis);
                SimulatorOdometrySensor generic = odometry.get(name);
                if (generic != null) {
                    generic.applyFeedbackForSimulator(x, y, heading, vx, vy, omega, simulationTimeMillis);
                }
                GoBildaPinpointDriver pinpoint = pinpoints.get(name);
                if (pinpoint != null) {
                    pinpoint.applyFeedbackForSimulator(
                            x, y, heading, vx, vy, omega, pitchRadians, rollRadians, simulationTimeMillis);
                }
            } else if ("image".equals(category)) {
                required(cameras,name,category).applyEncodedImageForSimulator(decode(value),simulationTimeMillis);
            } else if ("tag".equals(category)) {
                SimulatorAprilTagObservation observation = SimulatorAprilTagObservation.parse(name, decode(value));
                if (!cameras.containsKey(observation.camera)) {
                    throw new IllegalArgumentException("AprilTag frame references unconfigured camera '"
                            + observation.camera + "'");
                }
                if (observation.captureTimeMillis > simulationTimeMillis
                        || observation.availableTimeMillis < observation.captureTimeMillis) {
                    throw new IllegalArgumentException("AprilTag observation has invalid capture/availability time");
                }
                if (observation.availableTimeMillis <= simulationTimeMillis) {
                    List<SimulatorAprilTagObservation> byCamera = frameTags.get(observation.camera);
                    if (byCamera == null) {
                        byCamera = new ArrayList<SimulatorAprilTagObservation>();
                        frameTags.put(observation.camera, byCamera);
                    }
                    byCamera.add(observation);
                }
            } else {
                throw new IllegalArgumentException("Unknown sensor frame category '" + category + "'");
            }
            String countKey = category + ":" + name;
            seen.put(countKey, 1.0);
        }

        requireAllSeen(digital, "digital", seen);
        requireAllSeen(analog, "analog", seen);
        requireAllSeen(distance, "distance", seen);
        requireAllSeen(color, "color", seen);
        requireAllSeen(odometry, "odometry", seen);
        requireAllSeen(pinpoints, "odometry", seen);
        List<SimulatorAprilTagObservation> visible = new ArrayList<SimulatorAprilTagObservation>();
        for (List<SimulatorAprilTagObservation> cameraTags : frameTags.values()) visible.addAll(cameraTags);
        for (Map.Entry<String, SimulatorVisionRuntime> entry : cameras.entrySet()) {
            List<SimulatorAprilTagObservation> cameraTags = frameTags.get(entry.getKey());
            entry.getValue().applyWorldFrameForSimulator(
                    cameraTags == null ? Collections.<SimulatorAprilTagObservation>emptyList() : cameraTags,
                    simulationTimeMillis);
        }
        aprilTags = Collections.unmodifiableList(visible);
        sampleTimeMillis = simulationTimeMillis;
    }

    public synchronized List<SimulatorAprilTagObservation> getAprilTagObservationsForSimulator() {
        if (sampleTimeMillis < 0) throw new IllegalStateException("No AprilTag frame has been applied");
        return aprilTags;
    }

    public synchronized void resetVisionConsumersForSimulator() {
        for(SimulatorVisionRuntime camera:cameras.values()) camera.resetConsumersForSimulator();
    }

    public List<String> getCameraFrameRequestsForSimulator() {
        // Configured cameras are immutable after construction. Do not hold the
        // sensor-hub monitor while asking a user-owned portal about its state.
        List<String> requests = new ArrayList<String>();
        for(Map.Entry<String,SimulatorVisionRuntime> entry:cameras.entrySet()) {
            if(entry.getValue().wantsImageForSimulator()) requests.add(entry.getKey());
        }
        return requests;
    }

    public synchronized Map<String, Boolean> getDigitalOutputsForSimulator() {
        Map<String, Boolean> outputs = new LinkedHashMap<String, Boolean>();
        for (Map.Entry<String, SimulatorDigitalChannel> entry : digital.entrySet()) {
            if (entry.getValue().getMode() == com.qualcomm.robotcore.hardware.DigitalChannel.Mode.OUTPUT) {
                outputs.put(entry.getKey(), entry.getValue().getOutputStateForSimulator());
            }
        }
        return outputs;
    }

    public synchronized void neutralizeOutputsForSimulator() {
        for (SimulatorDigitalChannel channel : digital.values()) channel.neutralizeForSimulator();
    }

    public synchronized long getSampleTimeMillisForSimulator() { return sampleTimeMillis; }

    private static Map<String, String> decodeValues(String encoded) {
        Map<String, String> values = new LinkedHashMap<String, String>();
        if (encoded == null || encoded.length() == 0) return values;
        for (String pair : encoded.split("&")) {
            int equals = pair.indexOf('=');
            if (equals < 1) throw new IllegalArgumentException("Malformed sensor frame entry");
            String key = decode(pair.substring(0, equals));
            String value = pair.substring(equals + 1);
            if (values.put(key, value) != null) throw new IllegalArgumentException("Duplicate sensor frame entry '" + key + "'");
        }
        return values;
    }

    private static String decode(String value) {
        try {
            return URLDecoder.decode(value, "UTF-8");
        } catch (UnsupportedEncodingException impossibleUtf8Failure) {
            throw new IllegalStateException("UTF-8 is unavailable", impossibleUtf8Failure);
        }
    }

    private static double number(String value, String field) {
        try {
            double parsed = Double.parseDouble(value);
            if (!Double.isFinite(parsed)) throw new NumberFormatException("not finite");
            return parsed;
        } catch (NumberFormatException failure) {
            throw new IllegalArgumentException(field + " must be finite numeric data", failure);
        }
    }

    private static int integer(String value, String field) {
        try { return Integer.parseInt(value); }
        catch (NumberFormatException failure) { throw new IllegalArgumentException(field + " must be an integer", failure); }
    }

    private static <T> T required(Map<String, T> devices, String name, String category) {
        T value = devices.get(name);
        if (value == null) throw unknown(category, name);
        return value;
    }

    private static IllegalArgumentException unknown(String category, String name) {
        return new IllegalArgumentException("Sensor frame references unconfigured " + category + " device '" + name + "'");
    }

    private static void requireAllSeen(Map<String, ?> devices, String category, Map<String, Double> seen) {
        for (String name : devices.keySet()) {
            if (!seen.containsKey(category + ":" + name)) {
                throw new IllegalArgumentException("Sensor frame is missing configured " + category + " device '" + name + "'");
            }
        }
    }

    private static void finite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }
}
