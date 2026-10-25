package org.firstinspires.ftc.sim;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Timestamped geometric observations and independently rendered image exposures. */
public final class SimulatorVisionRuntime {
    private final String cameraName;
    private List<SimulatorAprilTagObservation> observations = Collections.emptyList();
    private long simulationTimeMillis = -1;
    private boolean closed;
    private SimulatorCameraFrame image;
    private Object owner;
    private FrameListener listener;
    public interface FrameListener {
        void onFrame(SimulatorCameraFrame frame);
        default boolean wantsImageForSimulator() { return true; }
    }

    public boolean wantsImageForSimulator() {
        FrameListener callback;
        synchronized(this) { callback=closed?null:listener; }
        // Portal methods also acquire the camera lock. Query outside it to
        // avoid reversing that lock order on a LinearOpMode's worker thread.
        return callback!=null && callback.wantsImageForSimulator();
    }

    public synchronized void claimForSimulator(Object owner,FrameListener listener) {
        if(closed) throw new IllegalStateException("Configured camera is closed");
        if(this.owner!=null && this.owner!=owner) throw new IllegalStateException("Camera '"+cameraName+"' is already in use");
        this.owner=owner;this.listener=listener;
    }
    public synchronized void releaseForSimulator(Object owner) {
        if(this.owner==owner) { this.owner=null;listener=null; }
    }
    public synchronized void resetConsumersForSimulator() { owner=null;listener=null; }
    public synchronized SimulatorCameraFrame getImageForSimulator() { return image; }
    public void applyEncodedImageForSimulator(String encoded,long worldTime) {
        long capture=Long.parseLong(encoded.substring(0,encoded.indexOf(',')));
        synchronized(this) { if(image!=null && capture==image.captureTimeMillis) return; }
        applyImageForSimulator(SimulatorCameraFrame.parse(encoded,worldTime));
    }
    public void applyImageForSimulator(SimulatorCameraFrame next) {
        FrameListener callback;
        synchronized(this) {
            if(closed) throw new IllegalStateException("Configured camera is closed");
            if(image!=null && next.captureTimeMillis<image.captureTimeMillis) throw new IllegalArgumentException("Camera capture time cannot move backwards");
            if(image!=null && next.captureTimeMillis==image.captureTimeMillis) return;
            image=next;callback=listener;
        }
        if(callback!=null) callback.onFrame(next);
    }

    public SimulatorVisionRuntime(String cameraName) {
        if (cameraName == null || cameraName.length() == 0) {
            throw new IllegalArgumentException("camera name is required");
        }
        this.cameraName = cameraName;
    }

    public synchronized void applyWorldFrameForSimulator(
            List<SimulatorAprilTagObservation> frame, long timeMillis) {
        if (closed) throw new IllegalStateException("Configured camera '" + cameraName + "' is closed");
        if (frame == null || timeMillis < 0 || (simulationTimeMillis >= 0 && timeMillis < simulationTimeMillis)) {
            throw new IllegalArgumentException("Camera frame and nondecreasing world time are required");
        }
        List<SimulatorAprilTagObservation> cameraFrame = new ArrayList<SimulatorAprilTagObservation>();
        for (SimulatorAprilTagObservation observation : frame) {
            if (!cameraName.equals(observation.camera)) {
                throw new IllegalArgumentException("Camera frame contains an observation from another camera");
            }
            if (observation.availableTimeMillis > timeMillis) {
                throw new IllegalArgumentException("Camera frame contains a tag before its delivery time");
            }
            cameraFrame.add(observation);
        }
        observations = Collections.unmodifiableList(cameraFrame);
        simulationTimeMillis = timeMillis;
    }

    public synchronized List<SimulatorAprilTagObservation> getObservationsForSimulator() {
        if (closed) throw new IllegalStateException("Configured camera '" + cameraName + "' is closed");
        if (simulationTimeMillis < 0) throw new IllegalStateException("No world camera frame has been applied");
        return observations;
    }

    public synchronized long getSimulationTimeMillisForSimulator() {
        if (simulationTimeMillis < 0) throw new IllegalStateException("No world camera frame has been applied");
        return simulationTimeMillis;
    }

    public synchronized boolean isClosedForSimulator() { return closed; }

    public synchronized void closeForSimulator() {
        closed = true;
        image=null; owner=null; listener=null;
        observations = Collections.emptyList();
    }
}
