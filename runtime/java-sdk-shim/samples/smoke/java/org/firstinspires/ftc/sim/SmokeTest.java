package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.hardware.SimDcMotorEx;
import com.qualcomm.robotcore.hardware.SimServo;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.teamcode.BasicLinearTeleOp;

import java.util.Map;

/** No-library smoke test for compile + lifecycle + hardware-map proof behavior. */
public final class SmokeTest {
    private SmokeTest() {}

    public static void main(String[] args) throws Exception {
        SimulatorRunner runner = new SimulatorRunner();
        DcMotor leftDrive = runner.getHardwareMap().putForSimulator("left_drive", new SimDcMotorEx());
        DcMotor rightDrive = runner.getHardwareMap().putForSimulator("right_drive", new SimDcMotorEx());
        Servo claw = runner.getHardwareMap().putForSimulator("claw", new SimServo());
        runner.getGamepad1().left_stick_y = -0.75f;
        runner.getGamepad1().right_stick_x = 0.0f;
        runner.getGamepad1().a = true;

        SimulationResult result = runner.runForCycles(new BasicLinearTeleOp(), 8, 10);
        require(result.getCompletedCycles() > 0, "runner did not advance any cycles");
        require(leftDrive.getCurrentPosition() < 0, "reversed left drive did not advance");
        require(rightDrive.getCurrentPosition() > 0, "right drive did not advance");
        require(Math.abs(claw.getPosition() - 0.75) < 0.0001, "gamepad-driven servo did not move");

        Map<String, String> telemetry = result.getLatestTelemetry();
        require("0.75".equals(telemetry.get("drive")), "latest telemetry is missing drive output");
        require(BasicLinearTeleOp.class.isAnnotationPresent(TeleOp.class), "@TeleOp was not retained");
        require("Shim: Basic Linear TeleOp".equals(BasicLinearTeleOp.class.getAnnotation(TeleOp.class).name()),
                "@TeleOp metadata was not preserved");

        SimDcMotorEx external = new SimDcMotorEx();
        external.setDirection(DcMotor.Direction.REVERSE);
        external.setMode(DcMotor.RunMode.RUN_TO_POSITION);
        external.setTargetPosition(100);
        external.applyFeedbackForSimulator(100, 537.7, 1.2, true);
        require(external.getCurrentPosition() == 100,
                "external encoder feedback was direction-adjusted twice");
        require(!external.isBusy(), "reverse RUN_TO_POSITION did not use command-frame feedback");
        require(Math.abs(external.getVelocity(AngleUnit.DEGREES) - 360.0) < 0.001,
                "angular velocity feedback did not convert encoder ticks to shaft units");
        external.setVelocity(2.0 * Math.PI, AngleUnit.RADIANS);
        require(Math.abs(external.getVelocitySetpointForSimulator() - 537.7) < 0.001,
                "angular velocity command did not convert shaft units to encoder ticks");

        System.out.println("java-sdk-shim smoke test passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
