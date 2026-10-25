package org.opencv.core;
public class Size {
    public double width, height;
    public Size() { this(0,0); }
    public Size(double width, double height) { this.width=width; this.height=height; }
    public double area() { return width*height; }
}
