package org.opencv.core;
import java.util.List;

public final class Core {
    private Core() {}
    public static final int ROTATE_90_CLOCKWISE=0, ROTATE_180=1, ROTATE_90_COUNTERCLOCKWISE=2;
    public static final int KMEANS_RANDOM_CENTERS=0,KMEANS_USE_INITIAL_LABELS=1,KMEANS_PP_CENTERS=2;
    public static void add(Mat source,Scalar scalar,Mat destination) {
        destination.create(source.rows(),source.cols(),source.type());
        for(int y=0;y<source.rows();y++)for(int x=0;x<source.cols();x++)for(int k=0;k<source.channels();k++)destination.set(y,x,k,source.at(y,x,k)+scalar.val[k]);
    }
    /** Bounded Lloyd clustering with k-means++ seeding, used by the FTC color processor. */
    public static double kmeans(Mat source,int clusters,Mat bestLabels,TermCriteria criteria,int attempts,int flags,Mat centers) {
        int count=source.rows(),dimensions=source.cols()*source.channels();
        if(source.depth()!=CvType.CV_32F || clusters<1 || clusters>64 || count<clusters || dimensions<1 || attempts<1 || attempts>10 || flags<0 || flags>3)
            throw new IllegalArgumentException("Invalid or excessive k-means dimensions, clusters, attempts or flags");
        int iterations=(criteria.type&TermCriteria.MAX_ITER)!=0?Math.max(2,Math.min(100,criteria.maxCount)):100;
        double epsilon=(criteria.type&TermCriteria.EPS)!=0?Math.max(0,criteria.epsilon):0;
        double[] data=new double[count*dimensions];source.get(0,0,data);
        java.util.Random random=new java.util.Random(0x465443);
        double bestCost=Double.POSITIVE_INFINITY;int[] winning=null;double[][] winningCenters=null;
        for(int attempt=0;attempt<attempts;attempt++) {
            double[][] means=new double[clusters][dimensions];int[] labels=new int[count];
            if(attempt==0 && (flags&KMEANS_USE_INITIAL_LABELS)!=0) {
                if(bestLabels.total()!=count || bestLabels.type()!=CvType.CV_32SC1)throw new IllegalArgumentException("Initial labels have the wrong shape");
                bestLabels.get(0,0,labels);for(int label:labels)if(label<0 || label>=clusters)throw new IllegalArgumentException("Initial label outside cluster range");
                updateClusterCenters(data,labels,means,count,dimensions);
            } else {
                int first=random.nextInt(count);System.arraycopy(data,first*dimensions,means[0],0,dimensions);
                double[] distances=new double[count];java.util.Arrays.fill(distances,Double.POSITIVE_INFINITY);
                for(int k=1;k<clusters;k++) {
                    double total=0;for(int i=0;i<count;i++) { distances[i]=Math.min(distances[i],squared(data,i*dimensions,means[k-1],dimensions));total+=distances[i]; }
                    int selected=random.nextInt(count);
                    if((flags&KMEANS_PP_CENTERS)!=0 && total>0) {
                        double bestTrial=Double.POSITIVE_INFINITY;
                        for(int trial=0;trial<3;trial++) {
                            double target=random.nextDouble()*total;int candidate=count-1;
                            for(int i=0;i<count;i++) { target-=distances[i];if(target<=0) { candidate=i;break; } }
                            double[] possible=new double[dimensions];System.arraycopy(data,candidate*dimensions,possible,0,dimensions);
                            double cost=0;for(int i=0;i<count;i++)cost+=Math.min(distances[i],squared(data,i*dimensions,possible,dimensions));
                            if(cost<bestTrial) { bestTrial=cost;selected=candidate; }
                        }
                    }
                    System.arraycopy(data,selected*dimensions,means[k],0,dimensions);
                }
            }
            for(int iteration=0;iteration<iterations;iteration++) {
                for(int i=0;i<count;i++) {
                    double distance=Double.POSITIVE_INFINITY;int label=0;
                    for(int k=0;k<clusters;k++) { double candidate=squared(data,i*dimensions,means[k],dimensions);if(candidate<distance) { distance=candidate;label=k; } }
                    labels[i]=label;
                }
                double[][] next=new double[clusters][dimensions];updateClusterCenters(data,labels,next,count,dimensions);
                double shift=0;for(int k=0;k<clusters;k++) { double distance=0;for(int d=0;d<dimensions;d++)distance+=Math.pow(next[k][d]-means[k][d],2);shift=Math.max(shift,distance); }
                means=next;if(shift<=epsilon*epsilon)break;
            }
            double cost=0;for(int i=0;i<count;i++)cost+=squared(data,i*dimensions,means[labels[i]],dimensions);
            if(cost<bestCost) { bestCost=cost;winning=labels;winningCenters=means; }
        }
        bestLabels.create(count,1,CvType.CV_32SC1);bestLabels.put(0,0,winning);
        centers.create(clusters,dimensions,CvType.CV_32FC1);for(int k=0;k<clusters;k++)centers.put(k,0,winningCenters[k]);
        return bestCost;
    }
    private static double squared(double[] data,int offset,double[] center,int dimensions) {
        double result=0;for(int d=0;d<dimensions;d++) { double delta=data[offset+d]-center[d];result+=delta*delta; }return result;
    }
    private static void updateClusterCenters(double[] data,int[] labels,double[][] means,int count,int dimensions) {
        int[] sizes=new int[means.length];
        for(int i=0;i<count;i++) { sizes[labels[i]]++;for(int d=0;d<dimensions;d++)means[labels[i]][d]+=data[i*dimensions+d]; }
        for(int k=0;k<means.length;k++)if(sizes[k]==0) {
            int largest=0;for(int j=1;j<sizes.length;j++)if(sizes[j]>sizes[largest])largest=j;
            int farthest=-1;double farthestDistance=-1;
            for(int i=0;i<count;i++)if(labels[i]==largest) { double distance=0;for(int d=0;d<dimensions;d++)distance+=Math.pow(data[i*dimensions+d]-means[largest][d]/sizes[largest],2);
                if(distance>farthestDistance) { farthestDistance=distance;farthest=i; } }
            labels[farthest]=k;sizes[k]=1;sizes[largest]--;
            for(int d=0;d<dimensions;d++) { means[k][d]=data[farthest*dimensions+d];means[largest][d]-=means[k][d]; }
        }
        for(int k=0;k<means.length;k++)for(int d=0;d<dimensions;d++)means[k][d]/=sizes[k];
    }
    public static Scalar mean(Mat source) {
        double[] sum=new double[4];
        for(int r=0;r<source.rows();r++) for(int c=0;c<source.cols();c++) for(int k=0;k<source.channels();k++) sum[k]+=source.at(r,c,k);
        double count=Math.max(1,source.total()); return new Scalar(sum[0]/count,sum[1]/count,sum[2]/count,sum[3]/count);
    }
    public static Scalar sumElems(Mat source) {
        Scalar result=mean(source); for(int k=0;k<4;k++) result.val[k]*=source.total(); return result;
    }
    public static void extractChannel(Mat source,Mat destination,int channel) {
        if(channel<0 || channel>=source.channels()) throw new IllegalArgumentException("Invalid channel");
        Mat src=source==destination?source.clone():source; destination.create(src.rows(),src.cols(),CvType.makeType(src.depth(),1));
        for(int r=0;r<src.rows();r++) for(int c=0;c<src.cols();c++) destination.set(r,c,0,src.at(r,c,channel));
    }
    public static void split(Mat source,List<Mat> channels) {
        channels.clear(); for(int k=0;k<source.channels();k++) { Mat channel=new Mat(); extractChannel(source,channel,k); channels.add(channel); }
    }
    public static void inRange(Mat source,Scalar lower,Scalar upper,Mat destination) {
        Mat src=source==destination?source.clone():source; destination.create(src.rows(),src.cols(),CvType.CV_8UC1);
        for(int r=0;r<src.rows();r++) for(int c=0;c<src.cols();c++) {
            boolean inside=true; for(int k=0;k<src.channels();k++) { double v=src.at(r,c,k); inside &= v>=lower.val[k] && v<=upper.val[k]; }
            destination.set(r,c,0,inside?255:0);
        }
    }
    public static int countNonZero(Mat source) {
        if(source.channels()!=1) throw new IllegalArgumentException("countNonZero requires one channel");
        int count=0; for(int r=0;r<source.rows();r++) for(int c=0;c<source.cols();c++) if(source.at(r,c,0)!=0) count++; return count;
    }
    public static void bitwise_and(Mat a,Mat b,Mat out) { binary(a,b,out,false); }
    public static void bitwise_or(Mat a,Mat b,Mat out) { binary(a,b,out,true); }
    private static void binary(Mat a,Mat b,Mat out,boolean or) {
        if(a.rows()!=b.rows() || a.cols()!=b.cols() || a.type()!=b.type()) throw new IllegalArgumentException("Image shapes must match");
        out.create(a.rows(),a.cols(),a.type());
        for(int r=0;r<a.rows();r++) for(int c=0;c<a.cols();c++) for(int k=0;k<a.channels();k++) out.set(r,c,k,or?((int)a.at(r,c,k)|(int)b.at(r,c,k)):((int)a.at(r,c,k)&(int)b.at(r,c,k)));
    }
    public static void rotate(Mat source,Mat destination,int code) {
        if(code<0 || code>2) throw new IllegalArgumentException("Unknown rotation");
        Mat src=source==destination?source.clone():source;
        destination.create(code==1?src.rows():src.cols(),code==1?src.cols():src.rows(),src.type());
        for(int r=0;r<src.rows();r++) for(int c=0;c<src.cols();c++) {
            int y=code==0?c:code==1?src.rows()-1-r:src.cols()-1-c;
            int x=code==0?src.rows()-1-r:code==1?src.cols()-1-c:r;
            destination.put(y,x,src.get(r,c));
        }
    }
}
