package org.firstinspires.ftc.teamcode.drive;

import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.robotcore.hardware.PIDFCoefficients;

/** Calibration for the virtual 312 RPM, 537.7 tick/rev, 96 mm wheel test robot. */
public final class DriveConstants {
    public static final double TICKS_PER_REV=537.7,MAX_RPM=312;
    public static final boolean RUN_USING_ENCODER=false;
    public static PIDFCoefficients MOTOR_VELO_PID=new PIDFCoefficients(0,0,0,0);
    public static double WHEEL_RADIUS=.048/.0254,GEAR_RATIO=1,TRACK_WIDTH=.65/.0254;
    public static double kV=1/rpmToVelocity(MAX_RPM),kA=0,kStatic=0;
    public static double MAX_VEL=25,MAX_ACCEL=20,MAX_ANG_VEL=2,MAX_ANG_ACCEL=2;
    public static RevHubOrientationOnRobot.LogoFacingDirection LOGO_FACING_DIR=RevHubOrientationOnRobot.LogoFacingDirection.UP;
    public static RevHubOrientationOnRobot.UsbFacingDirection USB_FACING_DIR=RevHubOrientationOnRobot.UsbFacingDirection.FORWARD;
    public static double encoderTicksToInches(double ticks){return ticks/TICKS_PER_REV*2*Math.PI*WHEEL_RADIUS*GEAR_RATIO;}
    public static double rpmToVelocity(double rpm){return rpm/60*2*Math.PI*WHEEL_RADIUS*GEAR_RATIO;}
    public static double getMotorVelocityF(double ticksPerSecond){return 32767/ticksPerSecond;}
}
