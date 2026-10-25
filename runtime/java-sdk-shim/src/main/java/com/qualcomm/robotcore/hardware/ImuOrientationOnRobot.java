package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

/** Official orientation adapter contract used by {@link IMU.Parameters}. */
public interface ImuOrientationOnRobot {
    Quaternion imuCoordinateSystemOrientationFromPerspectiveOfRobot();

    Quaternion imuRotationOffset();

    Quaternion angularVelocityTransform();
}
