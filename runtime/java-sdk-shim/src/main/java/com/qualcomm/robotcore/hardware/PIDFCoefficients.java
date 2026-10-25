package com.qualcomm.robotcore.hardware;

/** Exact FTC PIDF value-type ABI, including the top-level MotorControlAlgorithm enum. */
public class PIDFCoefficients {
    public double p,i,d,f;
    public MotorControlAlgorithm algorithm;
    public PIDFCoefficients() { this(0,0,0,0); }
    public PIDFCoefficients(double p,double i,double d,double f) { this(p,i,d,f,MotorControlAlgorithm.PIDF); }
    public PIDFCoefficients(double p,double i,double d,double f,MotorControlAlgorithm algorithm) { this.p=p;this.i=i;this.d=d;this.f=f;this.algorithm=algorithm; }
    public PIDFCoefficients(PIDFCoefficients value) { this(value.p,value.i,value.d,value.f,value.algorithm); }
    public PIDFCoefficients(PIDCoefficients value) { this(value.p,value.i,value.d,0,MotorControlAlgorithm.LegacyPID); }
    @Override public String toString() { return String.format("%s(p=%f i=%f d=%f f=%f alg=%s)",getClass().getSimpleName(),p,i,d,f,algorithm); }
}
