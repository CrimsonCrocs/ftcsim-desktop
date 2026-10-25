package android.graphics;
public final class Color {
    private Color() {}
    public static final int BLACK=0xff000000,DKGRAY=0xff444444,GRAY=0xff888888,LTGRAY=0xffcccccc,WHITE=0xffffffff,
        RED=0xffff0000,GREEN=0xff00ff00,BLUE=0xff0000ff,YELLOW=0xffffff00,CYAN=0xff00ffff,MAGENTA=0xffff00ff,TRANSPARENT=0;
    public static int argb(int a,int r,int g,int b) { return (a<<24)|(r<<16)|(g<<8)|b; }
    public static int rgb(int r,int g,int b) { return argb(255,r,g,b); }
    public static int alpha(int color) { return color>>>24; }
    public static int red(int color) { return (color>>16)&255; }
    public static int green(int color) { return (color>>8)&255; }
    public static int blue(int color) { return color&255; }
    public static void colorToHSV(int color,float[] hsv) { RGBToHSV(red(color),green(color),blue(color),hsv); }
    public static void RGBToHSV(int red,int green,int blue,float[] hsv) {
        if(hsv.length<3)throw new IllegalArgumentException("HSV array requires three entries");
        double max=Math.max(red,Math.max(green,blue)),min=Math.min(red,Math.min(green,blue)),delta=max-min;
        double hue=delta==0?0:max==red?60*(green-blue)/delta:max==green?60*((blue-red)/delta+2):60*((red-green)/delta+4);
        hsv[0]=(float)(hue<0?hue+360:hue);hsv[1]=(float)(max==0?0:delta/max);hsv[2]=(float)(max/255);
    }
    public static int HSVToColor(float[] hsv) { return HSVToColor(255,hsv); }
    public static int HSVToColor(int alpha,float[] hsv) {
        return (alpha<<24)|(java.awt.Color.HSBtoRGB(hsv[0]/360,Math.max(0,Math.min(1,hsv[1])),Math.max(0,Math.min(1,hsv[2])))&0xffffff);
    }
}
