package org.opencv.imgproc;

import java.util.*;
import org.opencv.core.*;

/** Convex-hull geometry shared by the portable OpenCV operations. */
final class SimulatorContourGeometry {
    private SimulatorContourGeometry() {}
    static Point[] points(Mat input) {
        if(input.channels()!=2)throw new IllegalArgumentException("Expected a two-channel point vector");
        Point[] result=new Point[(int)input.total()];int index=0;
        for(int y=0;y<input.rows();y++)for(int x=0;x<input.cols();x++)result[index++]=new Point(input.get(y,x));return result;
    }
    static int[] hull(Point[] points,boolean clockwise) {
        Integer[] indices=new Integer[points.length];for(int i=0;i<indices.length;i++)indices[i]=i;
        Arrays.sort(indices,new Comparator<Integer>() { @Override public int compare(Integer a,Integer b) {
            int x=Double.compare(points[a].x,points[b].x);return x!=0?x:Double.compare(points[a].y,points[b].y); } });
        List<Integer> unique=new ArrayList<Integer>();
        for(int index:indices)if(unique.isEmpty() || !same(points[index],points[unique.get(unique.size()-1)]))unique.add(index);
        if(unique.size()<2) { int[] result=new int[unique.size()];if(result.length==1)result[0]=unique.get(0);return result; }
        List<Integer> result=new ArrayList<Integer>();
        for(int index:unique) { while(result.size()>1 && cross(points[result.get(result.size()-2)],points[result.get(result.size()-1)],points[index])<=0)result.remove(result.size()-1);result.add(index); }
        int lower=result.size();
        for(int i=unique.size()-2;i>=0;i--) { int index=unique.get(i);while(result.size()>lower && cross(points[result.get(result.size()-2)],points[result.get(result.size()-1)],points[index])<=0)result.remove(result.size()-1);result.add(index); }
        result.remove(result.size()-1);if(clockwise)Collections.reverse(result);
        int[] array=new int[result.size()];for(int i=0;i<array.length;i++)array[i]=result.get(i);return array;
    }
    private static boolean same(Point a,Point b) { return a.x==b.x && a.y==b.y; }
    static double cross(Point a,Point b,Point c) { return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x); }
    static RotatedRect box(Point[] points) {
        int[] hull=hull(points,false);if(hull.length==0)return new RotatedRect();
        if(hull.length==1)return new RotatedRect(points[hull[0]],new Size(),0);
        double best=Double.POSITIVE_INFINITY;RotatedRect result=null;
        for(int i=0;i<hull.length;i++) {
            Point a=points[hull[i]],b=points[hull[(i+1)%hull.length]];
            double angle=Math.toDegrees(Math.atan2(b.y-a.y,b.x-a.x));while(angle<=0)angle+=90;while(angle>90)angle-=90;
            double cos=Math.cos(Math.toRadians(angle)),sin=Math.sin(Math.toRadians(angle));
            double minU=Double.POSITIVE_INFINITY,minV=minU,maxU=Double.NEGATIVE_INFINITY,maxV=maxU;
            for(int index:hull) { Point p=points[index];double u=p.x*cos+p.y*sin,v=-p.x*sin+p.y*cos;minU=Math.min(minU,u);maxU=Math.max(maxU,u);minV=Math.min(minV,v);maxV=Math.max(maxV,v); }
            double area=(maxU-minU)*(maxV-minV);
            if(area<best-1e-8) { best=area;double u=(minU+maxU)/2,v=(minV+maxV)/2;result=new RotatedRect(new Point(u*cos-v*sin,u*sin+v*cos),new Size(maxU-minU,maxV-minV),angle); }
        }
        return result;
    }
    static double[] circle(Point[] input) {
        List<Point> points=new ArrayList<Point>(Arrays.asList(input));Collections.shuffle(points,new Random(0x465443));
        double[] circle={0,0,-1};
        for(int i=0;i<points.size();i++)if(!contains(circle,points.get(i))) {
            Point a=points.get(i);circle=new double[]{a.x,a.y,0};
            for(int j=0;j<i;j++)if(!contains(circle,points.get(j))) {
                Point b=points.get(j);circle=diameter(a,b);
                for(int k=0;k<j;k++)if(!contains(circle,points.get(k)))circle=through(a,b,points.get(k));
            }
        }
        if(circle[2]<0)circle[2]=0;return circle;
    }
    private static boolean contains(double[] circle,Point point) { return circle[2]>=0 && Math.hypot(point.x-circle[0],point.y-circle[1])<=circle[2]+1e-8; }
    private static double[] diameter(Point a,Point b) { return new double[]{(a.x+b.x)/2,(a.y+b.y)/2,Math.hypot(a.x-b.x,a.y-b.y)/2}; }
    private static double[] through(Point a,Point b,Point c) {
        double bx=b.x-a.x,by=b.y-a.y,cx=c.x-a.x,cy=c.y-a.y,d=2*(bx*cy-by*cx);
        if(Math.abs(d)<1e-12) {
            double[] ab=diameter(a,b),ac=diameter(a,c),bc=diameter(b,c);
            return ab[2]>=ac[2] && ab[2]>=bc[2]?ab:ac[2]>=bc[2]?ac:bc;
        }
        double u=(cy*(bx*bx+by*by)-by*(cx*cx+cy*cy))/d,v=(bx*(cx*cx+cy*cy)-cx*(bx*bx+by*by))/d;
        return new double[]{a.x+u,a.y+v,Math.hypot(u,v)};
    }
}
