package org.firstinspires.ftc.teamcode;

import com.acmerobotics.roadrunner.geometry.Pose2d;
import com.acmerobotics.roadrunner.control.PIDCoefficients;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import org.firstinspires.ftc.teamcode.drive.DriveConstants;
import org.firstinspires.ftc.teamcode.drive.SampleMecanumDrive;

@Autonomous(name="Road Runner 0.5 acceptance")
public final class RoadRunner05Acceptance extends LinearOpMode {
    @Override public void runOpMode() {
        DriveConstants.WHEEL_RADIUS=0.048/0.0254;DriveConstants.GEAR_RATIO=1;
        DriveConstants.TRACK_WIDTH=0.65/0.0254;
        DriveConstants.kV=1/(2*Math.PI*DriveConstants.WHEEL_RADIUS*312/60);
        DriveConstants.kA=0;DriveConstants.kStatic=0;
        DriveConstants.MAX_VEL=25;DriveConstants.MAX_ACCEL=20;
        DriveConstants.MAX_ANG_VEL=2;DriveConstants.MAX_ANG_ACCEL=2;
        SampleMecanumDrive.TRANSLATIONAL_PID=new PIDCoefficients(3,0,0);
        SampleMecanumDrive.HEADING_PID=new PIDCoefficients(3,0,0);
        SampleMecanumDrive drive=new SampleMecanumDrive(hardwareMap);
        drive.setPoseEstimate(new Pose2d(0,0,0));
        telemetry.setMsTransmissionInterval(0);waitForStart();
        drive.followTrajectorySequence(drive.trajectorySequenceBuilder(new Pose2d(0,0,0)).forward(20).turn(Math.PI/2).waitSeconds(0.5).build());
        telemetry.addData("done",true);telemetry.addData("x",drive.getPoseEstimate().getX());telemetry.addData("heading",drive.getPoseEstimate().getHeading());telemetry.update();
    }
}
