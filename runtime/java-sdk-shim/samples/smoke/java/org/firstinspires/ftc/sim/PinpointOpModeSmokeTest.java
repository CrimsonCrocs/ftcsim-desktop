package org.firstinspires.ftc.sim;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.hardware.Gamepad;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;
import org.firstinspires.ftc.teamcode.PinpointPoseOpMode;

import java.util.Arrays;

/** Runs a real FTC OpMode against one world-fed Pinpoint sample. */
public final class PinpointOpModeSmokeTest {
    public static void main(String[] args) {
        HardwareMap hardware = new HardwareMap();
        SimulatorSensorHub hub = new SimulatorSensorHub(hardware, Arrays.asList(
                SensorProfile.parse("v1,pinpoint,PINPOINT")));
        hub.applyFeedbackForSimulator(
                "odometry%3Apinpoint=1.2,-0.4,0.7,0.1,0.2,0.03",
                "red-1", 4, 100, 0.7, 0.1, -0.2, 0, 0, 0);

        PinpointPoseOpMode opMode = new PinpointPoseOpMode();
        opMode.initializeForSimulator(
                hardware, new SimulatorTelemetry(), new Gamepad(), new Gamepad());
        opMode.init();
        opMode.loop();

        GoBildaPinpointDriver pinpoint = hardware.get(GoBildaPinpointDriver.class, "pinpoint");
        require(close(opMode.xMeters, 1.2), "OpMode should read world-fed Pinpoint X");
        require(close(opMode.yMeters, -0.4), "OpMode should read world-fed Pinpoint Y");
        require(close(opMode.headingRadians, 0.7), "OpMode should read world-fed Pinpoint heading");
        require(close(pinpoint.getHeading(AngleUnit.RADIANS), 0.7),
                "Pinpoint adapter should retain world-fed heading after the OpMode loop");
        require(pinpoint.getDeviceStatus() == GoBildaPinpointDriver.DeviceStatus.READY,
                "world-fed Pinpoint should report ready");

        pinpoint.setYawScalar(2.0);
        require(close(pinpoint.getYawScalar(), 2.0), "Pinpoint yaw scalar should retain software configuration");
        require(close(pinpoint.getHeading(AngleUnit.RADIANS), 1.4),
                "Pinpoint yaw scalar should affect computed heading");

        pinpoint.setPosition(new Pose2D(
                DistanceUnit.METER, 4.0, 5.0, AngleUnit.RADIANS, 1.1));
        Pose2D positioned = pinpoint.getPosition();
        require(close(positioned.getX(DistanceUnit.METER), 4.0)
                        && close(positioned.getY(DistanceUnit.METER), 5.0)
                        && close(positioned.getHeading(AngleUnit.RADIANS), 1.1),
                "Pinpoint setPosition should update the adapter's reported pose");

        pinpoint.resetPosAndIMU();
        Pose2D reset = pinpoint.getPosition();
        require(close(reset.getX(DistanceUnit.METER), 0)
                        && close(reset.getY(DistanceUnit.METER), 0)
                        && close(reset.getHeading(AngleUnit.RADIANS), 0),
                "Pinpoint reset should zero the current pose in the limited simulator model");

        hub.applyFeedbackForSimulator(
                "odometry%3Apinpoint=1.5,-0.1,0.8,0.1,0.2,0.03",
                "red-1", 5, 105, 0.8, 0.1, -0.2, 0, 0, 0);
        Pose2D afterReset = pinpoint.getPosition();
        require(close(afterReset.getX(DistanceUnit.METER), 0.3)
                        && close(afterReset.getY(DistanceUnit.METER), 0.3)
                        && close(afterReset.getHeading(AngleUnit.RADIANS), 0.2),
                "Pinpoint reset offsets should continue to follow later world pose feedback");
        System.out.println("Pinpoint OpMode pose feedback test passed");
    }

    private static boolean close(double actual, double expected) {
        return Math.abs(actual - expected) < 1e-9;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
