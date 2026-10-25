package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/** Exercises process termination when TeamCode leaves a non-daemon thread behind. */
public final class LeakyThreadLinearOpMode extends LinearOpMode {
    @Override
    public void runOpMode() {
        waitForStart();
        Thread leakedThread = new Thread(new Runnable() {
            @Override
            public void run() {
                while (true) {
                    try {
                        Thread.sleep(1_000);
                    } catch (InterruptedException ignored) {
                        // This deliberately behaves badly so the process boundary is tested.
                    }
                }
            }
        }, "deliberately-leaked-teamcode-thread");
        leakedThread.setDaemon(false);
        leakedThread.start();
        while (opModeIsActive()) idle();
    }
}
