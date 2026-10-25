package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.SimDcMotorEx;
import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;

/** Verifies official DcMotor type methods expose and update the configured physical profile. */
public final class MotorTypeBridgeSmokeTest {
    public static void main(String[] args) {
        SimDcMotorEx motor = new SimDcMotorEx("goBILDA-312rpm", 537.7, 312.0, 0.85);
        DcMotor sdkView = motor;
        MotorConfigurationType configured = sdkView.getMotorType();
        require("goBILDA-312rpm".equals(configured.getName()), "profile model name");
        require("goBILDA-312rpm".equals(configured.getModelIdForSimulator()), "profile model id");
        requireNear(configured.getTicksPerRev(), 537.7, "configured encoder resolution");
        requireNear(configured.getMaxRPM(), 312.0, "configured free speed");
        requireNear(configured.getAchieveableMaxRPMFraction(), 0.85, "achievable RPM fraction");
        requireNear(configured.getAchieveableMaxTicksPerSecond(), 537.7 * 312.0 * 0.85 / 60,
                "published motor speed curve");

        configured.setTicksPerRev(1000);
        requireNear(sdkView.getMotorType().getTicksPerRev(), 537.7,
                "getMotorType returns an isolated SDK configuration snapshot");

        MotorConfigurationType replacement = MotorConfigurationType.createForSimulator(
                "test-120rpm", 1000, 120, 0.5);
        sdkView.setMotorType(replacement);
        requireNear(sdkView.getMotorType().getTicksPerRev(), 1000, "replacement encoder resolution");
        requireNear(sdkView.getMotorType().getMaxRPM(), 120, "replacement free speed");
        requireNear(sdkView.getMotorType().getAchieveableMaxRPMFraction(), 0.5,
                "replacement achievable RPM fraction");
        requireNear(motor.getTicksPerRevolutionForSimulator(), 1000, "updated shaft encoder resolution");
        requireNear(motor.getMaxRpmForSimulator(), 120, "updated shaft free speed");
        requireNear(motor.getAchievableMaxRpmFractionForSimulator(), 0.5,
                "updated shaft achievable RPM fraction");

        motor.setPower(1);
        motor.advanceSimulation(1);
        requireNear(motor.getCurrentPosition(), 1000, "setMotorType updates simulated shaft speed");
        System.out.println("MotorTypeBridgeSmokeTest passed");
    }

    private static void requireNear(double actual, double expected, String label) {
        if (Math.abs(actual - expected) > 1e-6) {
            throw new AssertionError(label + ": expected " + expected + ", got " + actual);
        }
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }
}
