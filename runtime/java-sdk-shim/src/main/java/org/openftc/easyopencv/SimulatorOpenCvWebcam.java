package org.openftc.easyopencv;

import android.graphics.Bitmap;
import org.firstinspires.ftc.robotcore.external.function.Continuation;
import org.firstinspires.ftc.robotcore.external.function.Consumer;
import org.firstinspires.ftc.sim.SimulatorWebcamName;
import org.firstinspires.ftc.sim.SimulatorCameraFrame;
import org.firstinspires.ftc.sim.SimulatorVisionRuntime;
import org.opencv.core.Mat;
import org.opencv.core.Core;

final class SimulatorOpenCvWebcam implements OpenCvWebcam, SimulatorVisionRuntime.FrameListener {
    private final SimulatorWebcamName camera;
    private boolean open,streaming;
    private int width,height,count,pipelineMs,overheadMs;
    private long first=-1,last=-1;
    private OpenCvPipeline pipeline;
    private final Mat input=new Mat();
    private Continuation<? extends Consumer<Bitmap>> bitmapContinuation;
    private OpenCvCameraRotation rotation=OpenCvCameraRotation.UPRIGHT;
    SimulatorOpenCvWebcam(SimulatorWebcamName camera) { this.camera=camera; }
    @Override public synchronized int openCameraDevice() {
        camera.getVisionRuntimeForSimulator().claimForSimulator(this,this);open=true;return 0;
    }
    @Override public void openCameraDeviceAsync(AsyncCameraOpenListener listener) {
        if(listener==null) throw new IllegalArgumentException("Camera callback is required");
        try { openCameraDevice(); } catch(IllegalStateException failure) { listener.onError(CAMERA_OPEN_ERROR_FAILURE_TO_OPEN_CAMERA_DEVICE);return; }
        listener.onOpened();
    }
    @Override public synchronized void closeCameraDevice() { streaming=false;open=false;bitmapContinuation=null;camera.getVisionRuntimeForSimulator().releaseForSimulator(this);input.release(); }
    @Override public void closeCameraDeviceAsync(AsyncCameraCloseListener listener) { closeCameraDevice();listener.onClose(); }
    @Override public void startStreaming(int width,int height) { startStreaming(width,height,OpenCvCameraRotation.UPRIGHT); }
    @Override public synchronized void startStreaming(int width,int height,OpenCvCameraRotation rotation) {
        if(!open) throw new IllegalStateException("Open camera before starting the stream");
        if(width<1 || height<1 || width>1280 || height>720 || rotation==null) throw new IllegalArgumentException("Resolution must be within 1280 × 720 and rotation is required");
        this.width=width;this.height=height;this.rotation=rotation;count=0;first=last=-1;streaming=true;
        onFrame(camera.getVisionRuntimeForSimulator().getImageForSimulator());
    }
    @Override public void startStreaming(int width,int height,OpenCvCameraRotation rotation,StreamFormat format) {
        if(format==null) throw new IllegalArgumentException("Stream format required");startStreaming(width,height,rotation);
    }
    @Override public synchronized void stopStreaming() { streaming=false; }
    @Override public synchronized void setPipeline(OpenCvPipeline pipeline) {
        this.pipeline=pipeline;
    }
    @Override public synchronized boolean wantsImageForSimulator() { return open && streaming; }
    @Override public synchronized void onFrame(SimulatorCameraFrame frame) {
        if(!streaming || frame==null || frame.captureTimeMillis==last) return;
        long began=System.nanoTime();
        Mat unrotated=frame.toMatForSimulator(width,height,4);
        try {
            if(rotation!=OpenCvCameraRotation.UPRIGHT && rotation!=OpenCvCameraRotation.SENSOR_NATIVE)
                Core.rotate(unrotated,input,rotation==OpenCvCameraRotation.UPSIDE_DOWN?Core.ROTATE_180:rotation==OpenCvCameraRotation.SIDEWAYS_LEFT?Core.ROTATE_90_COUNTERCLOCKWISE:Core.ROTATE_90_CLOCKWISE);
            else unrotated.copyTo(input);
        }finally { unrotated.release(); }
        Mat output=input;
        long pipelineBegan=System.nanoTime();
        if(pipeline!=null) {
            if(pipeline instanceof TimestampedOpenCvPipeline)((TimestampedOpenCvPipeline)pipeline).setTimestamp(frame.captureTimeMillis*1_000_000L);
            output=pipeline.processFrameInternal(input);
            if(output==null || output.empty())throw new IllegalStateException("OpenCvPipeline.processFrame must return a nonempty Mat");
        }
        pipelineMs=(int)((System.nanoTime()-pipelineBegan)/1_000_000L);
        overheadMs=(int)((pipelineBegan-began)/1_000_000L);
        Continuation<? extends Consumer<Bitmap>> pending=bitmapContinuation;bitmapContinuation=null;
        if(pending!=null) {
            final Bitmap bitmap=Bitmap.fromMatForSimulator(output);
            if(pipeline!=null && pipeline.hasDrawHookForSimulator()) {
                android.graphics.Canvas canvas=new android.graphics.Canvas(bitmap);
                try { pipeline.onDrawFrame(canvas,bitmap.getWidth(),bitmap.getHeight(),1,1,pipeline.getUserContextForDrawHook()); }
                finally { canvas.setBitmap(null); }
            }
            pending.dispatch(new org.firstinspires.ftc.robotcore.external.function.ContinuationResult<Consumer<Bitmap>>() {
                @Override public void handle(Consumer<Bitmap> consumer) { consumer.accept(bitmap); }
            });
        }
        if(first<0) first=frame.captureTimeMillis;last=frame.captureTimeMillis;count++;
    }
    @Override public synchronized int getFrameCount() { return count; }
    @Override public synchronized float getFps() { return last>first?(float)((count-1)*1000.0/(last-first)):0; }
    @Override public synchronized int getPipelineTimeMs() { return pipelineMs; }
    @Override public synchronized int getOverheadTimeMs() { return overheadMs; }
    @Override public synchronized int getTotalFrameTimeMs() { return pipelineMs+overheadMs; }
    @Override public synchronized int getCurrentPipelineMaxFps() { return pipelineMs==0?0:1000/pipelineMs; }
    @Override public void setMillisecondsPermissionTimeout(int milliseconds) { if(milliseconds<0) throw new IllegalArgumentException("Timeout cannot be negative"); }
    @Override public synchronized void getFrameBitmap(Continuation<? extends Consumer<Bitmap>> continuation) {
        if(!open)throw new IllegalStateException("Camera is closed");
        if(continuation==null)throw new IllegalArgumentException("Bitmap callback is required");bitmapContinuation=continuation;
    }
}
