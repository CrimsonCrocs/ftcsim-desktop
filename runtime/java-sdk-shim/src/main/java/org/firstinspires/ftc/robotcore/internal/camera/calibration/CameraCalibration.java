package org.firstinspires.ftc.robotcore.internal.camera.calibration;

import org.firstinspires.ftc.robotcore.external.android.util.Size;

/** Intrinsics of the simulator's pinhole projection, or an explicit unavailable calibration. */
public class CameraCalibration extends CameraIntrinsics implements Cloneable {
    protected final CameraCalibrationIdentity identity;
    protected final Size size;
    protected final boolean remove,isFake;
    public Size resolutionScaledFrom;
    public CameraCalibration(CameraCalibrationIdentity identity,Size size,float fx,float fy,float cx,float cy,float[] distortion,boolean remove,boolean isFake) {
        super(fx,fy,cx,cy,distortion);if(size==null || size.getWidth()<1 || size.getHeight()<1)throw new IllegalArgumentException("Calibration resolution must be positive");
        this.identity=identity;this.size=size;this.remove=remove;this.isFake=isFake;
    }
    public CameraCalibration(CameraCalibrationIdentity identity,int[] size,float[] focal,float[] principal,float[] distortion,boolean remove,boolean isFake) {
        this(identity,new Size(size[0],size[1]),focal[0],focal[1],principal[0],principal[1],distortion,remove,isFake);
    }
    public static CameraCalibration forUnavailable(CameraCalibrationIdentity identity,Size size) { return new CameraCalibration(identity,size,0,0,0,0,new float[8],false,true); }
    public CameraCalibrationIdentity getIdentity() { return identity; }
    public Size getSize() { return size; }
    public boolean getRemove() { return remove; }
    public boolean isFake() { return isFake; }
    public CameraCalibration scaledTo(Size target) {
        if(target==null || Math.abs(getAspectRatio()-(double)target.getWidth()/target.getHeight())>1e-6)throw new IllegalArgumentException("Calibration scaling must preserve aspect ratio");
        double x=(double)target.getWidth()/size.getWidth(),y=(double)target.getHeight()/size.getHeight();
        CameraCalibration result=new CameraCalibration(identity,target,(float)(focalLengthX*x),(float)(focalLengthY*y),(float)(principalPointX*x),(float)(principalPointY*y),distortionCoefficients,remove,isFake);
        result.resolutionScaledFrom=size;return result;
    }
    public double getAspectRatio() { return (double)size.getWidth()/size.getHeight(); }
    public double getDiagonal() { return getDiagonal(size); }
    public static double getDiagonal(Size size) { return Math.hypot(size.getWidth(),size.getHeight()); }
    @Override public String toString() { return "CameraCalibration("+size+", fx="+focalLengthX+", fy="+focalLengthY+", unavailable="+isFake+")"; }
}
