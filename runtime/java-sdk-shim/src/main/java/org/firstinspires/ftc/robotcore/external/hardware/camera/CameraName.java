package org.firstinspires.ftc.robotcore.external.hardware.camera;

import android.content.Context;
import org.firstinspires.ftc.robotcore.external.function.Continuation;
import org.firstinspires.ftc.robotcore.external.function.Consumer;
import org.firstinspires.ftc.robotcore.internal.system.Deadline;

/** FTC SDK 11.1 camera-name ABI used by configured simulator webcams. */
public interface CameraName {
    boolean isWebcam();
    boolean isCameraDirection();
    boolean isSwitchable();
    boolean isUnknown();
    void asyncRequestCameraPermission(Context context, Deadline deadline,
            Continuation<? extends Consumer<Boolean>> continuation);
    boolean requestCameraPermission(Deadline deadline);
    CameraCharacteristics getCameraCharacteristics();
}
