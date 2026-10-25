package org.firstinspires.ftc.sim;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.hardware.AnalogInput;
import com.qualcomm.robotcore.hardware.ColorSensor;
import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.DistanceSensor;
import com.qualcomm.robotcore.hardware.HardwareMap;
import com.qualcomm.robotcore.hardware.NormalizedColorSensor;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

import java.util.Arrays;

/** Verifies that hardware adapters expose only configured, timestamped world observations. */
public final class HardwareSensorContractSmokeTest {
    public static void main(String[] args) {
        HardwareMap hardware = new HardwareMap();
        SimulatorSensorHub hub = new SimulatorSensorHub(hardware, Arrays.asList(
                SensorProfile.parse("v1,beam,DIGITAL"),
                SensorProfile.parse("v1,arm-pot,ANALOG"),
                SensorProfile.parse("v1,range,DISTANCE"),
                SensorProfile.parse("v1,ground-color,COLOR"),
                SensorProfile.parse("v1,dead-wheel,ODOMETRY"),
                SensorProfile.parse("v1,pinpoint,PINPOINT")), Arrays.asList(
                CameraProfile.parse("v1,front%20cam"),
                CameraProfile.parse("v1,rear")));

        try {
            hardware.get(DigitalChannel.class, "beam").getState();
            throw new AssertionError("unfed digital input returned a default state");
        } catch (IllegalStateException expected) {
            require(expected.getMessage().contains("No digital sensor frame"), "digital error should identify missing frame");
        }

        String values = "digital%3Abeam=true"
                + "&analog%3Aarm-pot=1.65"
                + "&distance%3Arange=0.5"
                + "&color%3Aground-color=30,60,90,255"
                + "&odometry%3Adead-wheel=1.2,-0.4,0.7,0.1,0.2,0.03"
                + "&odometry%3Apinpoint=1.2,-0.4,0.7,0.1,0.2,0.03"
                + "&tag%3A7%3Afront=7,front%20cam,90,100,1,2,3,0,0,0,1,2.5,0.2,-0.1"
                + "&tag%3A8%3Arear=8,rear,95,160,1,2,3,0,0,0,1,3.5,0.1,0.2";
        hub.applyFeedbackForSimulator(values, "red-1", 4, 100,
                0.7, 0.1, -0.2, 0.01, 0.02, 0.03);

        require(hardware.get(DigitalChannel.class, "beam").getState(), "beam break input should use world state");
        require(hardware.get(AnalogInput.class, "arm-pot").getVoltage() == 1.65, "analog input should use frame voltage");
        require(hardware.get(AnalogInput.class, "arm-pot").getMaxVoltage() == 3.3, "analog max should match hub range");
        require(close(hardware.get(DistanceSensor.class, "range").getDistance(DistanceUnit.INCH), 0.5 / 0.0254),
                "distance should convert from world metres into requested SDK units");
        ColorSensor color = hardware.get(ColorSensor.class, "ground-color");
        require(color.red() == 30 && color.green() == 60 && color.blue() == 90 && color.alpha() == 255,
                "color channels should match the world frame");
        float normalizedBlue = hardware.get(NormalizedColorSensor.class, "ground-color")
                .getNormalizedColors().blue;
        require(Math.abs(normalizedBlue - 90.0 / 255.0) < 1e-6,
                "normalized color should derive from the same measured RGBA sample");

        SimulatorOdometrySensor odometry = hardware.get(SimulatorOdometrySensor.class, "dead-wheel");
        require(close(odometry.getXPositionMeters(), 1.2) && close(odometry.getYPositionMeters(), -0.4),
                "odometry pose should match the world frame");
        require(odometry.getSampleTimeMillis() == 100, "odometry must preserve its world timestamp");
        GoBildaPinpointDriver pinpoint = hardware.get(GoBildaPinpointDriver.class, "pinpoint");
        pinpoint.update();
        require(close(pinpoint.getPosX(DistanceUnit.METER), 1.2), "Pinpoint X should use configured odometry frame");
        require(close(pinpoint.getHeading(AngleUnit.RADIANS), 0.7), "Pinpoint heading should use configured odometry frame");
        require(pinpoint.getDeviceStatus() == GoBildaPinpointDriver.DeviceStatus.READY,
                "Pinpoint should become ready only after receiving a sample");

        SimulatorIMU imu = new SimulatorIMU();
        // The v3 worker maps simulator (+X forward, +Y up, +Z right) rates into FTC
        // RobotCoordinateSystem (+X right, +Y forward, +Z up) before this adapter boundary.
        imu.applyFeedbackForSimulator(0.7, 0.1, -0.2, 0.6, 0.4, -0.5, 100_000_000L);
        require(close(imu.getRobotYawPitchRollAngles().getPitch(AngleUnit.RADIANS), 0.1)
                        && close(imu.getRobotYawPitchRollAngles().getRoll(AngleUnit.RADIANS), -0.2),
                "IMU should retain pitch and roll, not just planar heading");
        require(closeRate(imu.getRobotAngularVelocity(AngleUnit.RADIANS).xRotationRate, 0.6)
                        && closeRate(imu.getRobotAngularVelocity(AngleUnit.RADIANS).yRotationRate, 0.4)
                        && closeRate(imu.getRobotAngularVelocity(AngleUnit.RADIANS).zRotationRate, -0.5)
                        && imu.getRobotYawPitchRollAngles().getAcquisitionTime() == 100_000_000L,
                "IMU rates should use FTC XYZ axes and preserve the world acquisition time");
        SimulatorVoltageSensor voltage = new SimulatorVoltageSensor(12.8);
        voltage.applyFeedbackForSimulator(12.2, 3.1);
        require(close(voltage.getVoltage(), 12.2)
                        && close(voltage.getCurrentAmpsForSimulator(), 3.1),
                "Control Hub voltage and aggregate current should be physically fed");

        require(hub.getAprilTagObservationsForSimulator().size() == 1,
                "AprilTag observations should stay hidden until camera latency expires");
        SimulatorAprilTagObservation tag = hub.getAprilTagObservationsForSimulator().get(0);
        require(tag.id == 7 && "front cam".equals(tag.camera), "tag identity and camera must be preserved");
        require(tag.captureTimeMillis == 90 && tag.availableTimeMillis == 100,
                "tag capture and delivery timestamps must be preserved");

        try {
            hub.applyFeedbackForSimulator("digital%3Aghost=true", "red-1", 5, 120,
                    0, 0, 0, 0, 0, 0);
            throw new AssertionError("unconfigured sensor frame should be rejected");
        } catch (IllegalArgumentException expected) {
            require(expected.getMessage().contains("unconfigured digital device 'ghost'"),
                    "unknown sensor error should identify the device");
        }

        try {
            hub.applyFeedbackForSimulator("digital%3Abeam=false", "red-1", 5, 120,
                    0, 0, 0, 0, 0, 0);
            throw new AssertionError("incomplete sensor frame should be rejected");
        } catch (IllegalArgumentException expected) {
            require(expected.getMessage().contains("missing configured analog device 'arm-pot'"),
                    "missing sensor error should identify the configured device");
        }
        System.out.println("hardware sensor frame contract tests passed");
    }

    private static boolean close(double actual, double expected) {
        return Math.abs(actual - expected) < 1e-9;
    }

    private static boolean closeRate(double actual, double expected) {
        return Math.abs(actual - expected) < 1e-6;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
