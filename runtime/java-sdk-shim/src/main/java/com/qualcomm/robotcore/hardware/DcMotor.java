package com.qualcomm.robotcore.hardware;

import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;

/** FTC SDK motor contract implemented by the simulator's shaft-backed motor. */
public interface DcMotor extends DcMotorSimple {
    enum RunMode {
        RUN_WITHOUT_ENCODER,
        RUN_USING_ENCODER,
        RUN_TO_POSITION,
        STOP_AND_RESET_ENCODER
    }

    enum ZeroPowerBehavior { BRAKE, FLOAT }

    MotorConfigurationType getMotorType();

    void setMotorType(MotorConfigurationType motorType);

    void setZeroPowerBehavior(ZeroPowerBehavior zeroPowerBehavior);

    ZeroPowerBehavior getZeroPowerBehavior();

    void setPowerFloat();

    boolean getPowerFloat();

    void setTargetPosition(int position);

    int getTargetPosition();

    boolean isBusy();

    int getCurrentPosition();

    void setMode(RunMode mode);

    RunMode getMode();
}
