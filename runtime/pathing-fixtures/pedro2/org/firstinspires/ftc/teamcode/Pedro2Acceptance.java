package org.firstinspires.ftc.teamcode;

import com.pedropathing.follower.Follower;
import com.pedropathing.follower.FollowerConstants;
import com.pedropathing.control.PIDFCoefficients;
import com.pedropathing.control.FilteredPIDFCoefficients;
import com.pedropathing.ftc.FollowerBuilder;
import com.pedropathing.ftc.drivetrains.MecanumConstants;
import com.pedropathing.ftc.localization.constants.PinpointConstants;
import com.pedropathing.geometry.BezierLine;
import com.pedropathing.geometry.Pose;
import com.pedropathing.paths.Path;
import com.qualcomm.robotcore.hardware.DcMotorSimple;
import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;

@Autonomous(name="Pedro 2 acceptance")
public final class Pedro2Acceptance extends OpMode {
    private Follower follower;
    @Override public void init() {
        FollowerConstants f=new FollowerConstants();f.mass=14;f.forwardZeroPowerAcceleration=-120;f.lateralZeroPowerAcceleration=-120;
        f.coefficientsTranslationalPIDF=new PIDFCoefficients(.12,0,0,0);f.coefficientsHeadingPIDF=new PIDFCoefficients(2,0,0,0);
        f.coefficientsDrivePIDF=new FilteredPIDFCoefficients(.02,0,0,0,0);f.usePredictiveBraking=false;
        MecanumConstants m=new MecanumConstants().leftFrontMotorName("leftFront").rightFrontMotorName("rightFront").leftRearMotorName("leftBack").rightRearMotorName("rightBack")
                .leftFrontMotorDirection(DcMotorSimple.Direction.FORWARD).rightFrontMotorDirection(DcMotorSimple.Direction.FORWARD)
                .leftRearMotorDirection(DcMotorSimple.Direction.FORWARD).rightRearMotorDirection(DcMotorSimple.Direction.FORWARD).xVelocity(55).yVelocity(55);
        follower=new FollowerBuilder(f,hardwareMap).mecanumDrivetrain(m).pinpointLocalizer(new PinpointConstants().hardwareMapName("pinpoint")).build();
        follower.setStartingPose(new Pose(0,0,0));telemetry.setMsTransmissionInterval(0);
    }
    @Override public void start() {Path path=new Path(new BezierLine(new Pose(0,0,0),new Pose(20,0,0)));path.setConstantHeadingInterpolation(0);follower.followPath(path);}
    @Override public void loop() {follower.update();telemetry.addData("x",follower.getPose().getX());telemetry.addData("y",follower.getPose().getY());telemetry.addData("busy",follower.isBusy());telemetry.update();}
    @Override public void stop() {follower.breakFollowing();}
}
