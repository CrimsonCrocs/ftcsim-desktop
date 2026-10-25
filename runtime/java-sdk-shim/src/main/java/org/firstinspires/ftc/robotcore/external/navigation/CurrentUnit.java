package org.firstinspires.ftc.robotcore.external.navigation;

public enum CurrentUnit {
    AMPS(1.0), MILLIAMPS(1000.0);

    private final double unitsPerAmp;

    CurrentUnit(double unitsPerAmp) { this.unitsPerAmp = unitsPerAmp; }

    public double fromAmps(double amps) { return amps * unitsPerAmp; }

    public double toAmps(double value) { return value / unitsPerAmp; }
}
