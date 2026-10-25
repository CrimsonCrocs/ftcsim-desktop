package android.graphics;

import java.awt.Graphics2D;
import java.awt.BasicStroke;
import java.awt.RenderingHints;
import java.awt.Shape;
import java.awt.geom.*;
import java.util.ArrayDeque;

/** Software camera annotations; no Android window, GPU, or UI thread is involved. */
public class Canvas {
    private Bitmap bitmap;
    private Graphics2D graphics;
    private final ArrayDeque<Graphics2D> stack=new ArrayDeque<Graphics2D>();
    public Canvas() {}
    public Canvas(Bitmap bitmap) { setBitmap(bitmap); }
    public void setBitmap(Bitmap bitmap) {
        if(graphics!=null)graphics.dispose();while(!stack.isEmpty())stack.pop().dispose();this.bitmap=bitmap;
        if(bitmap!=null && !bitmap.isMutable())throw new IllegalStateException("Canvas requires a mutable bitmap");
        graphics=bitmap==null?null:bitmap.imageForSimulator().createGraphics();
    }
    public int getWidth() { return bitmap==null?0:bitmap.getWidth(); }
    public int getHeight() { return bitmap==null?0:bitmap.getHeight(); }
    private void prepare(Paint paint) {
        if(graphics==null)throw new IllegalStateException("Canvas has no bitmap");
        graphics.setColor(new java.awt.Color(paint.getColor(),true));
        graphics.setRenderingHint(RenderingHints.KEY_ANTIALIASING,paint.isAntiAlias()?RenderingHints.VALUE_ANTIALIAS_ON:RenderingHints.VALUE_ANTIALIAS_OFF);
        int cap=paint.getStrokeCap()==Paint.Cap.ROUND?BasicStroke.CAP_ROUND:paint.getStrokeCap()==Paint.Cap.SQUARE?BasicStroke.CAP_SQUARE:BasicStroke.CAP_BUTT;
        int join=paint.getStrokeJoin()==Paint.Join.ROUND?BasicStroke.JOIN_ROUND:paint.getStrokeJoin()==Paint.Join.BEVEL?BasicStroke.JOIN_BEVEL:BasicStroke.JOIN_MITER;
        graphics.setStroke(new BasicStroke(Math.max(1,paint.getStrokeWidth()),cap,join));
    }
    private void shape(Shape shape,Paint paint) {
        prepare(paint);if(paint.getStyle()!=Paint.Style.STROKE)graphics.fill(shape);if(paint.getStyle()!=Paint.Style.FILL)graphics.draw(shape);
    }
    public void drawRect(float left,float top,float right,float bottom,Paint paint) { shape(new Rectangle2D.Float(left,top,right-left,bottom-top),paint); }
    public void drawRect(Rect rect,Paint paint) { drawRect(rect.left,rect.top,rect.right,rect.bottom,paint); }
    public void drawRect(RectF rect,Paint paint) { drawRect(rect.left,rect.top,rect.right,rect.bottom,paint); }
    public void drawCircle(float x,float y,float radius,Paint paint) { shape(new Ellipse2D.Float(x-radius,y-radius,radius*2,radius*2),paint); }
    public void drawOval(RectF rect,Paint paint) { shape(new Ellipse2D.Float(rect.left,rect.top,rect.width(),rect.height()),paint); }
    public void drawLine(float x0,float y0,float x1,float y1,Paint paint) { prepare(paint);graphics.draw(new Line2D.Float(x0,y0,x1,y1)); }
    public void drawPoint(float x,float y,Paint paint) { float width=Math.max(1,paint.getStrokeWidth());prepare(paint);graphics.fill(new Ellipse2D.Float(x-width/2,y-width/2,width,width)); }
    public void drawPath(Path path,Paint paint) { shape(path.shapeForSimulator(),paint); }
    public void drawText(String text,float x,float y,Paint paint) {
        prepare(paint);graphics.setFont(new java.awt.Font(java.awt.Font.SANS_SERIF,java.awt.Font.PLAIN,1).deriveFont(paint.getTextSize()));
        float width=graphics.getFontMetrics().stringWidth(text);if(paint.getTextAlign()==Paint.Align.CENTER)x-=width/2;else if(paint.getTextAlign()==Paint.Align.RIGHT)x-=width;
        graphics.drawString(text,x,y);
    }
    public void drawColor(int color) {
        if(graphics==null)throw new IllegalStateException("Canvas has no bitmap");
        Graphics2D fill=(Graphics2D)graphics.create();
        try { fill.setTransform(new AffineTransform());fill.setColor(new java.awt.Color(color,true));fill.fillRect(0,0,getWidth(),getHeight()); }
        finally { fill.dispose(); }
    }
    public int save() { if(graphics==null)throw new IllegalStateException("Canvas has no bitmap");stack.push(graphics);graphics=(Graphics2D)graphics.create();return stack.size(); }
    public void restore() { if(stack.isEmpty())throw new IllegalStateException("Unbalanced canvas restore");graphics.dispose();graphics=stack.pop(); }
    public void restoreToCount(int count) { if(count<1 || count>stack.size())throw new IllegalArgumentException("Invalid canvas save count");while(stack.size()>=count)restore(); }
    public void translate(float x,float y) { graphics.translate(x,y); }
    public void scale(float x,float y) { graphics.scale(x,y); }
    public void rotate(float degrees) { graphics.rotate(Math.toRadians(degrees)); }
    public void rotate(float degrees,float x,float y) { graphics.rotate(Math.toRadians(degrees),x,y); }
}
