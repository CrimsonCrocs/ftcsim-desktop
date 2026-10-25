package org.firstinspires.ftc.vision;

import android.graphics.Bitmap;
import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.function.Continuation;
import org.firstinspires.ftc.robotcore.external.function.Consumer;
import org.firstinspires.ftc.robotcore.external.hardware.camera.BuiltinCameraDirection;
import org.firstinspires.ftc.robotcore.external.hardware.camera.CameraName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.robotcore.external.hardware.camera.controls.CameraControl;
import org.firstinspires.ftc.robotcore.external.stream.CameraStreamSource;
import org.firstinspires.ftc.sim.SimulatorWebcamName;
import org.firstinspires.ftc.sim.SimulatorVisionRuntime;
import org.firstinspires.ftc.sim.SimulatorCameraFrame;
import org.opencv.core.Mat;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;
import org.firstinspires.ftc.vision.apriltag.SimulatorAprilTagProcessor;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** FTC 11.1 VisionPortal subset over configured, world-fed simulated webcams. */
public abstract class VisionPortal implements CameraStreamSource {
    public static final int DEFAULT_VIEW_CONTAINER_ID = 0;

    protected VisionPortal() {}

    public static int[] makeMultiPortalView(int count, MultiPortalLayout layout) {
        throw unsupported("multi-portal Android views");
    }

    public static VisionPortal easyCreateWithDefaults(
            BuiltinCameraDirection direction, VisionProcessor... processors) {
        throw unsupported("built-in Android phone cameras");
    }

    public static VisionPortal easyCreateWithDefaults(CameraName camera, VisionProcessor... processors) {
        Builder builder = new Builder().setCamera(camera).addProcessors(processors);
        return builder.build();
    }

    public abstract void setProcessorEnabled(VisionProcessor processor, boolean enabled);
    public abstract boolean getProcessorEnabled(VisionProcessor processor);
    public abstract CameraState getCameraState();
    public abstract void saveNextFrameRaw(String filename);
    public abstract void stopStreaming();
    public abstract void resumeStreaming();
    public abstract void stopLiveView();
    public abstract void resumeLiveView();
    public abstract float getFps();
    public abstract <T extends CameraControl> T getCameraControl(Class<T> controlType);
    public abstract void setActiveCamera(WebcamName camera);
    public abstract WebcamName getActiveCamera();
    public abstract void close();

    @Override public abstract void getFrameBitmap(Continuation<? extends Consumer<Bitmap>> continuation);

    private static UnsupportedOperationException unsupported(String capability) {
        return new UnsupportedOperationException("FTC Simulator does not support " + capability);
    }

    public enum CameraState {
        OPENING_CAMERA_DEVICE, CAMERA_DEVICE_READY, STARTING_STREAM, STREAMING,
        STOPPING_STREAM, CLOSING_CAMERA_DEVICE, CAMERA_DEVICE_CLOSED, ERROR
    }
    public enum StreamFormat { YUY2, MJPEG }
    public enum MultiPortalLayout { VERTICAL, HORIZONTAL }

    public static class Builder {
        private SimulatorWebcamName camera;
        private final List<VisionProcessor> processors = new ArrayList<VisionProcessor>();
        private boolean autoStart = true;
        private int width=640,height=480;

        public Builder() {}

        public Builder setCamera(CameraName requested) {
            if (!(requested instanceof SimulatorWebcamName)) {
                throw unsupported("VisionPortal cameras other than a configured WebcamName");
            }
            camera = (SimulatorWebcamName) requested;
            if (camera.isClosedForSimulator()) throw new IllegalStateException("Configured webcam is closed");
            return this;
        }

        public Builder setCamera(BuiltinCameraDirection direction) {
            throw unsupported("built-in Android phone cameras");
        }

