package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DigitalChannel;

public final class HandoffTeleOpMode extends OpMode {
    private DcMotor drive;

    @Override public void init() {
        drive = hardwareMap.get(DcMotor.class, "drive");
        DigitalChannel beam = hardwareMap.get(DigitalChannel.class, "beam");
        HandoffSharedState.teleOpObservedMarker = HandoffSharedState.autoMarker;
        HandoffSharedState.teleOpObservedEncoder = drive.getCurrentPosition();
        HandoffSharedState.teleOpHasSameMotor =
                HandoffSharedState.autoMotorIdentity == System.identityHashCode(drive);
        telemetry.addData("handoffMarker", HandoffSharedState.teleOpObservedMarker);
        telemetry.addData("handoffEncoder", HandoffSharedState.teleOpObservedEncoder);
        telemetry.addData("autoStopped", HandoffSharedState.autoStopped);
        telemetry.addData("autoStopCalls", HandoffSharedState.autoStopCalls);
        telemetry.addData("sameMotorObject", HandoffSharedState.teleOpHasSameMotor);
        telemetry.addData("autoLoops", HandoffSharedState.autoLoops);
        telemetry.addData("beam", beam.getState());
        telemetry.addData("motorMode", drive.getMode());
        telemetry.addData("zeroPower", drive.getZeroPowerBehavior());
        telemetry.update();
        // The runner must neutralize outputs written by TELEOP init until START is requested.
        drive.setPower(0.8);
    }

    @Override public void start() {
        drive.setPower(0.25);
    }

    @Override public void loop() {}
}
