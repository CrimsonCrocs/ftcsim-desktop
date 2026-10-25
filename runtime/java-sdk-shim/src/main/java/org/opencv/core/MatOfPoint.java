package org.opencv.core;
import java.util.List;
public class MatOfPoint extends Mat {
    public MatOfPoint() {}
    public MatOfPoint(Point... points) { fromArray(points); }
    public void fromArray(Point... points) {
        create(points.length,1,CvType.CV_32SC2);
        for(int i=0;i<points.length;i++) put(i,0,points[i].x,points[i].y);
    }
    public void fromList(List<Point> points) { fromArray(points.toArray(new Point[points.size()])); }
    public Point[] toArray() {
        Point[] result=new Point[rows()];for(int i=0;i<result.length;i++) result[i]=new Point(get(i,0));return result;
    }
    public List<Point> toList() { return java.util.Arrays.asList(toArray()); }
}
