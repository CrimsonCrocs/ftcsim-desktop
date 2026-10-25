package android.graphics;
public class Path {
    private final java.awt.geom.Path2D.Float path=new java.awt.geom.Path2D.Float();
    public void moveTo(float x,float y) { path.moveTo(x,y); }
    public void lineTo(float x,float y) { path.lineTo(x,y); }
    public void close() { path.closePath(); }
    public void reset() { path.reset(); }
    public java.awt.Shape shapeForSimulator() { return path; }
}
