package org.opencv.core;
public class Rect {
    public int x,y,width,height;
    public Rect() { this(0,0,0,0); }
    public Rect(int x,int y,int width,int height) { this.x=x; this.y=y; this.width=width; this.height=height; }
    public Rect(Point a,Point b) { this((int)Math.min(a.x,b.x),(int)Math.min(a.y,b.y),(int)Math.abs(a.x-b.x),(int)Math.abs(a.y-b.y)); }
    public Rect(Point point,Size size) { this((int)point.x,(int)point.y,(int)size.width,(int)size.height); }
    public Point tl() { return new Point(x,y); }
    public Point br() { return new Point(x+width,y+height); }
    public Size size() { return new Size(width,height); }
    public double area() { return (double)width*height; }
}
