package com.qualcomm.robotcore.util;

public final class Range {
    private Range() {}

    public static double clip(double number, double min, double max) {
        return Math.max(min, Math.min(max, number));
    }

    public static float clip(float number, float min, float max) {
        return Math.max(min, Math.min(max, number));
    }

    public static int clip(int number, int min, int max) {
        return Math.max(min, Math.min(max, number));
    }

    public static byte clip(byte number, byte min, byte max) { return (byte)clip((int)number,min,max); }
    public static short clip(short number, short min, short max) { return (short)clip((int)number,min,max); }
    public static void throwIfRangeIsInvalid(int number,int min,int max) {
        if(number<min || number>max)throw new IllegalArgumentException("number must be between "+min+" and "+max);
    }
    public static void throwIfRangeIsInvalid(double number,double min,double max) {
        if(number<min || number>max)throw new IllegalArgumentException("number must be between "+min+" and "+max);
    }

    public static double scale(
            double number, double x1, double x2, double y1, double y2) {
        if (x1 == x2) throw new IllegalArgumentException("input range cannot be zero");
        return y1 + (number - x1) * (y2 - y1) / (x2 - x1);
    }
}
