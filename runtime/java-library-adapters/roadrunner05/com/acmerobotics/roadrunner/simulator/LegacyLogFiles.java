package com.acmerobotics.roadrunner.simulator;

import com.acmerobotics.roadrunner.geometry.Pose2d;
import org.firstinspires.ftc.sim.SimulatorLibraryRuntime;
import java.util.List;
import java.util.Arrays;

/** Exact quickstart1 record ABI, without initializing its Android/host-filesystem logger. */
public final class LegacyLogFiles {
    private LegacyLogFiles() {}
    public static void record(Pose2d target, Pose2d actual, double voltage,
            List<Integer> positions, List<Integer> velocities, List<Integer> trackingPositions, List<Integer> trackingVelocities) {
        SimulatorLibraryRuntime.record("roadrunner.legacy", Arrays.asList(target,actual,voltage,positions,velocities,trackingPositions,trackingVelocities));
    }
}