        public Builder setStreamFormat(StreamFormat format) { if(format==null) throw new IllegalArgumentException("Stream format is required"); return this; }
        public Builder enableLiveView(boolean enabled) {
            if (enabled) throw unsupported("live camera image display");
            return this;
        }
        public Builder setAutoStopLiveView(boolean autoStop) { throw unsupported("live camera image display"); }
        public Builder setLiveViewContainerId(int containerId) { throw unsupported("Android live-view containers"); }
        public Builder setCameraResolution(android.util.Size resolution) {
            if(resolution==null || resolution.getWidth()<1 || resolution.getHeight()<1 || resolution.getWidth()>1280 || resolution.getHeight()>720)
                throw new IllegalArgumentException("Camera resolution must be within 1280 × 720");
            width=resolution.getWidth();height=resolution.getHeight();return this;
        }

        public Builder addProcessor(VisionProcessor processor) {
            if(processor==null) throw new IllegalArgumentException("Processor is required");
            if(processors.contains(processor)) throw new IllegalArgumentException("VisionPortal cannot register the same processor twice");
            processors.add(processor);
            return this;
        }

        public Builder addProcessors(VisionProcessor... additions) {
            if (additions == null) throw new IllegalArgumentException("processors cannot be null");
            for (VisionProcessor processor : additions) addProcessor(processor);
            return this;
        }

        public Builder setAutoStartStreamOnBuild(boolean enabled) { autoStart = enabled; return this; }
        public Builder setShowStatsOverlay(boolean show) { throw unsupported("camera stats overlay"); }

        public VisionPortal build() {
            if (camera == null) throw new IllegalStateException("VisionPortal requires a configured WebcamName");
            for (VisionProcessor processor : processors) {
                if(processor instanceof SimulatorAprilTagProcessor) ((SimulatorAprilTagProcessor)processor).attachForSimulator(camera.getVisionRuntimeForSimulator());
            }
            return new SimulatorVisionPortal(camera, processors, autoStart,width,height);
        }
    }

    private static final class SimulatorVisionPortal extends VisionPortal {
        private final SimulatorWebcamName camera;
        private final List<VisionProcessor> processors;
        private final Map<VisionProcessor, Boolean> processorStates =
                new LinkedHashMap<VisionProcessor, Boolean>();
        private boolean streaming;
        private boolean closed;
        private final int width,height;
        private final Mat input=new Mat();
        private Continuation<? extends Consumer<Bitmap>> bitmapContinuation;
        private final java.util.Set<VisionProcessor> initialized=new java.util.HashSet<VisionProcessor>();
        private long firstCapture=-1,lastCapture=-1;
        private int frameCount;
        private boolean measureFps;
        private final SimulatorVisionRuntime.FrameListener listener=new SimulatorVisionRuntime.FrameListener() {
            @Override public void onFrame(SimulatorCameraFrame frame) { processImage(frame); }
            @Override public boolean wantsImageForSimulator() { return wantsImage(); }
        };

        SimulatorVisionPortal(SimulatorWebcamName camera,
                List<VisionProcessor> processors, boolean autoStart,int width,int height) {
            this.camera = camera;
            this.width=width;this.height=height;
            this.processors = new ArrayList<VisionProcessor>(processors);
            this.streaming = autoStart;
            for (VisionProcessor processor : processors) processorStates.put(processor, Boolean.TRUE);
            camera.getVisionRuntimeForSimulator().claimForSimulator(this,listener);
            refreshProcessorStates();
            processImage(camera.getVisionRuntimeForSimulator().getImageForSimulator());
        }

        private synchronized void processImage(SimulatorCameraFrame frame) {
            if(frame==null || !wantsImage() || frame.captureTimeMillis==lastCapture) return;
            frame.copyToMatForSimulator(input,width,height,3);
            final Map<VisionProcessor,Object> contexts=new LinkedHashMap<VisionProcessor,Object>();
            for(VisionProcessor processor:processors) {
                if(processor instanceof SimulatorAprilTagProcessor)continue;
                if(initialized.add(processor))processor.init(width,height,frame.calibrationForSimulator(width,height));
                if(processorStates.get(processor))contexts.put(processor,processor.processFrame(input,frame.captureTimeMillis*1_000_000L));
            }
            Continuation<? extends Consumer<Bitmap>> pending=bitmapContinuation;bitmapContinuation=null;
            if(pending!=null) {
                final Bitmap bitmap=Bitmap.fromMatForSimulator(input);
                android.graphics.Canvas canvas=new android.graphics.Canvas(bitmap);
                try { for(Map.Entry<VisionProcessor,Object> context:contexts.entrySet())context.getKey().onDrawFrame(canvas,width,height,1,1,context.getValue()); }
                finally { canvas.setBitmap(null); }
                pending.dispatch(new org.firstinspires.ftc.robotcore.external.function.ContinuationResult<Consumer<Bitmap>>() {
                    @Override public void handle(Consumer<Bitmap> consumer) { consumer.accept(bitmap); }
                });
            }
            if(firstCapture<0) firstCapture=frame.captureTimeMillis;
            lastCapture=frame.captureTimeMillis; frameCount++;
        }

