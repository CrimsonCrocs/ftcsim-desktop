package org.firstinspires.ftc.vision;

import android.graphics.Canvas;
import org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration;
import org.opencv.core.Mat;

/** FTC 11.1 internal processor ABI. Custom processors are initialized and invoked by the portal. */
interface VisionProcessorInternal {
    void init(int width, int height, CameraCalibration calibration);
    Object processFrame(Mat frame, long captureTimeNanos);
    void onDrawFrame(Canvas canvas, int onscreenWidth, int onscreenHeight,
            float scaleBmpPxToCanvasPx, float scaleCanvasDensity, Object userContext);
}
