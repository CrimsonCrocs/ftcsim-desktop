package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

/** Linear AUTO fixture exercises clock reopen and same-loader static state after explicit STOP. */
public final class HandoffLinearAutoOpMode extends LinearOpMode {
    @Override public void runOpMode() throws InterruptedException {
        DcMotor drive = hardwareMap.get(DcMotor.class, "drive");
        drive.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        drive.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
        HandoffSharedState.autoMotorIdentity = System.identityHashCode(drive);
        waitForStart();
        HandoffSharedState.autoMarker = 31337;
        drive.setPower(0.75);
        try {
            while (opModeIsActive()) idle();
        } finally {
            HandoffSharedState.autoStopped = true;
            HandoffSharedState.autoStopCalls++;
        }
    }
}
