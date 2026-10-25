package org.firstinspires.ftc.robotcore.external.navigation;

import org.firstinspires.ftc.robotcore.external.matrices.MatrixF;

/** FTC quaternion ABI; tag world orientation is consumed internally for ftcPose angles. */
public class Quaternion {
    public float w, x, y, z;
    public long acquisitionTime;
    public Quaternion() {}
    public Quaternion(float w, float x, float y, float z, long acquisitionTime) {
        this.w = w; this.x = x; this.y = y; this.z = z; this.acquisitionTime = acquisitionTime;
    }
    public static Quaternion identityQuaternion() { return new Quaternion(1, 0, 0, 0, 0); }
    public static Quaternion fromMatrix(MatrixF matrix, long acquisitionTime) {
        double trace=matrix.get(0,0)+matrix.get(1,1)+matrix.get(2,2);double w,x,y,z;
        if(trace>0) { double scale=2*Math.sqrt(1+trace);w=scale/4;x=(matrix.get(2,1)-matrix.get(1,2))/scale;y=(matrix.get(0,2)-matrix.get(2,0))/scale;z=(matrix.get(1,0)-matrix.get(0,1))/scale; }
        else {
            int i=matrix.get(0,0)>matrix.get(1,1)?0:1;if(matrix.get(2,2)>matrix.get(i,i))i=2;int j=(i+1)%3,k=(i+2)%3;
            double scale=2*Math.sqrt(1+matrix.get(i,i)-matrix.get(j,j)-matrix.get(k,k));double[] xyz=new double[3];xyz[i]=scale/4;xyz[j]=(matrix.get(i,j)+matrix.get(j,i))/scale;xyz[k]=(matrix.get(i,k)+matrix.get(k,i))/scale;
            w=(matrix.get(k,j)-matrix.get(j,k))/scale;x=xyz[0];y=xyz[1];z=xyz[2];
        }
        return new Quaternion((float)w,(float)x,(float)y,(float)z,acquisitionTime).normalized();
    }
    public float magnitude() { return (float) Math.sqrt(w*w + x*x + y*y + z*z); }
    public Quaternion normalized() {
        float magnitude = magnitude();
        if (!(magnitude > 0) || !Float.isFinite(magnitude)) throw new IllegalStateException("Quaternion is not normalizable");
        return new Quaternion(w/magnitude, x/magnitude, y/magnitude, z/magnitude, acquisitionTime);
    }
    public Quaternion conjugate() { return new Quaternion(w, -x, -y, -z, acquisitionTime); }
    public Quaternion congugate() { return conjugate(); }
    public Quaternion multiply(Quaternion other, long time) {
        if (other == null) throw new IllegalArgumentException("Quaternion cannot be null");
        return new Quaternion(w*other.w-x*other.x-y*other.y-z*other.z,
                w*other.x+x*other.w+y*other.z-z*other.y,
                w*other.y-x*other.z+y*other.w+z*other.x,
                w*other.z+x*other.y-y*other.x+z*other.w, time);
    }
    public Quaternion inverse() { return normalized().conjugate(); }
    public MatrixF toMatrix() {
        org.firstinspires.ftc.robotcore.external.matrices.OpenGLMatrix result=new org.firstinspires.ftc.robotcore.external.matrices.OpenGLMatrix();
        result.put(0,0,1-2*(y*y+z*z));result.put(0,1,2*(x*y-z*w));result.put(0,2,2*(x*z+y*w));
        result.put(1,0,2*(x*y+z*w));result.put(1,1,1-2*(x*x+z*z));result.put(1,2,2*(y*z-x*w));
        result.put(2,0,2*(x*z-y*w));result.put(2,1,2*(y*z+x*w));result.put(2,2,1-2*(x*x+y*y));return result;
    }
    public Orientation toOrientation(AxesReference reference,AxesOrder order,AngleUnit unit) {
        Orientation result=Orientation.getOrientation(toMatrix(),reference,order,unit);result.acquisitionTime=acquisitionTime;return result;
    }
    public org.firstinspires.ftc.robotcore.external.matrices.VectorF applyToVector(org.firstinspires.ftc.robotcore.external.matrices.VectorF vector) {
        if(vector.length()!=3)throw new IllegalArgumentException("Rotation requires an XYZ vector");
        Quaternion pure=new Quaternion(0,vector.get(0),vector.get(1),vector.get(2),0);
        Quaternion rotated=multiply(pure,0).multiply(conjugate(),0);
        return new org.firstinspires.ftc.robotcore.external.matrices.VectorF(rotated.x,rotated.y,rotated.z);
    }
    @Override public String toString() { return String.format(java.util.Locale.US,"{w=%.3f, x=%.3f, y=%.3f, z=%.3f}",w,x,y,z); }
}
