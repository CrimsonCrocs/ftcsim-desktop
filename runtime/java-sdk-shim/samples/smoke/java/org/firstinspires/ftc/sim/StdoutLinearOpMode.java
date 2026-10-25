package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;

/** Exercises the CLI's promise that TeamCode output cannot corrupt its JSON protocol. */
public final class StdoutLinearOpMode extends LinearOpMode {
    @Override
    public void runOpMode() {
        System.out.println("team-code output");
        waitForStart();
        while (opModeIsActive()) idle();
    }
}
