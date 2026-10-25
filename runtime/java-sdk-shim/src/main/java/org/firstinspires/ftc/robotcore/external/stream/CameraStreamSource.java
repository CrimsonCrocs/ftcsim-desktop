package org.firstinspires.ftc.robotcore.external.stream;

import android.graphics.Bitmap;
import org.firstinspires.ftc.robotcore.external.function.Continuation;
import org.firstinspires.ftc.robotcore.external.function.Consumer;

/** FTC stream ABI; this simulator exposes tag observations and no camera bitmap. */
public interface CameraStreamSource {
    void getFrameBitmap(Continuation<? extends Consumer<Bitmap>> continuation);
}
