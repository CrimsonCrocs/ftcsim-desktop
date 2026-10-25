package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

public final class HandoffAutoOpMode extends OpMode {
    private DcMotor drive;

    @Override public void init() {
        telemetry.addData("autoInit", "ready");
        telemetry.update();
        drive = hardwareMap.get(DcMotor.class, "drive");
        drive.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        drive.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        HandoffSharedState.autoMotorIdentity = System.identityHashCode(drive);
    }

    @Override public void start() {
        HandoffSharedState.autoMarker = 2027;
        drive.setPower(0.75);
    }

    @Override public void loop() {
        HandoffSharedState.autoLoops++;
        drive.setPower(0.6);
    }

    @Override public void stop() {
        HandoffSharedState.autoStopped = true;
        HandoffSharedState.autoStopCalls++;
    }
}
