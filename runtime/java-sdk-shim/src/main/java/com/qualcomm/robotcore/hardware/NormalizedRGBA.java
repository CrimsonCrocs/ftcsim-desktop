package com.qualcomm.robotcore.hardware;

/** FTC 11.1 normalized RGBA sample shape. Values are normalized to [0,1]. */
public class NormalizedRGBA {
    public float red;
    public float green;
    public float blue;
    public float alpha;

    public NormalizedRGBA() {}

    public int toColor() {
        int a = toByte(alpha);
        int r = toByte(red);
        int g = toByte(green);
        int b = toByte(blue);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private static int toByte(float value) {
        if (!Float.isFinite(value)) throw new IllegalStateException("RGBA value is not finite");
        return Math.max(0, Math.min(255, Math.round(value * 255.0f)));
    }
}