        private synchronized boolean wantsImage() {
            if(!streaming || closed) return false;
            if(bitmapContinuation!=null || measureFps) return true;
            for(Map.Entry<VisionProcessor,Boolean> entry:processorStates.entrySet()) {
                if(entry.getValue().booleanValue() && !(entry.getKey() instanceof SimulatorAprilTagProcessor)) return true;
            }
            return false;
        }

        @Override public synchronized void setProcessorEnabled(VisionProcessor processor, boolean enabled) {
            VisionProcessor typed = requireProcessor(processor);
            processorStates.put(typed, enabled);
            refreshProcessorStates();
        }

        @Override public synchronized boolean getProcessorEnabled(VisionProcessor processor) {
            Boolean enabled = processorStates.get(requireProcessor(processor));
            return enabled.booleanValue();
        }

        @Override public synchronized CameraState getCameraState() {
            if (closed || camera.isClosedForSimulator()) return CameraState.CAMERA_DEVICE_CLOSED;
            return streaming ? CameraState.STREAMING : CameraState.CAMERA_DEVICE_READY;
        }

        @Override public void saveNextFrameRaw(String filename) {
            throw unsupported("saving camera images to the Android filesystem; use processFrame to inspect the rendered pixels");
        }

        @Override public synchronized void stopStreaming() { ensureOpen(); streaming = false; refreshProcessorStates(); }
        @Override public synchronized void resumeStreaming() { ensureOpen(); streaming = true; refreshProcessorStates(); processImage(camera.getVisionRuntimeForSimulator().getImageForSimulator()); }
        @Override public void stopLiveView() { throw unsupported("live camera image display"); }
        @Override public void resumeLiveView() { throw unsupported("live camera image display"); }

        @Override public synchronized float getFps() {
            measureFps=true;
            return lastCapture>firstCapture?(float)((frameCount-1)*1000.0/(lastCapture-firstCapture)):0;
        }

        @Override public <T extends CameraControl> T getCameraControl(Class<T> controlType) {
            throw unsupported("physical camera controls");
        }

        @Override public synchronized void setActiveCamera(WebcamName requested) {
            ensureOpen();
            if (requested != camera) throw unsupported("switchable/multiple camera portals");
        }

        @Override public WebcamName getActiveCamera() { ensureOpen(); return camera; }

        @Override public synchronized void close() {
            if (closed) return;
            closed = true;
            streaming = false;
            bitmapContinuation=null;input.release();
            refreshProcessorStates();
            camera.getVisionRuntimeForSimulator().releaseForSimulator(this);
        }

        @Override public synchronized void getFrameBitmap(Continuation<? extends Consumer<Bitmap>> continuation) {
            ensureOpen();if(continuation==null)throw new IllegalArgumentException("Bitmap callback is required");bitmapContinuation=continuation;
        }

        private VisionProcessor requireProcessor(VisionProcessor processor) {
            if (!processorStates.containsKey(processor)) {
                throw new IllegalArgumentException("Processor is not registered with this VisionPortal");
            }
            return processor;
        }

        private synchronized void refreshProcessorStates() {
            for (Map.Entry<VisionProcessor, Boolean> entry : processorStates.entrySet()) {
                if(entry.getKey() instanceof SimulatorAprilTagProcessor) ((SimulatorAprilTagProcessor)entry.getKey()).setPortalEnabledForSimulator(streaming && !closed && entry.getValue().booleanValue());
            }
        }

        private void ensureOpen() {
            if (closed || camera.isClosedForSimulator()) throw new IllegalStateException("VisionPortal is closed");
        }
    }
}
