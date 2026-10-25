package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

/** Small AUTO program that ends after one powered command instead of idling for the full match. */
public final class ReturningLinearAutoOpMode extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
        DcMotor drive = hardwareMap.get(DcMotor.class, "drive");
        waitForStart();
        if (isStopRequested()) return;
        drive.setPower(0.75);
    }
}
