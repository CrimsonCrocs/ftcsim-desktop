package org.opencv.core;
import java.util.List;
public class MatOfPoint2f extends Mat {
    public MatOfPoint2f() {}
    public MatOfPoint2f(Point... points) { fromArray(points); }
    public MatOfPoint2f(Mat source) { source.copyTo(this); }
    public void alloc(int elements) { create(elements,1,CvType.CV_32FC2); }
    public void fromArray(Point... points) { alloc(points.length);for(int i=0;i<points.length;i++)put(i,0,points[i].x,points[i].y); }
    public Point[] toArray() { Point[] result=new Point[rows()];for(int i=0;i<result.length;i++)result[i]=new Point(get(i,0));return result; }
    public void fromList(List<Point> points) { fromArray(points.toArray(new Point[points.size()])); }
    public List<Point> toList() { return java.util.Arrays.asList(toArray()); }
}
