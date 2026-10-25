package org.firstinspires.ftc.robotcore.internal.camera.calibration;
public class CameraIntrinsics {
    public float focalLengthX,focalLengthY,principalPointX,principalPointY;
    public final float[] distortionCoefficients;
    public CameraIntrinsics(float fx,float fy,float cx,float cy,float[] distortion) {
        if(distortion==null || distortion.length!=8)throw new IllegalArgumentException("Eight distortion coefficients are required");
        float[] values={fx,fy,cx,cy};for(float value:values)if(!Float.isFinite(value))throw new IllegalArgumentException("Intrinsics must be finite");
        for(float value:distortion)if(!Float.isFinite(value))throw new IllegalArgumentException("Distortion must be finite");
        focalLengthX=fx;focalLengthY=fy;principalPointX=cx;principalPointY=cy;distortionCoefficients=distortion.clone();
    }
    public float[] toArray() { float[] values=new float[12];values[0]=focalLengthX;values[1]=focalLengthY;values[2]=principalPointX;values[3]=principalPointY;System.arraycopy(distortionCoefficients,0,values,4,8);return values; }
    public boolean isDegenerate() { return focalLengthX==0 && focalLengthY==0 && principalPointX==0 && principalPointY==0; }
}
