package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/** Exercises the CLI's class-initialization deadline. */
public final class HangingInitializerLinearOpMode extends LinearOpMode {
    static {
        while (keepWaiting()) {
            try {
                Thread.sleep(1_000);
            } catch (InterruptedException ignored) {
                // Deliberately ignore the loader supervisor's cooperative cancellation.
            }
        }
    }

    private static boolean keepWaiting() {
        return true;
    }

    @Override
    public void runOpMode() {
        waitForStart();
    }
}
