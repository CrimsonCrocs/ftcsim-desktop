package org.opencv.core;
public class Point {
    public double x, y;
    public Point() { this(0,0); }
    public Point(double x, double y) { this.x=x; this.y=y; }
    public Point(double[] values) { this(values[0], values[1]); }
}
