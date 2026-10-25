package org.firstinspires.ftc.sim;

/** Static marker deliberately shared across the same-classloader AUTO-to-TELEOP test. */
public final class HandoffSharedState {
    public static int autoMarker;
    public static int autoLoops;
    public static boolean autoStopped;
    public static int autoStopCalls;
    public static int autoMotorIdentity;
    public static int teleOpObservedMarker;
    public static int teleOpObservedEncoder;
    public static boolean teleOpHasSameMotor;

    private HandoffSharedState() {}
}
