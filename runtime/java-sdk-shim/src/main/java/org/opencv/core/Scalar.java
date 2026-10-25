package org.opencv.core;
public class Scalar {
    public double[] val;
    public Scalar(double a) { this(a,0,0,0); }
    public Scalar(double a,double b) { this(a,b,0,0); }
    public Scalar(double a,double b,double c) { this(a,b,c,0); }
    public Scalar(double a,double b,double c,double d) { val=new double[]{a,b,c,d}; }
    public static Scalar all(double value) { return new Scalar(value,value,value,value); }
}
