package org.opencv.core;

/** OpenCV's packed depth/channel identifiers. The simulator supports 8-bit and floating point Mats. */
public final class CvType {
    private CvType() {}
    public static final int CV_8U=0, CV_32S=4, CV_32F=5, CV_64F=6;
    public static final int CV_32SC1=4, CV_32SC2=12, CV_32SC3=20, CV_32SC4=28;
    public static final int CV_8UC1=0, CV_8UC2=8, CV_8UC3=16, CV_8UC4=24;
    public static final int CV_32FC1=5, CV_32FC2=13, CV_32FC3=21, CV_32FC4=29;
    public static final int CV_64FC1=6, CV_64FC2=14, CV_64FC3=22, CV_64FC4=30;
    public static int CV_8UC(int channels) { return makeType(CV_8U, channels); }
    public static int CV_32FC(int channels) { return makeType(CV_32F, channels); }
    public static int CV_64FC(int channels) { return makeType(CV_64F, channels); }
    public static int makeType(int depth, int channels) {
        if (channels < 1 || channels > 4 || (depth != CV_8U && depth != CV_32S && depth != CV_32F && depth != CV_64F))
            throw new UnsupportedOperationException("Simulator Mats support 1–4 channels at CV_8U, CV_32F or CV_64F depth");
        return depth + ((channels - 1) << 3);
    }
    public static int channels(int type) { return (type >> 3) + 1; }
    public static int depth(int type) { return type & 7; }
}
