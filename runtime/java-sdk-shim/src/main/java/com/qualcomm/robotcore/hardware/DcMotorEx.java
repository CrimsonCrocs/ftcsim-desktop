package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;

/** Extended FTC SDK motor contract for velocity, PIDF, and current feedback. */
public interface DcMotorEx extends DcMotor {
    void setMotorEnable();

    void setMotorDisable();

    boolean isMotorEnabled();

    void setVelocity(double angularRate);

    void setVelocity(double angularRate, AngleUnit unit);

    double getVelocity();

    double getVelocity(AngleUnit unit);

    void setPIDCoefficients(RunMode mode, PIDCoefficients coefficients);

    void setPIDFCoefficients(RunMode mode, PIDFCoefficients coefficients);

    void setVelocityPIDFCoefficients(double p, double i, double d, double f);

    void setPositionPIDFCoefficients(double p);

    PIDCoefficients getPIDCoefficients(RunMode mode);

    PIDFCoefficients getPIDFCoefficients(RunMode mode);

    void setTargetPositionTolerance(int tolerance);

    int getTargetPositionTolerance();

    double getCurrent(CurrentUnit unit);

    double getCurrentAlert(CurrentUnit unit);

    void setCurrentAlert(double current, CurrentUnit unit);

    boolean isOverCurrent();
}
