package com.qualcomm.robotcore.hardware;

public class PIDCoefficients {
    public double p;
    public double i;
    public double d;

    public PIDCoefficients() {}

    public PIDCoefficients(double p, double i, double d) {
        this.p = p;
        this.i = i;
        this.d = d;
    }
}
