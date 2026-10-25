package org.firstinspires.ftc.sim;

import android.graphics.*;
import java.util.*;
import java.util.concurrent.Executor;
import org.firstinspires.ftc.robotcore.external.function.*;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.firstinspires.ftc.vision.*;
import org.firstinspires.ftc.vision.opencv.*;
import org.openftc.easyopencv.*;
import org.opencv.core.Mat;
import org.opencv.core.MatOfPoint;
import org.opencv.core.MatOfPoint2f;
import org.opencv.core.MatOfInt;
import org.opencv.core.Core;
import org.opencv.core.CvType;
import org.opencv.core.Point;
import org.opencv.core.RotatedRect;
import org.opencv.core.Scalar;
import org.opencv.core.TermCriteria;
import org.opencv.imgproc.Imgproc;
import com.qualcomm.robotcore.util.SortOrder;

/** Runs both directly and as official-SDK-compiled bytecode with the runtime shim first. */
@SuppressWarnings("deprecation") // Exercise the still-supported SDK overloads too.
public final class VisionSdkParitySmokeTest {
    private static void require(boolean value,String message) { if(!value)throw new AssertionError(message); }
    private static void near(double actual,double expected,double error,String message) { require(Math.abs(actual-expected)<=error,message+": "+actual+" != "+expected); }
    private static SimulatorWebcamName camera(String name) { return new SimulatorWebcamName(name,new SimulatorVisionRuntime(name)); }
    private static void deliver(SimulatorWebcamName camera,long time,int rgb) throws Exception {
        String jpeg=Base64.getEncoder().encodeToString(CameraPipelineSmokeTest.jpeg(rgb));
        camera.getVisionRuntimeForSimulator().applyEncodedImageForSimulator(time+",16,12,"+jpeg+",8,6,8,6",time);
    }
    public static void main(String[] args) throws Exception {
        portalFramesAndBitmaps();easyOpenCvFramesAndBitmaps();colorProcessors();geometry();continuations();bitmapStorage();
        System.out.println("VisionSdkParitySmokeTest passed");
    }
    private static void portalFramesAndBitmaps() throws Exception {
        final SimulatorWebcamName camera=camera("Portal");
        final Mat[] retained={null};final double[] mean={0};final int[] init={0},draw={0};
        final CameraCalibration[] calibration={null};final Bitmap[] received={null};
        VisionProcessor processor=new VisionProcessor() {
            @Override public void init(int width,int height,CameraCalibration value) { init[0]++;calibration[0]=value; }
            @Override public Object processFrame(Mat frame,long time) {
                if(retained[0]==null)retained[0]=frame.submat(new org.opencv.core.Rect(1,1,2,2));
                mean[0]=Core.mean(retained[0]).val[1];return Long.valueOf(time);
            }
            @Override public void onDrawFrame(Canvas canvas,int width,int height,float scale,float density,Object context) {
                require(((Long)context).longValue()==200_000_000L,"Draw callback carries the processed exposure's context");
                draw[0]++;Paint paint=new Paint();paint.setColor(Color.MAGENTA);canvas.drawRect(0,0,2,2,paint);
            }
        };
        VisionPortal portal=new VisionPortal.Builder().setCamera(camera).setCameraResolution(new android.util.Size(8,6)).addProcessor(processor).build();
        try {
            deliver(camera,100,0xff0000);require(mean[0]<5,"First retained ROI sees red");
            require(calibration[0]!=null && !calibration[0].isFake(),"Rendered projection supplies actual calibration");
            near(calibration[0].focalLengthX,4,0,"Intrinsics scale with requested width");near(calibration[0].focalLengthY,3,0,"Intrinsics scale with requested height");
            require(calibration[0].getSize().getWidth()==8 && calibration[0].distortionCoefficients.length==8,"Calibration has requested size and zero-distortion model");
            portal.getFrameBitmap(Continuation.createTrivial(new Consumer<Bitmap>() { @Override public void accept(Bitmap bitmap) { received[0]=bitmap; } }));
            require(received[0]==null,"Bitmap callback waits for a subsequent exposure");
            deliver(camera,200,0x00ff00);
            require(init[0]==1 && mean[0]>250,"VisionProcessor retained ROI updates without reinitialization");
            require(draw[0]==1 && received[0].getPixel(0,0)==Color.MAGENTA,"Bitmap contains Canvas annotations");
            require(Color.green(received[0].getPixel(4,3))>250,"Bitmap contains processed source pixels");
            Bitmap snapshot=received[0];deliver(camera,300,0xff0000);
            require(Color.green(snapshot.getPixel(4,3))>250,"Delivered bitmap owns its pixels after later frames");
        }finally { portal.close(); }
        CameraCalibration unavailable=SimulatorCameraFrame.parse("0,16,12,"+Base64.getEncoder().encodeToString(CameraPipelineSmokeTest.jpeg(0)),0).calibrationForSimulator(8,6);
        require(unavailable.isFake() && unavailable.isDegenerate(),"Legacy producers explicitly report unavailable calibration");
    }
    private static void easyOpenCvFramesAndBitmaps() throws Exception {
        SimulatorWebcamName camera=camera("EasyOpenCV");final int[] initialized={0};final long[] captured={0};
        final Bitmap[] received={null};final double[] retainedMean={0};
        OpenCvPipeline pipeline=new TimestampedOpenCvPipeline() {
            Mat retained;
            @Override public void init(Mat frame) { initialized[0]++;retained=frame.submat(new org.opencv.core.Rect(0,0,2,2)); }
            @Override public Mat processFrame(Mat frame,long timestamp) { captured[0]=timestamp;retainedMean[0]=Core.mean(retained).val[1];requestViewportDrawHook(Long.valueOf(timestamp));return frame; }
            @Override public void onDrawFrame(Canvas canvas,int width,int height,float scale,float density,Object context) {
                require(((Long)context).longValue()==captured[0],"EasyOpenCV draw context matches source time");Paint paint=new Paint();paint.setColor(Color.BLUE);canvas.drawRect(0,0,1,1,paint);
            }
        };
        OpenCvWebcam webcam=OpenCvCameraFactory.getInstance().createWebcam(camera);webcam.setPipeline(pipeline);webcam.openCameraDevice();
        try {
            webcam.startStreaming(8,6);deliver(camera,100,0xff0000);
            webcam.getFrameBitmap(Continuation.createTrivial(new Consumer<Bitmap>() { @Override public void accept(Bitmap bitmap) { received[0]=bitmap; } }));
            deliver(camera,200,0x00ff00);require(captured[0]==200_000_000L && retainedMean[0]>250,"Timestamped pipeline and retained ROI use new camera data");
            require(received[0].getPixel(0,0)==Color.BLUE && Color.green(received[0].getPixel(4,3))>250,"EasyOpenCV bitmap includes output plus draw hook");
            webcam.stopStreaming();deliver(camera,300,0xff0000);webcam.startStreaming(8,6);
            require(initialized[0]==1,"Stream restart initializes each pipeline instance only once");
            webcam.setPipeline(null);deliver(camera,400,0x00ff00);require(captured[0]==300_000_000L,"Null pipeline restores unprocessed streaming");
        }finally { webcam.closeCameraDevice(); }
    }
    private static void colorProcessors() {
        Mat frame=new Mat(40,60,CvType.CV_8UC3,new Scalar(0,0,0));
        Imgproc.rectangle(frame,new Point(15,12),new Point(30,23),new Scalar(255,0,0),-1);
        Imgproc.rectangle(frame,new Point(35,15),new Point(41,21),new Scalar(255,0,0),-1);
        ColorBlobLocatorProcessor locator=new ColorBlobLocatorProcessor.Builder().setTargetColorRange(ColorRange.RED)
                .setRoi(ImageRegion.asUnityCenterCoordinates(-.6,.5,.6,-.5)).setContourMode(ColorBlobLocatorProcessor.ContourMode.EXTERNAL_ONLY).build();
        locator.init(60,40,null);Object context=locator.processFrame(frame,0);
        List<ColorBlobLocatorProcessor.Blob> blobs=locator.getBlobs();require(blobs.size()==2,"FTC color locator thresholds actual pixels within the ROI");
        ColorBlobLocatorProcessor.Blob largest=blobs.get(0);require(largest.getContourArea()==165,"Default sort puts the largest contour first");
        near(largest.getBoxFit().center.x,22.5,1e-6,"ROI-relative contours become absolute image coordinates");
        near(largest.getBoxFit().center.y,17.5,1e-6,"Absolute blob center Y");near(largest.getDensity(),1,1e-6,"Rectangle fills its convex hull");
        near(largest.getAspectRatio(),15.0/11,1e-6,"Aspect ratio uses minimum-area rectangle");near(largest.getArcLength(),52,1e-6,"Blob perimeter");
        require(largest.getCircularity()>0 && largest.getCircle().getRadius()>9,"Blob circle and circularity are measured");
        ColorBlobLocatorProcessor.Util.filterByArea(100,1000,blobs);require(blobs.size()==1,"Static blob utilities filter measured results");
        locator.addFilter(new ColorBlobLocatorProcessor.BlobFilter(ColorBlobLocatorProcessor.BlobCriteria.BY_CONTOUR_AREA,10,100));
        locator.processFrame(frame,1);require(locator.getBlobs().size()==1 && locator.getBlobs().get(0).getContourArea()==36,"Installed filter is applied on the next image");
        locator.removeAllFilters();locator.setSort(new ColorBlobLocatorProcessor.BlobSort(ColorBlobLocatorProcessor.BlobCriteria.BY_CONTOUR_AREA,SortOrder.ASCENDING));
        locator.processFrame(frame,2);require(locator.getBlobs().get(0).getContourArea()==36,"Installed ascending sort");
        Bitmap bitmap=Bitmap.createBitmap(60,40,Bitmap.Config.ARGB_8888);Canvas canvas=new Canvas(bitmap);
        locator.onDrawFrame(canvas,60,40,1,1,context);canvas.setBitmap(null);
        PredominantColorProcessor predominant=new PredominantColorProcessor.Builder().setRoi(ImageRegion.entireFrame())
                .setSwatches(PredominantColorProcessor.Swatch.GREEN,PredominantColorProcessor.Swatch.CYAN,PredominantColorProcessor.Swatch.BLUE,PredominantColorProcessor.Swatch.RED).build();
        predominant.init(60,40,null);frame.setTo(new Scalar(0,255,0));
        Imgproc.rectangle(frame,new Point(36,0),new Point(59,39),new Scalar(0,0,255),-1);
        predominant.processFrame(frame,3);require(predominant.getAnalysis().closestSwatch==PredominantColorProcessor.Swatch.GREEN,"Predominant processor clusters chroma rather than averaging two hues");
        frame.setTo(new Scalar(255,0,0));predominant.processFrame(frame,4);
        require(predominant.getAnalysis().closestSwatch==PredominantColorProcessor.Swatch.RED,"Official processor's retained ROI reads the following image");
        require(predominant.getAnalysis().RGB[0]>250 && predominant.getAnalysis().HSV[0]<5,"All FTC color result formats are populated");
    }
    private static void geometry() {
        Mat mask=new Mat(12,12,CvType.CV_8UC1);Imgproc.rectangle(mask,new Point(1,1),new Point(10,10),new Scalar(255),-1);
        Imgproc.rectangle(mask,new Point(3,3),new Point(8,8),new Scalar(0),-1);mask.put(5,5,255);
        List<MatOfPoint> contours=new ArrayList<MatOfPoint>();Imgproc.findContours(mask,contours,new Mat(),Imgproc.RETR_LIST,Imgproc.CHAIN_APPROX_SIMPLE);
        require(contours.size()==3,"Flattened contour retrieval includes holes and islands");
        Point[] points={new Point(0,0),new Point(4,0),new Point(4,2),new Point(0,2),new Point(2,1)};
        MatOfPoint polygon=new MatOfPoint(points);MatOfInt hull=new MatOfInt();Imgproc.convexHull(polygon,hull);require(hull.rows()==4,"Convex hull excludes internal points");
        RotatedRect box=Imgproc.minAreaRect(new MatOfPoint2f(points));near(box.size.area(),8,1e-6,"Minimum rotated rectangle area");
        Point center=new Point();float[] radius={0};Imgproc.minEnclosingCircle(new MatOfPoint2f(points),center,radius);
        near(center.x,2,1e-6,"Minimum enclosing circle center");near(radius[0],Math.sqrt(5),.001,"Minimum enclosing circle radius");
        Mat samples=new Mat(6,2,CvType.CV_32FC1);samples.put(0,0,new float[]{0,0,0,1,1,0,10,10,10,11,11,10});
        Mat labels=new Mat(),centers=new Mat();double compactness=Core.kmeans(samples,2,labels,new TermCriteria(3,10,.001),1,Core.KMEANS_PP_CENTERS,centers);
        near(compactness,8.0/3,1e-5,"K-means compactness matches the analytic solution");
    }
    private static void continuations() {
        final List<Runnable> queued=new ArrayList<Runnable>();final int[] calls={0};
        Continuation<Consumer<Integer>> continuation=Continuation.create(new Executor() { @Override public void execute(Runnable work) { queued.add(work); } },
                new Consumer<Integer>() { @Override public void accept(Integer value) { calls[0]+=value; } });
        continuation.dispatch(new ContinuationResult<Consumer<Integer>>() { @Override public void handle(Consumer<Integer> target) { target.accept(2); } });
        require(calls[0]==0 && queued.size()==1 && !continuation.isTrivial(),"Continuation honors the supplied executor");queued.remove(0).run();require(calls[0]==2,"Deferred continuation runs exactly once");
    }
    private static void bitmapStorage() {
        Bitmap immutable=Bitmap.createBitmap(new int[]{Color.RED,Color.BLUE},2,1,Bitmap.Config.ARGB_8888);
        require(!immutable.isMutable() && immutable.getPixel(1,0)==Color.BLUE,"Color-array bitmap factory returns immutable owned pixels");
        Bitmap writable=immutable.copy(Bitmap.Config.ARGB_8888,true);Canvas canvas=new Canvas(writable);
        int saved=canvas.save();canvas.translate(100,100);canvas.drawColor(Color.GREEN);canvas.restoreToCount(saved);canvas.setBitmap(null);
        require(writable.getPixel(0,0)==Color.GREEN && immutable.getPixel(0,0)==Color.RED,"Canvas color fill ignores transforms and bitmap copies own their storage");
    }
}
