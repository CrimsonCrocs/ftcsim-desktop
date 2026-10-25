package org.openftc.easyopencv;
import org.opencv.core.Mat;

public abstract class OpenCvPipeline {
    protected boolean MEMLEAK_DETECTION_ENABLED=true;
    protected int MEMLEAK_THRESHOLD_MB=100,MEMLEAK_DETECTION_PIPELINE_SETTLE_DELAY_SECONDS=2;
    private boolean firstFrame=true,drawRequested;
    private Object drawContext;
    public abstract Mat processFrame(Mat input);
    final Mat processFrameInternal(Mat input) {
        if(firstFrame) { init(input);firstFrame=false; }
        drawRequested=false;return processFrame(input);
    }
    public void init(Mat firstFrame) {}
    public void onViewportTapped() {}
    public void requestViewportDrawHook(Object context) { drawContext=context;drawRequested=true; }
    public Object getUserContextForDrawHook() { return drawContext; }
    boolean hasDrawHookForSimulator() { return drawRequested; }
    public void onDrawFrame(android.graphics.Canvas canvas,int width,int height,float pixelScale,float density,Object context) {}
    public void saveMatToDiskFullPath(Mat mat,String filename) { throw new UnsupportedOperationException("Android image file output is unavailable"); }
    public void saveMatToDisk(Mat mat,String filename) { throw new UnsupportedOperationException("Android image file output is unavailable"); }
}
