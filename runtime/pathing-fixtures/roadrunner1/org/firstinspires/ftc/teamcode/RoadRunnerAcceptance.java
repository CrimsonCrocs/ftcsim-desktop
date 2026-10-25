package org.firstinspires.ftc.teamcode;

import com.acmerobotics.roadrunner.Pose2d;
import com.acmerobotics.roadrunner.Vector2d;
import com.acmerobotics.roadrunner.ftc.Actions;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/** Uses the unchanged upstream MecanumDrive, with measured virtual wheel/motor dimensions. */
@Autonomous(name="Road Runner acceptance")
public final class RoadRunnerAcceptance extends LinearOpMode {
    private final org.firstinspires.ftc.robotcore.external.Telemetry dashboardTelemetry = com.acmerobotics.dashboard.FtcDashboard.getInstance().getTelemetry();
    @Override public void runOpMode() {
        MecanumDrive.PARAMS.inPerTick = (2 * Math.PI * 0.048 / 0.0254) / 537.7;
        MecanumDrive.PARAMS.lateralInPerTick = MecanumDrive.PARAMS.inPerTick;
        MecanumDrive.PARAMS.trackWidthTicks = (0.65 / 0.0254) / MecanumDrive.PARAMS.inPerTick;
        MecanumDrive.PARAMS.kV = 12.8 / (537.7 * 312 / 60);
        MecanumDrive.PARAMS.maxWheelVel = 25;
        MecanumDrive.PARAMS.maxAngVel = 2;
        MecanumDrive.PARAMS.maxAngAccel = 2;
        MecanumDrive.PARAMS.minProfileAccel = -20;
        MecanumDrive.PARAMS.maxProfileAccel = 20;
        MecanumDrive.PARAMS.axialGain = 3;
        MecanumDrive.PARAMS.lateralGain = 3;
        MecanumDrive.PARAMS.headingGain = 3;
        MecanumDrive drive = new MecanumDrive(hardwareMap, new Pose2d(0, 0, 0));
        dashboardTelemetry.addData("library", "Road Runner");
        telemetry.setMsTransmissionInterval(0);
        waitForStart();
        Actions.runBlocking(drive.actionBuilder(new Pose2d(0, 0, 0))
                .lineToX(20).turn(Math.PI / 2).strafeTo(new Vector2d(20,10)).waitSeconds(0.5).build());
        telemetry.addData("done", true);
        telemetry.addData("x", drive.localizer.getPose().position.x);
        telemetry.addData("y", drive.localizer.getPose().position.y);
        telemetry.addData("heading", drive.localizer.getPose().heading.toDouble());
        telemetry.update();
    }
}
