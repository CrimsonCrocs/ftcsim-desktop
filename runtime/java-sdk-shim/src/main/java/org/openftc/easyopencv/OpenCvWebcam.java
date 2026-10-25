package org.openftc.easyopencv;
public interface OpenCvWebcam extends OpenCvCamera {
    enum StreamFormat { YUY2, MJPEG }
    void setMillisecondsPermissionTimeout(int milliseconds);
    void startStreaming(int width,int height,OpenCvCameraRotation rotation,StreamFormat format);
}
