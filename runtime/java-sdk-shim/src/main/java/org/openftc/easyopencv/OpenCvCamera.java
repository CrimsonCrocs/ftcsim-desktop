package org.openftc.easyopencv;
import org.firstinspires.ftc.robotcore.external.stream.CameraStreamSource;

public interface OpenCvCamera extends CameraStreamSource {
    int CAMERA_OPEN_ERROR_FAILURE_TO_OPEN_CAMERA_DEVICE=-1, CAMERA_OPEN_ERROR_POSTMORTEM_OPMODE=-2;
    interface AsyncCameraOpenListener { void onOpened(); void onError(int errorCode); }
    interface AsyncCameraCloseListener { void onClose(); }
    int openCameraDevice();
    void openCameraDeviceAsync(AsyncCameraOpenListener listener);
    void closeCameraDevice();
    void closeCameraDeviceAsync(AsyncCameraCloseListener listener);
    void startStreaming(int width,int height);
    void startStreaming(int width,int height,OpenCvCameraRotation rotation);
    void stopStreaming();
    void setPipeline(OpenCvPipeline pipeline);
    int getFrameCount();
    float getFps();
    int getPipelineTimeMs();
    int getOverheadTimeMs();
    int getTotalFrameTimeMs();
    int getCurrentPipelineMaxFps();
}
