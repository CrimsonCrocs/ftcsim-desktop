package org.firstinspires.ftc.teamcode;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Pose2D;

/** Minimal TeamCode fixture that reads a world-backed Pinpoint pose each loop. */
@Autonomous(name = "Pinpoint pose smoke")
public final class PinpointPoseOpMode extends OpMode {
    public double xMeters;
    public double yMeters;
    public double headingRadians;

    private GoBildaPinpointDriver pinpoint;

    @Override public void init() {
        pinpoint = hardwareMap.get(GoBildaPinpointDriver.class, "pinpoint");
    }

    @Override public void loop() {
        pinpoint.update();
        Pose2D position = pinpoint.getPosition();
        xMeters = position.getX(DistanceUnit.METER);
        yMeters = position.getY(DistanceUnit.METER);
        headingRadians = pinpoint.getHeading(AngleUnit.RADIANS);
        telemetry.addData("pinpoint", "%.3f, %.3f, %.3f", xMeters, yMeters, headingRadians);
        telemetry.update();
    }
}
