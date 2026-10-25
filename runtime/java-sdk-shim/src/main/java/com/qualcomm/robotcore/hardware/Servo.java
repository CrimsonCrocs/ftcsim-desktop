package com.qualcomm.robotcore.hardware;

/** FTC SDK normalized servo contract. */
public interface Servo extends HardwareDevice {
    double MIN_POSITION = 0.0;
    double MAX_POSITION = 1.0;

    enum Direction { FORWARD, REVERSE }

    void setDirection(Direction direction);

    Direction getDirection();

    void setPosition(double position);

    double getPosition();

    void scaleRange(double min, double max);
}
