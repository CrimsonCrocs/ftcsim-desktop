package android.graphics;

import java.awt.image.BufferedImage;
import org.opencv.core.Mat;

/** Mutable ARGB bitmap used by simulator camera callbacks and software drawing. */
public final class Bitmap {
    public enum Config { ALPHA_8, RGB_565, ARGB_4444, ARGB_8888, RGBA_F16, HARDWARE }
    private BufferedImage image;
    private final boolean mutable;
    private Bitmap(int width,int height,boolean mutable) {
        if(width<1 || height<1 || (long)width*height>4_194_304L) throw new IllegalArgumentException("Bitmap exceeds the simulator pixel budget");
        image=new BufferedImage(width,height,BufferedImage.TYPE_INT_ARGB);this.mutable=mutable;
    }
    private static void requireConfig(Config config) {
        if(config!=Config.ARGB_8888) throw new UnsupportedOperationException("Simulator bitmaps support ARGB_8888");
    }
    public static Bitmap createBitmap(int width,int height,Config config) { requireConfig(config);return new Bitmap(width,height,true); }
    public static Bitmap createBitmap(int[] colors,int width,int height,Config config) {
        requireConfig(config);Bitmap result=new Bitmap(width,height,false);
        result.image.setRGB(0,0,width,height,colors,0,width);return result;
    }
    public static Bitmap createBitmap(Bitmap source) { return source.copy(Config.ARGB_8888,false); }
    public Bitmap copy(Config config,boolean mutable) {
        requireConfig(config);Bitmap result=new Bitmap(getWidth(),getHeight(),mutable);
        result.image.setRGB(0,0,getWidth(),getHeight(),image.getRGB(0,0,getWidth(),getHeight(),null,0,getWidth()),0,getWidth());return result;
    }
    public int getWidth() { check();return image.getWidth(); }
    public int getHeight() { check();return image.getHeight(); }
    public Config getConfig() { check();return Config.ARGB_8888; }
    public boolean isMutable() { return mutable; }
    public boolean isRecycled() { return image==null; }
    public int getByteCount() { return getWidth()*getHeight()*4; }
    public int getPixel(int x,int y) { check();return image.getRGB(x,y); }
    public void setPixel(int x,int y,int color) { write();image.setRGB(x,y,color); }
    public void getPixels(int[] colors,int offset,int stride,int x,int y,int width,int height) { check();image.getRGB(x,y,width,height,colors,offset,stride); }
    public void setPixels(int[] colors,int offset,int stride,int x,int y,int width,int height) { write();image.setRGB(x,y,width,height,colors,offset,stride); }
    public void eraseColor(int color) { write();int[] row=new int[getWidth()];java.util.Arrays.fill(row,color);for(int y=0;y<getHeight();y++)image.setRGB(0,y,getWidth(),1,row,0,row.length); }
    public void recycle() { if(image!=null)image.flush();image=null; }
    private void check() { if(image==null)throw new IllegalStateException("Bitmap has been recycled"); }
    private void write() { check();if(!mutable)throw new IllegalStateException("Bitmap is immutable"); }
    public BufferedImage imageForSimulator() { check();return image; }
    public static Bitmap fromMatForSimulator(Mat frame) {
        if(frame.depth()!=org.opencv.core.CvType.CV_8U || (frame.channels()!=1 && frame.channels()!=3 && frame.channels()!=4))
            throw new IllegalArgumentException("Camera output must be an 8-bit grayscale, RGB or RGBA Mat");
        Bitmap bitmap=createBitmap(frame.cols(),frame.rows(),Config.ARGB_8888);
        int[] pixels=new int[(int)frame.total()];
        for(int y=0;y<frame.rows();y++)for(int x=0;x<frame.cols();x++) {
            int r=(int)frame.at(y,x,0),g=frame.channels()==1?r:(int)frame.at(y,x,1),b=frame.channels()==1?r:(int)frame.at(y,x,2);
            int a=frame.channels()==4?(int)frame.at(y,x,3):255;pixels[y*frame.cols()+x]=Color.argb(a,r,g,b);
        }
        bitmap.image.setRGB(0,0,frame.cols(),frame.rows(),pixels,0,frame.cols());return bitmap;
    }
}
