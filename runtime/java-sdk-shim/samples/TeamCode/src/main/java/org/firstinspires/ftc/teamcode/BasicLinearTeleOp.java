package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.ElapsedTime;

/** Typical TeamCode-shaped source used by the no-Gradle smoke test. */
@TeleOp(name = "Shim: Basic Linear TeleOp", group = "Proof")
public final class BasicLinearTeleOp extends LinearOpMode {
    @Override
    public void runOpMode() {
        DcMotor leftDrive = hardwareMap.get(DcMotor.class, "left_drive");
        DcMotor rightDrive = hardwareMap.get(DcMotor.class, "right_drive");
        Servo claw = hardwareMap.get(Servo.class, "claw");
        ElapsedTime runtime = new ElapsedTime();

        leftDrive.setDirection(DcMotor.Direction.REVERSE);
        // The proof runner opts into one-control-tick telemetry for deterministic smoke coverage.
        telemetry.setMsTransmissionInterval(0);
        telemetry.addData("status", "initialized");
        telemetry.update();

        waitForStart();
        runtime.reset();
        while (opModeIsActive()) {
            double drive = -gamepad1.left_stick_y;
            double turn = gamepad1.right_stick_x;
            leftDrive.setPower(drive + turn);
            rightDrive.setPower(drive - turn);
            claw.setPosition(gamepad1.a ? 0.75 : 0.25);

            telemetry.addData("runtime", "%.3f", runtime.seconds());
            telemetry.addData("drive", "%.2f", drive);
            telemetry.addData("claw", claw.getPosition());
            telemetry.update();
            sleep(10);
        }

        leftDrive.setPower(0);
        rightDrive.setPower(0);
    }
}
