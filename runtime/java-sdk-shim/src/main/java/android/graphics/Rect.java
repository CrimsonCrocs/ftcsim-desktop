package android.graphics;
public class Rect {
    public int left,top,right,bottom;
    public Rect() {}
    public Rect(int left,int top,int right,int bottom) { set(left,top,right,bottom); }
    public void set(int left,int top,int right,int bottom) { this.left=left;this.top=top;this.right=right;this.bottom=bottom; }
    public int width() { return right-left; }
    public int height() { return bottom-top; }
    public int centerX() { return (left+right)>>1; }
    public int centerY() { return (top+bottom)>>1; }
    public boolean contains(int x,int y) { return x>=left && x<right && y>=top && y<bottom; }
}
