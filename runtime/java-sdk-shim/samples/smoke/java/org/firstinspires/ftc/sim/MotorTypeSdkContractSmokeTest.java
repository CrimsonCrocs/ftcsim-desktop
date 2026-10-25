package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.SimDcMotorEx;
import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;

/** Compiled against the pinned official SDK and executed with the simulator shim first. */
public final class MotorTypeSdkContractSmokeTest {
    public static void main(String[] args) {
        SimDcMotorEx implementation = new SimDcMotorEx("sdk-abi-profile", 537.7, 312.0, 1.0);
        DcMotor motor = implementation;
        MotorConfigurationType physical = motor.getMotorType();
        if (!"sdk-abi-profile".equals(physical.getName())
                || Math.abs(physical.getTicksPerRev() - 537.7) > 1e-6
                || Math.abs(physical.getMaxRPM() - 312.0) > 1e-6) {
            throw new AssertionError("official DcMotor API did not expose the configured type");
        }

        MotorConfigurationType replacement = MotorConfigurationType.getUnspecifiedMotorType();
        replacement.setTicksPerRev(1000);
        replacement.setMaxRPM(120);
        replacement.setAchieveableMaxRPMFraction(0.5);
        motor.setMotorType(replacement);
        if (Math.abs(motor.getMotorType().getAchieveableMaxTicksPerSecond() - 1000) > 1e-6) {
            throw new AssertionError("official setMotorType API did not update simulated motor profile");
        }
        System.out.println("MotorTypeSdkContractSmokeTest passed");
    }
}
