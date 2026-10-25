package org.opencv.core;
public class RotatedRect {
    public Point center;public Size size;public double angle;
    public RotatedRect() { this(new Point(),new Size(),0); }
    public RotatedRect(Point center,Size size,double angle) { this.center=new Point(center.x,center.y);this.size=new Size(size.width,size.height);this.angle=angle; }
    public RotatedRect(double[] values) { this();set(values); }
    public void set(double[] values) { center.x=values[0];center.y=values[1];size.width=values[2];size.height=values[3];angle=values[4]; }
    public void points(Point[] points) {
        if(points.length<4)throw new IllegalArgumentException("Rectangle needs four output points");
        double sin=Math.sin(Math.toRadians(angle))*.5,cos=Math.cos(Math.toRadians(angle))*.5;
        points[0]=new Point(center.x-sin*size.height-cos*size.width,center.y+cos*size.height-sin*size.width);
        points[1]=new Point(center.x+sin*size.height-cos*size.width,center.y-cos*size.height-sin*size.width);
        points[2]=new Point(2*center.x-points[0].x,2*center.y-points[0].y);
        points[3]=new Point(2*center.x-points[1].x,2*center.y-points[1].y);
    }
    public Rect boundingRect() { Point[] p=new Point[4];points(p);double minX=p[0].x,maxX=p[0].x,minY=p[0].y,maxY=p[0].y;
        for(Point point:p) { minX=Math.min(minX,point.x);maxX=Math.max(maxX,point.x);minY=Math.min(minY,point.y);maxY=Math.max(maxY,point.y); }
        int x=(int)Math.floor(minX),y=(int)Math.floor(minY);return new Rect(x,y,(int)Math.ceil(maxX)-x+1,(int)Math.ceil(maxY)-y+1); }
    @Override public RotatedRect clone() { return new RotatedRect(center,size,angle); }
}
