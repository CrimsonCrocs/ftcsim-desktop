package org.firstinspires.ftc.robotcore.external;

/** Lazily produces a value when telemetry is actually published. */
public interface Func<T> {
    T value();
}
