package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/** FTC 11.1 distance sensor contract. */
public interface DistanceSensor extends HardwareDevice {
    double distanceOutOfRange = Double.MAX_VALUE;

    double getDistance(DistanceUnit unit);
}
