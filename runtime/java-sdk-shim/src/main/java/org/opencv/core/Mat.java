package org.opencv.core;

/** CPU image storage with shared ROI views, matching the supported OpenCV Java ABI. */
public class Mat {
    private double[] data = new double[0];
    private int rows, cols, type, offset, stride;
    public Mat() {}
    public Mat(int rows,int cols,int type) { create(rows,cols,type); }
    public Mat(int rows,int cols,int type,Scalar value) { this(rows,cols,type); setTo(value); }
    public Mat(Size size,int type) { this((int)size.height,(int)size.width,type); }
    public Mat(Size size,int type,Scalar value) { this(size,type); setTo(value); }
    public Mat(Mat parent,Rect roi) {
        if (roi.x<0 || roi.y<0 || roi.width<0 || roi.height<0 || roi.x+roi.width>parent.cols || roi.y+roi.height>parent.rows)
            throw new IllegalArgumentException("ROI outside image");
        data=parent.data; rows=roi.height; cols=roi.width; type=parent.type;
        stride=parent.stride; offset=parent.offset+roi.y*stride+roi.x*channels();
    }
    public void create(int rows,int cols,int type) {
        CvType.makeType(CvType.depth(type),CvType.channels(type));
        if (rows<0 || cols<0 || (long)rows*cols*CvType.channels(type)>16_777_216L) throw new IllegalArgumentException("Mat exceeds simulator image budget");
        if (this.rows==rows && this.cols==cols && this.type==type && data.length>0) return;
        this.rows=rows; this.cols=cols; this.type=type; offset=0; stride=cols*channels(); data=new double[rows*stride];
    }
    public void create(Size size,int type) { create((int)size.height,(int)size.width,type); }
    public int rows() { return rows; }
    public int cols() { return cols; }
    public int width() { return cols; }
    public int height() { return rows; }
    public int channels() { return CvType.channels(type); }
    public int type() { return type; }
    public int depth() { return CvType.depth(type); }
    public long total() { return (long)rows*cols; }
    public Size size() { return new Size(cols,rows); }
    public boolean empty() { return rows==0 || cols==0; }
    public boolean isContinuous() { return stride==cols*channels(); }
    public Mat submat(Rect roi) { return new Mat(this,roi); }
    public Mat submat(int rowStart,int rowEnd,int colStart,int colEnd) { return submat(new Rect(colStart,rowStart,colEnd-colStart,rowEnd-rowStart)); }
    public Mat row(int row) { return submat(row,row+1,0,cols); }
    public Mat col(int col) { return submat(0,rows,col,col+1); }
    @Override public Mat clone() { Mat result=new Mat(); copyTo(result); return result; }
    public void copyTo(Mat destination) {
        if (destination==this) return;
        destination.create(rows,cols,type);
        for (int r=0;r<rows;r++) for (int c=0;c<cols;c++) destination.put(r,c,get(r,c));
    }
    public Mat setTo(Scalar value) {
        for (int r=0;r<rows;r++) for (int c=0;c<cols;c++) for (int k=0;k<channels();k++) set(r,c,k,value.val[k]);
        return this;
    }
    public void release() { rows=cols=offset=stride=0; data=new double[0]; }
    public double[] get(int row,int col) {
        if (row<0 || col<0 || row>=rows || col>=cols) return null;
        double[] values=new double[channels()]; for(int k=0;k<values.length;k++) values[k]=at(row,col,k); return values;
    }
    public int get(int row,int col,byte[] values) {
        int count=Math.min(values.length,(rows*cols-row*cols-col)*channels());
        for(int i=0;i<count;i++) { int n=(row*cols+col)*channels()+i; values[i]=(byte)at(n/channels()/cols,n/channels()%cols,n%channels()); } return count;
    }
    public int get(int row,int col,float[] values) { int count=transferCount(row,col,values.length);for(int i=0;i<count;i++)values[i]=(float)linearAt(row,col,i);return count*4; }
    public int get(int row,int col,int[] values) { int count=transferCount(row,col,values.length);for(int i=0;i<count;i++)values[i]=(int)linearAt(row,col,i);return count*4; }
    public int get(int row,int col,double[] values) { int count=transferCount(row,col,values.length);for(int i=0;i<count;i++)values[i]=linearAt(row,col,i);return count*8; }
    public int put(int row,int col,float[] values) { int count=transferCount(row,col,values.length);for(int i=0;i<count;i++)linearSet(row,col,i,values[i]);return count*4; }
    public int put(int row,int col,int[] values) { int count=transferCount(row,col,values.length);for(int i=0;i<count;i++)linearSet(row,col,i,values[i]);return count*4; }
    private int transferCount(int row,int col,int length) { if(empty())return 0;if(row<0||col<0||row>=rows||col>=cols)throw new IndexOutOfBoundsException("Image coordinates are outside the Mat");return Math.min(length,(rows*cols-row*cols-col)*channels()); }
    private double linearAt(int row,int col,int i) { int n=(row*cols+col)*channels()+i;return at(n/channels()/cols,n/channels()%cols,n%channels()); }
    private void linearSet(int row,int col,int i,double value) { int n=(row*cols+col)*channels()+i;set(n/channels()/cols,n/channels()%cols,n%channels(),value); }
    public int put(int row,int col,byte[] values) {
        int count=Math.min(values.length,(rows*cols-row*cols-col)*channels());
        for(int i=0;i<count;i++) { int n=(row*cols+col)*channels()+i; set(n/channels()/cols,n/channels()%cols,n%channels(),values[i]&255); } return count;
    }
    public int put(int row,int col,double... values) {
        int count=Math.min(values.length,(rows*cols-row*cols-col)*channels());
        for(int i=0;i<count;i++) { int n=(row*cols+col)*channels()+i; set(n/channels()/cols,n/channels()%cols,n%channels(),values[i]); } return count;
    }
    public void convertTo(Mat destination,int targetType) { convertTo(destination,targetType,1,0); }
    public void convertTo(Mat destination,int targetType,double alpha) { convertTo(destination,targetType,alpha,0); }
    public void convertTo(Mat destination,int targetType,double alpha,double beta) {
        Mat source=destination==this?clone():this;
        destination.create(rows,cols,CvType.makeType(CvType.depth(targetType),channels()));
        for(int r=0;r<rows;r++) for(int c=0;c<cols;c++) for(int k=0;k<channels();k++) destination.set(r,c,k,source.at(r,c,k)*alpha+beta);
    }
    public static Mat zeros(int rows,int cols,int type) { return new Mat(rows,cols,type); }
    public static Mat ones(int rows,int cols,int type) { return new Mat(rows,cols,type,Scalar.all(1)); }
    // Simulator implementation helpers; not admitted to TeamCode's API surface.
    public double at(int row,int col,int channel) { return data[offset+row*stride+col*channels()+channel]; }
    public void set(int row,int col,int channel,double value) {
        data[offset+row*stride+col*channels()+channel]=depth()==CvType.CV_8U?Math.max(0,Math.min(255,Math.rint(value))):depth()==CvType.CV_32S?Math.rint(value):depth()==CvType.CV_32F?(float)value:value;
    }
}
