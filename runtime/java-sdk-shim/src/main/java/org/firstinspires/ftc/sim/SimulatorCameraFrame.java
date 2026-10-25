package org.firstinspires.ftc.sim;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.util.Base64;
import java.util.Iterator;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import org.opencv.core.Mat;
import org.opencv.core.CvType;
import org.opencv.core.Size;
import org.opencv.imgproc.Imgproc;

/** An actual renderer exposure. Decode dimensions before allocating an image. */
public final class SimulatorCameraFrame {
    public final long captureTimeMillis;
    public final int width,height;
    private final BufferedImage image;
    private float[] intrinsics;

    private SimulatorCameraFrame(long time,int width,int height,BufferedImage image) {
        this.captureTimeMillis=time;this.width=width;this.height=height;this.image=image;
    }
    static SimulatorCameraFrame parse(String encoded,long worldTime) {
        String[] parts=encoded.split(",",-1);
        if(parts.length!=4 && parts.length!=8) throw new IllegalArgumentException("Camera frame needs time, dimensions, JPEG and optional pinhole intrinsics");
        long time=Long.parseLong(parts[0]); int width=Integer.parseInt(parts[1]),height=Integer.parseInt(parts[2]);
        if(time<0 || time>worldTime || width<1 || height<1 || width>1280 || height>720 || parts[3].length()>699052)
            throw new IllegalArgumentException("Camera frame exceeds its time/image budget");
        byte[] bytes=Base64.getDecoder().decode(parts[3]);
        if(bytes.length>524288 || bytes.length<2 || (bytes[0]&255)!=255 || (bytes[1]&255)!=216)
            throw new IllegalArgumentException("Camera exposure must be a bounded JPEG");
        try (ImageInputStream input=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            Iterator<ImageReader> readers=ImageIO.getImageReaders(input);
            if(!readers.hasNext()) throw new IllegalArgumentException("Unreadable camera JPEG");
            ImageReader reader=readers.next();
            try {
                reader.setInput(input,true,true);
                if(reader.getWidth(0)!=width || reader.getHeight(0)!=height) throw new IllegalArgumentException("Camera JPEG dimensions differ from metadata");
                SimulatorCameraFrame frame=new SimulatorCameraFrame(time,width,height,reader.read(0));
                if(parts.length==8) {
                    frame.intrinsics=new float[4];for(int i=0;i<4;i++) {
                        double value=Double.parseDouble(parts[i+4]);
                        if(!Double.isFinite(value) || Math.abs(value)>1e9)throw new IllegalArgumentException("Invalid camera intrinsics");
                        frame.intrinsics[i]=(float)value;
                    }
                    if(frame.intrinsics[0]<=0 || frame.intrinsics[1]<=0 || frame.intrinsics[2]<0 || frame.intrinsics[2]>width || frame.intrinsics[3]<0 || frame.intrinsics[3]>height)
                        throw new IllegalArgumentException("Invalid camera intrinsics");
                }
                return frame;
            } finally { reader.dispose(); }
        } catch(java.io.IOException failure) { throw new IllegalArgumentException("Could not decode camera JPEG",failure); }
    }
    public Mat toMatForSimulator(int targetWidth,int targetHeight,int channels) {
        Mat source=new Mat(height,width,CvType.CV_8UC(channels));
        byte[] pixels=new byte[width*height*channels];
        int[] rgb=image.getRGB(0,0,width,height,null,0,width);
        for(int i=0;i<rgb.length;i++) {
            pixels[i*channels]=(byte)(rgb[i]>>16);pixels[i*channels+1]=(byte)(rgb[i]>>8);pixels[i*channels+2]=(byte)rgb[i];
            if(channels==4) pixels[i*channels+3]=(byte)255;
        }
        source.put(0,0,pixels);
        if(targetWidth==width && targetHeight==height) return source;
        Mat resized=new Mat(); Imgproc.resize(source,resized,new Size(targetWidth,targetHeight)); source.release(); return resized;
    }
    public void copyToMatForSimulator(Mat destination,int width,int height,int channels) {
        Mat next=toMatForSimulator(width,height,channels);try { next.copyTo(destination); }finally { next.release(); }
    }
    public org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration calibrationForSimulator(int targetWidth,int targetHeight) {
        org.firstinspires.ftc.robotcore.external.android.util.Size size=new org.firstinspires.ftc.robotcore.external.android.util.Size(targetWidth,targetHeight);
        if(intrinsics==null)return org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration.forUnavailable(null,size);
        return new org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration(null,size,
                intrinsics[0]*targetWidth/width,intrinsics[1]*targetHeight/height,intrinsics[2]*targetWidth/width,intrinsics[3]*targetHeight/height,new float[8],false,false);
    }
}
