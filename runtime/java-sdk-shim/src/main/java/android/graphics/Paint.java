package android.graphics;
public class Paint {
    public static final int ANTI_ALIAS_FLAG=1;
    public enum Style { FILL, STROKE, FILL_AND_STROKE }
    public enum Cap { BUTT, ROUND, SQUARE }
    public enum Join { MITER, ROUND, BEVEL }
    public enum Align { LEFT, CENTER, RIGHT }
    private int color=Color.BLACK;
    private float width=0,textSize=16;
    private boolean antiAlias;
    private Style style=Style.FILL;
    private Cap cap=Cap.BUTT;
    private Join join=Join.MITER;
    private Align align=Align.LEFT;
    public Paint() {}
    public Paint(int flags) { antiAlias=(flags&ANTI_ALIAS_FLAG)!=0; }
    public void setColor(int color) { this.color=color; }
    public int getColor() { return color; }
    public void setAlpha(int alpha) { color=(color&0xffffff)|(Math.max(0,Math.min(255,alpha))<<24); }
    public int getAlpha() { return color>>>24; }
    public void setStrokeWidth(float width) { if(!Float.isFinite(width)||width<0)throw new IllegalArgumentException("Invalid stroke width");this.width=width; }
    public float getStrokeWidth() { return width; }
    public void setStyle(Style style) { this.style=style; }
    public Style getStyle() { return style; }
    public void setAntiAlias(boolean enabled) { antiAlias=enabled; }
    public boolean isAntiAlias() { return antiAlias; }
    public void setStrokeCap(Cap cap) { this.cap=cap; }
    public Cap getStrokeCap() { return cap; }
    public void setStrokeJoin(Join join) { this.join=join; }
    public Join getStrokeJoin() { return join; }
    public void setTextSize(float size) { if(!Float.isFinite(size)||size<0)throw new IllegalArgumentException("Invalid text size");textSize=size; }
    public float getTextSize() { return textSize; }
    public void setTextAlign(Align align) { this.align=align; }
    public Align getTextAlign() { return align; }
}
