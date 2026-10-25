package org.firstinspires.ftc.sim;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.file.Files;
import java.util.Base64;
import java.util.ArrayList;
import javax.imageio.ImageIO;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.VisionProcessor;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import org.openftc.easyopencv.*;

public final class CameraPipelineSmokeTest {
    static void require(boolean condition,String message) { if(!condition)throw new AssertionError(message); }
    static byte[] jpeg(int color) throws Exception {
        BufferedImage image=new BufferedImage(16,12,BufferedImage.TYPE_INT_RGB);
        for(int y=0;y<12;y++)for(int x=0;x<16;x++)image.setRGB(x,y,color);
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();ImageIO.write(image,"jpeg",bytes);return bytes.toByteArray();
    }
    static void deliver(SimulatorVisionRuntime runtime,long time,int color) throws Exception {
        runtime.applyEncodedImageForSimulator(time+",16,12,"+Base64.getEncoder().encodeToString(jpeg(color)),time);
    }
    public static final class Processor implements VisionProcessor {
        int calls,initializations;long captured;double red;
        @Override public void init(int width,int height,CameraCalibration calibration) { require(width==8 && height==6,"Resolution reaches processor init");initializations++; }
        @Override public Object processFrame(Mat input,long time) { require(input.channels()==3,"VisionPortal supplies RGB");calls++;captured=time;red=Core.mean(input).val[0];input.setTo(Scalar.all(0));return null; }
        @Override public void onDrawFrame(android.graphics.Canvas canvas,int width,int height,float a,float b,Object context) {}
    }
    public static void main(String[] args) throws Exception {
        if(args.length==2 && args[0].equals("--fixtures")) { Files.write(new File(args[1],"red.jpg").toPath(),jpeg(0xff0000));Files.write(new File(args[1],"green.jpg").toPath(),jpeg(0x00ff00));return; }
        SimulatorVisionRuntime runtime=new SimulatorVisionRuntime("Webcam 1");
        SimulatorWebcamName camera=new SimulatorWebcamName("Webcam 1",runtime);
        Processor first=new Processor(),second=new Processor();
        VisionPortal portal=new VisionPortal.Builder().setCamera(camera).setCameraResolution(new android.util.Size(8,6)).addProcessors(first,second).build();
        require(first.calls==0,"No fabricated startup image");
        deliver(runtime,100,0xff0000);
        require(first.calls==1 && first.red>250 && second.red==0,"Processors share the frame in SDK registration order");
        deliver(runtime,100,0x00ff00);require(first.calls==1,"Duplicate capture is not processed twice");
        portal.setProcessorEnabled(first,false);deliver(runtime,200,0x00ff00);
        require(first.calls==1 && second.calls==2 && second.red<5,"Disable only the selected processor");
        portal.stopStreaming();deliver(runtime,300,0xff0000);require(second.calls==2,"Stop prevents processing");
        portal.resumeStreaming();require(second.calls==3,"Resume receives newest available exposure");
        portal.setProcessorEnabled(first,true);deliver(runtime,400,0xff0000);
        require(first.calls==2 && first.initializations==1 && first.captured==400_000_000L,"Init once and preserve source capture timestamp");
        OpenCvWebcam webcam=OpenCvCameraFactory.getInstance().createWebcam(camera);
        try { webcam.openCameraDevice();throw new AssertionError("Camera ownership must be exclusive"); }catch(IllegalStateException expected) {}
        portal.close();require(webcam.openCameraDevice()==0,"Close releases webcam ownership");
        final int[] seen={0,0};final double[] green={0};
        webcam.setPipeline(new OpenCvPipeline() {
            final Mat hsv=new Mat(),mask=new Mat();
            @Override public void init(Mat input) { seen[1]++; }
            @Override public Mat processFrame(Mat input) {
                require(input.cols()==6 && input.rows()==8 && input.channels()==4,"EasyOpenCV supplies rotated RGBA");
                Imgproc.cvtColor(input,hsv,Imgproc.COLOR_RGB2HSV);
                Core.inRange(hsv,new Scalar(50,200,200),new Scalar(70,255,255),mask);
                green[0]=Core.countNonZero(mask)/(double)mask.total();seen[0]++;return input;
            }
        });
        webcam.startStreaming(8,6,OpenCvCameraRotation.SIDEWAYS_LEFT);
        deliver(runtime,500,0x00ff00);require(green[0]>.99,"HSV threshold detects actual green pixels");
        webcam.stopStreaming();deliver(runtime,600,0xff0000);require(seen[0]==2,"Stopped webcam receives no callbacks");
        webcam.startStreaming(8,6,OpenCvCameraRotation.SIDEWAYS_LEFT);require(webcam.getFrameCount()==1 && seen[1]==1,"Restart resets stream statistics without repeating pipeline init");
        webcam.closeCameraDevice();
        Mat parent=new Mat(4,5,CvType.CV_8UC1);Mat roi=parent.submat(new Rect(1,1,3,2));roi.setTo(new Scalar(255));
        require(Core.countNonZero(parent)==6,"ROI writes share image storage");
        ArrayList<MatOfPoint> contours=new ArrayList<MatOfPoint>();
        Imgproc.findContours(parent,contours,new Mat(),Imgproc.RETR_EXTERNAL,Imgproc.CHAIN_APPROX_SIMPLE);
        require(contours.size()==1 && contours.get(0).rows()==4 && Imgproc.contourArea(contours.get(0))==2,"Contours trace mask boundary, not bounding-box area");
        org.opencv.imgproc.Moments moments=Imgproc.moments(contours.get(0));
        require(moments.m10/moments.m00==2 && moments.m01/moments.m00==1.5,"Polygon centroid follows pixel contour");
        Mat holes=new Mat(12,12,CvType.CV_8UC1);Imgproc.rectangle(holes,new Point(1,1),new Point(10,10),new Scalar(255),-1);
        Imgproc.rectangle(holes,new Point(3,3),new Point(8,8),new Scalar(0),-1);holes.put(5,5,255);
        Imgproc.findContours(holes,contours,new Mat(),Imgproc.RETR_EXTERNAL,Imgproc.CHAIN_APPROX_SIMPLE);
        require(contours.size()==1,"External retrieval excludes islands inside holes");
        System.out.println("CameraPipelineSmokeTest passed");
    }
}
