package org.firstinspires.ftc.robotcore.external.hardware.camera;

import org.firstinspires.ftc.robotcore.external.android.util.Size;
import java.util.List;

/** FTC SDK camera capabilities; unsupported cameras fail rather than inventing a sensor mode. */
public interface CameraCharacteristics {
    int[] getAndroidFormats();
    Size[] getSizes(int androidFormat);
    Size getDefaultSize(int androidFormat);
    long getMinFrameDuration(int androidFormat, Size size);
    int getMaxFramesPerSecond(int androidFormat, Size size);
    List<CameraMode> getAllCameraModes();

    final class CameraMode {
        public final int androidFormat;
        public final Size size;
        public final long nsFrameDuration;
        public final int fps;
        public final boolean isDefaultSize;
        public CameraMode(int androidFormat, Size size, long nsFrameDuration, boolean isDefaultSize) {
            this.androidFormat = androidFormat; this.size = size;
            this.nsFrameDuration = nsFrameDuration;
            this.fps = nsFrameDuration <= 0 ? 0 : (int) (1_000_000_000L / nsFrameDuration);
            this.isDefaultSize = isDefaultSize;
        }
        @Override public String toString() { return androidFormat + " " + size + " @ " + fps + "fps"; }
        @Override public boolean equals(Object other) {
            if (!(other instanceof CameraMode)) return false;
            CameraMode that = (CameraMode) other;
            return androidFormat == that.androidFormat && nsFrameDuration == that.nsFrameDuration
                    && isDefaultSize == that.isDefaultSize && (size == null ? that.size == null : size.equals(that.size));
        }
        @Override public int hashCode() { return androidFormat * 31 + (size == null ? 0 : size.hashCode()); }
    }
}
