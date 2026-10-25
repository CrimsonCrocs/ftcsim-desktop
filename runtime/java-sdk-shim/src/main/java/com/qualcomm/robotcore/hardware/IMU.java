package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngularVelocity;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

/** Drive-relevant universal IMU surface backed by browser rigid-body feedback. */
public interface IMU extends HardwareDevice {
    final class Parameters {
        public ImuOrientationOnRobot imuOrientationOnRobot;

        public Parameters(ImuOrientationOnRobot imuOrientationOnRobot) {
            this.imuOrientationOnRobot = imuOrientationOnRobot;
        }

        public Parameters copy() {
            return new Parameters(imuOrientationOnRobot);
        }
    }

    boolean initialize(Parameters parameters);

    void resetYaw();

    YawPitchRollAngles getRobotYawPitchRollAngles();
    Quaternion getRobotOrientationAsQuaternion();

    org.firstinspires.ftc.robotcore.external.navigation.Orientation getRobotOrientation(
            org.firstinspires.ftc.robotcore.external.navigation.AxesReference reference,
            org.firstinspires.ftc.robotcore.external.navigation.AxesOrder order,AngleUnit unit);

    AngularVelocity getRobotAngularVelocity(AngleUnit unit);
}
