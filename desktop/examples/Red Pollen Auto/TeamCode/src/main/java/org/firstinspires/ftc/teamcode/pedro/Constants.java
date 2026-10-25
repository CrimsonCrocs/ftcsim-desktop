package org.firstinspires.ftc.teamcode.pedro;

import com.pedropathing.algorithm.Foresight;
import com.pedropathing.algorithm.ForesightConfig;
import com.pedropathing.controllers.Controller;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Matrix;
import com.pedropathing.math.Vector2D;
import com.pedropathing.revhub.drivetrains.Mecanum;
import com.pedropathing.revhub.drivetrains.MecanumConfig;
import com.pedropathing.revhub.localizers.PinpointConfig;
import com.pedropathing.revhub.localizers.PinpointLocalizer;
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.hardware.HardwareMap;

public final class Constants {
    private Constants() {}

    public static Follower create(HardwareMap hardwareMap) {
        PinpointConfig localizer = new PinpointConfig(c -> {
            c.name.set("odo");
            c.xPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
            c.yPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
            c.xPodOffset.set(0.0);
            c.yPodOffset.set(0.0);
        });
        MecanumConfig drive = new MecanumConfig(c -> {
            c.frontLeftName.set("front_left_drive");
            c.frontRightName.set("front_right_drive");
            c.backLeftName.set("back_left_drive");
            c.backRightName.set("back_right_drive");
            c.frontLeftDirection.set(DcMotorSimple.Direction.FORWARD);
            c.frontRightDirection.set(DcMotorSimple.Direction.REVERSE);
            c.backLeftDirection.set(DcMotorSimple.Direction.FORWARD);
            c.backRightDirection.set(DcMotorSimple.Direction.REVERSE);
        });
        ForesightConfig algorithm = new ForesightConfig(c -> {
            c.maxVelocityConstraint.set(32.0);
            c.headingFeedback.set(Controller.pid(2.0, 0.0, 0.0));
            c.forwardTranslational.set(Controller.pid(0.12, 0.0, 0.0));
            c.strafeTranslational.set(Controller.pid(0.12, 0.0, 0.0));
            c.brake.set(Controller.pid(0.05, 0.0, 0.0));
            c.coast.set(Controller.pid(0.05, 0.0, 0.0));
            c.linearBrakeCoefficients.set(Matrix.diag(0.05, 0.05));
            c.quadraticBrakeCoefficients.set(Matrix.zero(2));
            c.headingBrakeCoefficients.set(Vector2D.cartesian(0.05, 0.0));
            c.maxAchievableForwardVelocity.set(55.0);
            c.maxAchievableStrafeVelocity.set(55.0);
            c.naturalForwardDeceleration.set(120.0);
            c.naturalStrafeDeceleration.set(120.0);
        });
        return new Follower(new PinpointLocalizer(hardwareMap, localizer),
                new Mecanum(hardwareMap, drive), new Foresight(algorithm));
    }
}
