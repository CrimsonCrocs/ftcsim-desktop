package org.opencv.imgproc;
import org.opencv.core.*;

/** Portable CPU operations for common FTC color and region pipelines. */
public final class Imgproc {
    private Imgproc() {}
    public static final int COLOR_RGB2RGBA=0, COLOR_RGBA2RGB=1, COLOR_BGR2RGB=4, COLOR_RGB2BGR=4;
    public static final int COLOR_BGR2GRAY=6, COLOR_RGB2GRAY=7, COLOR_GRAY2RGB=8, COLOR_GRAY2RGBA=9, COLOR_RGBA2GRAY=11;
    public static final int COLOR_RGB2YCrCb=37, COLOR_BGR2YCrCb=36, COLOR_BGR2HSV=40, COLOR_RGB2HSV=41;
    public static final int THRESH_BINARY=0, THRESH_BINARY_INV=1;
    public static final int INTER_NEAREST=0, INTER_LINEAR=1;
    public static final int RETR_EXTERNAL=0, RETR_LIST=1, CHAIN_APPROX_NONE=1, CHAIN_APPROX_SIMPLE=2;
    public static final int COLOR_YCrCb2RGB=39;
    public static final int MORPH_RECT=0, MORPH_CROSS=1, MORPH_ELLIPSE=2, MORPH_OPEN=2, MORPH_CLOSE=3;
    public static void cvtColor(Mat source,Mat destination,int code) { cvtColor(source,destination,code,0); }
    public static void cvtColor(Mat source,Mat destination,int code,int destinationChannels) {
        if(source.depth()!=CvType.CV_8U) throw new UnsupportedOperationException("Simulator color conversions require 8-bit image data");
        Mat src=source==destination?source.clone():source;
        int channels=(code==6 || code==7 || code==11)?1:(code==0 || code==9)?4:3;
        if(destinationChannels!=0 && destinationChannels!=channels) throw new UnsupportedOperationException("Custom color channel count");
        destination.create(src.rows(),src.cols(),CvType.makeType(src.depth(),channels));
        for(int r=0;r<src.rows();r++) for(int c=0;c<src.cols();c++) {
            double[] p=src.get(r,c); double red=p[0],green=p.length>1?p[1]:red,blue=p.length>2?p[2]:red;
            if(code==6 || code==36 || code==40) { double swap=red;red=blue;blue=swap; }
            double y=0.299*red+0.587*green+0.114*blue;
            if(code==6 || code==7 || code==11) destination.put(r,c,y);
            else if(code==0 || code==9) destination.put(r,c,red,green,blue,255);
            else if(code==1 || code==8) destination.put(r,c,red,green,blue);
            else if(code==4) destination.put(r,c,blue,green,red);
            else if(code==36 || code==37) destination.put(r,c,y,(red-y)*0.713+128,(blue-y)*0.564+128);
            else if(code==COLOR_YCrCb2RGB) destination.put(r,c,red+1.403*(green-128),red-.714*(green-128)-.344*(blue-128),red+1.773*(blue-128));
            else if(code==40 || code==41) {
                double max=Math.max(red,Math.max(green,blue)),min=Math.min(red,Math.min(green,blue)),delta=max-min;
                double h=delta==0?0:max==red?60*((green-blue)/delta):max==green?60*((blue-red)/delta+2):60*((red-green)/delta+4);
                if(h<0) h+=360; destination.put(r,c,h/2,max==0?0:255*delta/max,max);
            } else throw new UnsupportedOperationException("Unsupported simulator color conversion: "+code);
        }
    }
    public static void resize(Mat source,Mat destination,Size size) { resize(source,destination,size,0,0,INTER_LINEAR); }
    public static void resize(Mat source,Mat destination,Size size,double fx,double fy) { resize(source,destination,size,fx,fy,INTER_LINEAR); }
    public static void resize(Mat source,Mat destination,Size size,double fx,double fy,int interpolation) {
        if(interpolation!=INTER_NEAREST && interpolation!=INTER_LINEAR) throw new UnsupportedOperationException("Simulator resize supports nearest and linear interpolation");
        Mat src=source==destination?source.clone():source;
        int width=size.width>0?(int)size.width:(int)Math.round(src.cols()*fx),height=size.height>0?(int)size.height:(int)Math.round(src.rows()*fy);
        if(src.empty() || width<1 || height<1) throw new IllegalArgumentException("Image dimensions must be positive");
        destination.create(height,width,src.type());
        for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
            double sy=Math.max(0,(y+0.5)*src.rows()/height-0.5),sx=Math.max(0,(x+0.5)*src.cols()/width-0.5);
            int y0=Math.min(src.rows()-1,(int)sy),x0=Math.min(src.cols()-1,(int)sx),y1=Math.min(src.rows()-1,y0+1),x1=Math.min(src.cols()-1,x0+1);
            for(int k=0;k<src.channels();k++) {
                double value=interpolation==0?src.at(Math.min(src.rows()-1,y*src.rows()/height),Math.min(src.cols()-1,x*src.cols()/width),k)
                    :(src.at(y0,x0,k)*(1-(sx-x0))+src.at(y0,x1,k)*(sx-x0))*(1-(sy-y0))+(src.at(y1,x0,k)*(1-(sx-x0))+src.at(y1,x1,k)*(sx-x0))*(sy-y0);
                destination.set(y,x,k,value);
            }
        }
    }
    public static double threshold(Mat source,Mat destination,double threshold,double maximum,int type) {
        if(type!=0 && type!=1) throw new UnsupportedOperationException("Simulator threshold supports BINARY and BINARY_INV");
        destination.create(source.rows(),source.cols(),source.type());
        for(int r=0;r<source.rows();r++) for(int c=0;c<source.cols();c++) for(int k=0;k<source.channels();k++) destination.set(r,c,k,(source.at(r,c,k)>threshold)==(type==0)?maximum:0);
        return threshold;
    }
    public static void rectangle(Mat image,Point a,Point b,Scalar color) { rectangle(image,a,b,color,1); }
    public static void rectangle(Mat image,Rect rect,Scalar color,int thickness) { rectangle(image,rect.tl(),new Point(rect.x+rect.width-1,rect.y+rect.height-1),color,thickness); }
    public static void rectangle(Mat image,Point a,Point b,Scalar color,int thickness) {
        int left=(int)Math.min(a.x,b.x),right=(int)Math.max(a.x,b.x),top=(int)Math.min(a.y,b.y),bottom=(int)Math.max(a.y,b.y);
        for(int r=Math.max(0,top);r<=Math.min(image.rows()-1,bottom);r++) for(int c=Math.max(0,left);c<=Math.min(image.cols()-1,right);c++)
            if(thickness<0 || r<top+thickness || r>bottom-thickness || c<left+thickness || c>right-thickness) image.put(r,c,color.val.length==image.channels()?color.val:java.util.Arrays.copyOf(color.val,image.channels()));
    }
    public static Mat getStructuringElement(int shape,Size size) {
        int width=(int)size.width,height=(int)size.height;
        if(shape<0 || shape>2 || width<1 || height<1 || width>63 || height>63) throw new IllegalArgumentException("Invalid morphology kernel");
        Mat kernel=new Mat(height,width,CvType.CV_8UC1);
        for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
            int radius=height/2,dy=y-radius;
            int extent=radius==0?width/2:(int)Math.round((width/2)*Math.sqrt(Math.max(0,1-(double)dy*dy/(radius*radius))));
            boolean inside=shape==0 || (shape==1?(x==width/2 || y==height/2):Math.abs(x-width/2)<=extent);
            kernel.put(y,x,inside?1:0);
        }
        return kernel;
    }
    public static void erode(Mat source,Mat destination,Mat kernel) { morph(source,destination,kernel,false); }
    public static void dilate(Mat source,Mat destination,Mat kernel) { morph(source,destination,kernel,true); }
    private static void morph(Mat source,Mat destination,Mat kernel,boolean dilate) {
        Mat src=source==destination?source.clone():source;
        if(kernel.empty()) kernel=getStructuringElement(MORPH_RECT,new Size(3,3));
        destination.create(src.rows(),src.cols(),src.type());
        for(int y=0;y<src.rows();y++) for(int x=0;x<src.cols();x++) for(int k=0;k<src.channels();k++) {
            double value=dilate?Double.NEGATIVE_INFINITY:Double.POSITIVE_INFINITY;
            for(int ky=0;ky<kernel.rows();ky++) for(int kx=0;kx<kernel.cols();kx++) {
                int sy=y+ky-kernel.rows()/2,sx=x+kx-kernel.cols()/2;
                if(kernel.at(ky,kx,0)==0 || sy<0 || sx<0 || sy>=src.rows() || sx>=src.cols()) continue;
                value=dilate?Math.max(value,src.at(sy,sx,k)):Math.min(value,src.at(sy,sx,k));
            }
            destination.set(y,x,k,value);
        }
    }
    public static void morphologyEx(Mat source,Mat destination,int operation,Mat kernel) {
        Mat intermediate=new Mat();
        if(operation==MORPH_OPEN) { erode(source,intermediate,kernel);dilate(intermediate,destination,kernel); }
        else if(operation==MORPH_CLOSE) { dilate(source,intermediate,kernel);erode(intermediate,destination,kernel); }
        else throw new UnsupportedOperationException("Simulator morphology supports OPEN and CLOSE");
    }
    public static void GaussianBlur(Mat source,Mat destination,Size size,double sigma) {
        int width=(int)size.width,height=(int)size.height;
        if(width<1 || height<1 || width%2!=1 || height%2!=1 || width>63 || height>63) throw new IllegalArgumentException("Gaussian kernels must have odd dimensions up to 63");
        Mat src=source==destination?source.clone():source;
        Mat intermediate=new Mat(src.rows(),src.cols(),CvType.makeType(CvType.CV_64F,src.channels()));
        double[] horizontal=gaussian(width,sigma),vertical=gaussian(height,sigma);
        for(int y=0;y<src.rows();y++) for(int x=0;x<src.cols();x++) for(int k=0;k<src.channels();k++) {
            double v=0;for(int dx=0;dx<width;dx++) v+=horizontal[dx]*src.at(y,reflect(x+dx-width/2,src.cols()),k);intermediate.set(y,x,k,v);
        }
        destination.create(src.rows(),src.cols(),src.type());
        for(int y=0;y<src.rows();y++) for(int x=0;x<src.cols();x++) for(int k=0;k<src.channels();k++) {
            double v=0;for(int dy=0;dy<height;dy++) v+=vertical[dy]*intermediate.at(reflect(y+dy-height/2,src.rows()),x,k);destination.set(y,x,k,v);
        }
    }
    private static double[] gaussian(int size,double sigma) {
        if(sigma<=0 && size<=7) {
            if(size==1)return new double[]{1};if(size==3)return new double[]{.25,.5,.25};
            if(size==5)return new double[]{.0625,.25,.375,.25,.0625};
            return new double[]{.03125,.109375,.21875,.28125,.21875,.109375,.03125};
        }
        if(sigma<=0) sigma=.3*((size-1)*.5-1)+.8;
        double[] result=new double[size];double total=0;
        for(int i=0;i<size;i++) { result[i]=Math.exp(-.5*Math.pow((i-size/2)/sigma,2));total+=result[i]; }
        for(int i=0;i<size;i++)result[i]/=total;return result;
    }
    private static int reflect(int index,int size) {
        if(size==1) return 0;while(index<0 || index>=size) index=index<0?-index:2*size-index-2;return index;
    }
    public static Rect boundingRect(Mat points) {
        if(points.empty()) return new Rect();
        double minX=Double.POSITIVE_INFINITY,minY=minX,maxX=Double.NEGATIVE_INFINITY,maxY=maxX;
        for(int i=0;i<points.rows();i++) { double[] p=points.get(i,0);minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]); }
        return new Rect((int)Math.floor(minX),(int)Math.floor(minY),(int)Math.floor(maxX)-(int)Math.floor(minX)+1,(int)Math.floor(maxY)-(int)Math.floor(minY)+1);
    }
    public static double contourArea(Mat contour) { return contourArea(contour,false); }
    public static void convexHull(MatOfPoint contour,MatOfInt indices) { convexHull(contour,indices,false); }
    public static void convexHull(MatOfPoint contour,MatOfInt indices,boolean clockwise) { indices.fromArray(SimulatorContourGeometry.hull(contour.toArray(),clockwise)); }
    public static RotatedRect minAreaRect(MatOfPoint2f contour) { return SimulatorContourGeometry.box(contour.toArray()); }
    public static double arcLength(MatOfPoint2f contour,boolean closed) {
        Point[] p=contour.toArray();double length=0;
        for(int i=1;i<p.length;i++)length+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
        if(closed && p.length>1)length+=Math.hypot(p[0].x-p[p.length-1].x,p[0].y-p[p.length-1].y);return length;
    }
    public static void minEnclosingCircle(MatOfPoint2f contour,Point center,float[] radius) {
        if(radius.length<1)throw new IllegalArgumentException("Circle radius needs an output entry");
        double[] circle=SimulatorContourGeometry.circle(contour.toArray());center.x=circle[0];center.y=circle[1];radius[0]=(float)(circle[2]+1e-4);
    }
    public static double contourArea(Mat contour,boolean oriented) {
        double area=0;for(int i=0;i<contour.rows();i++) { double[] a=contour.get(i,0),b=contour.get((i+1)%contour.rows(),0);area+=a[0]*b[1]-b[0]*a[1]; }
        return oriented?area/2:Math.abs(area)/2;
    }
    public static Moments moments(Mat input) { return moments(input,false); }
    public static Moments moments(Mat input,boolean binaryImage) {
        Moments result=new Moments();
        if(input.channels()==2) {
            double a=0,x=0,y=0;
            for(int i=0;i<input.rows();i++) { double[] p=input.get(i,0),q=input.get((i+1)%input.rows(),0);double cross=p[0]*q[1]-q[0]*p[1];a+=cross;x+=(p[0]+q[0])*cross;y+=(p[1]+q[1])*cross; }
            result.m00=Math.abs(a)/2;if(a!=0) { result.m10=x/(3*a)*result.m00;result.m01=y/(3*a)*result.m00; }
        } else {
            if(input.channels()!=1) throw new IllegalArgumentException("Image moments require one channel");
            for(int r=0;r<input.rows();r++) for(int c=0;c<input.cols();c++) { double value=input.at(r,c,0);if(binaryImage)value=value==0?0:1;result.m00+=value;result.m10+=c*value;result.m01+=r*value; }
        }
        return result;
    }
    public static void findContours(Mat image,java.util.List<MatOfPoint> contours,Mat hierarchy,int mode,int method) {
        if((mode!=RETR_EXTERNAL && mode!=RETR_LIST) || (method!=CHAIN_APPROX_NONE && method!=CHAIN_APPROX_SIMPLE)) throw new UnsupportedOperationException("Simulator contours support RETR_EXTERNAL/LIST with CHAIN_APPROX_NONE/SIMPLE");
        if(image.channels()!=1) throw new IllegalArgumentException("Contours require a single-channel mask");
        contours.clear();
        int w=image.cols(),h=image.rows();boolean[] seen=new boolean[w*h];int[] queue=new int[(w+2)*(h+2)];
        int padded=w+2;boolean[] exterior=new boolean[(w+2)*(h+2)];int begin=0,end=1;queue[0]=0;exterior[0]=true;
        while(begin<end) {
            int index=queue[begin++],px=index%padded,py=index/padded;
            int[] adjacent={index-1,index+1,index-padded,index+padded};
            for(int next:adjacent) {
                if(next<0 || next>=exterior.length || Math.abs(next%padded-px)+Math.abs(next/padded-py)!=1 || exterior[next])continue;
                int nx=next%padded-1,ny=next/padded-1;
                if(nx>=0 && ny>=0 && nx<w && ny<h && image.at(ny,nx,0)!=0)continue;
                exterior[next]=true;queue[end++]=next;
            }
        }
        int[] dx={1,1,0,-1,-1,-1,0,1},dy={0,1,1,1,0,-1,-1,-1};
        for(int y=0;y<h;y++) for(int x=0;x<w;x++) {
            if(seen[y*w+x] || image.at(y,x,0)==0)continue;
            int head=0,tail=0;queue[tail++]=y*w+x;seen[y*w+x]=true;boolean external=false;
            while(head<tail) {
                int index=queue[head++],cx=index%w,cy=index/w;
                int p=(cy+1)*padded+cx+1;
                external |= exterior[p-1] || exterior[p+1] || exterior[p-padded] || exterior[p+padded];
                for(int d=0;d<8;d++) { int nx=cx+dx[d],ny=cy+dy[d];if(nx>=0 && ny>=0 && nx<w && ny<h && !seen[ny*w+nx] && image.at(ny,nx,0)!=0) { seen[ny*w+nx]=true;queue[tail++]=ny*w+nx; } }
            }
            if(mode==RETR_EXTERNAL && !external)continue;
            contours.add(traceContour(image,x,y,x-1,y,method,tail*16));
        }
        if(mode==RETR_LIST)for(int y=0;y<h;y++)for(int x=0;x<w;x++) {
            if(seen[y*w+x] || image.at(y,x,0)!=0 || exterior[(y+1)*padded+x+1])continue;
            int head=0,tail=1;queue[0]=y*w+x;seen[y*w+x]=true;
            while(head<tail) {
                int index=queue[head++],cx=index%w,cy=index/w;
                int[] adjacent={index-1,index+1,index-w,index+w};
                for(int next:adjacent) {
                    if(next<0 || next>=seen.length || Math.abs(next%w-cx)+Math.abs(next/w-cy)!=1 || seen[next] || image.at(next/w,next%w,0)!=0)continue;
                    seen[next]=true;queue[tail++]=next;
                }
            }
            contours.add(traceContour(image,x-1,y,x,y,method,w*h*16));
        }
        // RETR_LIST and EXTERNAL both flatten parent/child links.
        hierarchy.create(1,contours.size(),CvType.CV_32SC4);
        for(int i=0;i<contours.size();i++) hierarchy.put(0,i,i+1<contours.size()?i+1:-1,i>0?i-1:-1,-1,-1);
    }
    private static MatOfPoint traceContour(Mat image,int x,int y,int backX,int backY,int method,int maximumSteps) {
        java.util.List<Point> boundary=new java.util.ArrayList<Point>();
        int w=image.cols(),h=image.rows();
        int[] dx={1,1,0,-1,-1,-1,0,1},dy={0,1,1,1,0,-1,-1,-1};
        int cx=x,cy=y,firstX=-1,firstY=-1;
        for(int step=0;step<=maximumSteps;step++) {
            int back=4;for(int d=0;d<8;d++) if(cx+dx[d]==backX && cy+dy[d]==backY)back=d;
            int next=-1;
            for(int n=1;n<=8;n++) { int d=(back+n)%8,nx=cx+dx[d],ny=cy+dy[d];if(nx>=0 && ny>=0 && nx<w && ny<h && image.at(ny,nx,0)!=0) { next=d;break; } }
            if(next<0) { boundary.add(new Point(cx,cy));break; }
            int nx=cx+dx[next],ny=cy+dy[next];
            if(firstX==nx && firstY==ny && cx==x && cy==y)break;
            if(firstX<0) { firstX=nx;firstY=ny; }
            boundary.add(new Point(cx,cy));
            backX=cx+dx[(next+7)%8];backY=cy+dy[(next+7)%8];cx=nx;cy=ny;
        }
        if(method==CHAIN_APPROX_SIMPLE && boundary.size()>2) {
            java.util.List<Point> simple=new java.util.ArrayList<Point>();
            for(int i=0;i<boundary.size();i++) { Point p=boundary.get((i+boundary.size()-1)%boundary.size()),q=boundary.get(i),r=boundary.get((i+1)%boundary.size());
                if(Math.signum(q.x-p.x)!=Math.signum(r.x-q.x) || Math.signum(q.y-p.y)!=Math.signum(r.y-q.y))simple.add(q); }
            boundary=simple;
        }
        if(boundary.size()>1)java.util.Collections.reverse(boundary.subList(1,boundary.size()));
        MatOfPoint contour=new MatOfPoint();contour.fromList(boundary);return contour;
    }

}
