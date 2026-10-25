package org.firstinspires.ftc.teamcode;

import com.pedropathing.follower.Follower;
import com.pedropathing.algorithm.Foresight;
import com.pedropathing.algorithm.ForesightConfig;
import com.pedropathing.controllers.Controller;
import com.pedropathing.math.Matrix;
import com.pedropathing.math.Vector2D;
import com.pedropathing.api.PoseFactory;
import com.pedropathing.api.Paths;
import com.pedropathing.revhub.localizers.PinpointConfig;
import com.pedropathing.revhub.localizers.PinpointLocalizer;
import com.pedropathing.revhub.drivetrains.Mecanum;
import com.pedropathing.revhub.drivetrains.MecanumConfig;
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;

@Autonomous(name="Pedro 3 acceptance")
public final class Pedro3Acceptance extends OpMode {
    private Follower follower;
    @Override public void init() {
        PinpointConfig localizer = new PinpointConfig(c -> {
            c.name.set("pinpoint");
            c.xPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
            c.yPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD);
            c.xPodOffset.set(0.0); c.yPodOffset.set(0.0);
        });
        MecanumConfig drive = new MecanumConfig(c -> {
            c.frontLeftName.set("leftFront");c.frontRightName.set("rightFront");
            c.backLeftName.set("leftBack");c.backRightName.set("rightBack");
            c.frontLeftDirection.set(DcMotorSimple.Direction.FORWARD);c.frontRightDirection.set(DcMotorSimple.Direction.FORWARD);
            c.backLeftDirection.set(DcMotorSimple.Direction.FORWARD);c.backRightDirection.set(DcMotorSimple.Direction.FORWARD);
        });
        ForesightConfig algorithm = new ForesightConfig(c -> {
            c.headingFeedback.set(Controller.pid(2,0,0));
            c.forwardTranslational.set(Controller.pid(0.12,0,0));c.strafeTranslational.set(Controller.pid(0.12,0,0));
            c.brake.set(Controller.pid(0.05,0,0));c.coast.set(Controller.pid(0.05,0,0));
            c.linearBrakeCoefficients.set(Matrix.diag(0.05,0.05));c.quadraticBrakeCoefficients.set(Matrix.zero(2));
            c.headingBrakeCoefficients.set(Vector2D.cartesian(0.05,0));
            c.maxAchievableForwardVelocity.set(55.0);c.maxAchievableStrafeVelocity.set(55.0);
            c.naturalForwardDeceleration.set(120.0);c.naturalStrafeDeceleration.set(120.0);
        });
        follower = new Follower(new PinpointLocalizer(hardwareMap,localizer),new Mecanum(hardwareMap,drive),new Foresight(algorithm));
        follower.setPose(PoseFactory.radians().of(0,0,0));telemetry.setMsTransmissionInterval(0);
    }
    @Override public void start() { follower.follow(Paths.line(PoseFactory.radians().of(0,0,0),PoseFactory.radians().of(20,0,0)).constant(0)); }
    @Override public void loop() { follower.update();telemetry.addData("x",follower.pose().x());telemetry.addData("y",follower.pose().y());telemetry.addData("busy",follower.isBusy());telemetry.update(); }
    @Override public void stop() { follower.stop(); }
}
