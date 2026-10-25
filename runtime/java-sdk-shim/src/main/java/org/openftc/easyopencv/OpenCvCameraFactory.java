package org.openftc.easyopencv;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.sim.SimulatorWebcamName;

public abstract class OpenCvCameraFactory {
    private static final OpenCvCameraFactory INSTANCE=new OpenCvCameraFactory() {
        @Override public OpenCvWebcam createWebcam(WebcamName camera) {
            if(!(camera instanceof SimulatorWebcamName)) throw new IllegalArgumentException("A configured simulator WebcamName is required");
            return new SimulatorOpenCvWebcam((SimulatorWebcamName)camera);
        }
        @Override public OpenCvWebcam createWebcam(WebcamName camera,int container) { return createWebcam(camera); }
    };
    public static OpenCvCameraFactory getInstance() { return INSTANCE; }
    public abstract OpenCvWebcam createWebcam(WebcamName camera);
    public abstract OpenCvWebcam createWebcam(WebcamName camera,int containerId);
}
