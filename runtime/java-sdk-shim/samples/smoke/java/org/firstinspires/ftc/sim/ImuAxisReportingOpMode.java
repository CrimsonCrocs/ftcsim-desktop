package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.IMU;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngularVelocity;

/** Emits each FTC IMU angular-rate axis for the persistent-worker wire regression. */
public final class ImuAxisReportingOpMode extends OpMode {
    @Override public void init() {
        IMU imu = hardwareMap.get(IMU.class, "imu");
        AngularVelocity rates = imu.getRobotAngularVelocity(AngleUnit.RADIANS);
        telemetry.addData("imuRateX", rates.xRotationRate);
        telemetry.addData("imuRateY", rates.yRotationRate);
        telemetry.addData("imuRateZ", rates.zRotationRate);
        telemetry.update();
    }

    @Override public void loop() {}
}
