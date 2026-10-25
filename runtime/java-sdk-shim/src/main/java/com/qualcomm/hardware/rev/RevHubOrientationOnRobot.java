package com.qualcomm.hardware.rev;

import com.qualcomm.robotcore.hardware.ImuOrientationOnRobot;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

/** Orthogonal hub mounting metadata. World IMU samples are already expressed in robot axes. */
public final class RevHubOrientationOnRobot implements ImuOrientationOnRobot {
    public enum LogoFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    public enum UsbFacingDirection { UP, DOWN, FORWARD, BACKWARD, LEFT, RIGHT }
    private final Quaternion rotation;
    private final Quaternion robotAxes;
    private final Quaternion rotationOffset;
    public RevHubOrientationOnRobot(LogoFacingDirection logo, UsbFacingDirection usb) {
        this(quaternionForDirections(logo, usb));
    }
    private static Quaternion quaternionForDirections(LogoFacingDirection logo, UsbFacingDirection usb) {
        if (logo == null || usb == null) throw new IllegalArgumentException("Hub directions cannot be null");
        double[] z = axis(logo.name()), y = axis(usb.name());
        if (z[0]*y[0] + z[1]*y[1] + z[2]*y[2] != 0) throw new IllegalArgumentException("Physically impossible REV Hub orientation");
        double[] x = { y[1]*z[2]-y[2]*z[1], y[2]*z[0]-y[0]*z[2], y[0]*z[1]-y[1]*z[0] };
        return quaternion(new double[][] {{x[0],y[0],z[0]}, {x[1],y[1],z[1]}, {x[2],y[2],z[2]}});
    }
    public RevHubOrientationOnRobot(Quaternion rotation) {
        if (rotation == null) throw new IllegalArgumentException("Rotation cannot be null");
        // REV's IMU is rotated -90 degrees about Z inside the hub (FTC 11.1 contract).
        float s = (float)Math.sqrt(0.5);
        this.rotation = rotation.multiply(new Quaternion(s,0,0,-s,0),0).normalized();
        Quaternion zOnly = new Quaternion(this.rotation.w,0,0,this.rotation.z,0);
        robotAxes = zOnly.magnitude() > 0 ? zOnly.normalized() : Quaternion.identityQuaternion();
        rotationOffset = this.rotation.multiply(robotAxes.inverse(),0).normalized().inverse().normalized();
    }
    @Override public Quaternion angularVelocityTransform() { return rotation; }
    @Override public Quaternion imuRotationOffset() { return rotationOffset; }
    @Override public Quaternion imuCoordinateSystemOrientationFromPerspectiveOfRobot() { return robotAxes; }
    private static double[] axis(String name) {
        if ("UP".equals(name)) return new double[]{0,0,1};
        if ("DOWN".equals(name)) return new double[]{0,0,-1};
        if ("FORWARD".equals(name)) return new double[]{0,1,0};
        if ("BACKWARD".equals(name)) return new double[]{0,-1,0};
        if ("LEFT".equals(name)) return new double[]{-1,0,0};
        return new double[]{1,0,0};
    }
    private static Quaternion quaternion(double[][] m) {
        double w,x,y,z;
        double trace=m[0][0]+m[1][1]+m[2][2];
        if (trace>0) {double s=Math.sqrt(trace+1)*2;w=s/4;x=(m[2][1]-m[1][2])/s;y=(m[0][2]-m[2][0])/s;z=(m[1][0]-m[0][1])/s;}
        else if(m[0][0]>m[1][1]&&m[0][0]>m[2][2]) {double s=Math.sqrt(1+m[0][0]-m[1][1]-m[2][2])*2;w=(m[2][1]-m[1][2])/s;x=s/4;y=(m[0][1]+m[1][0])/s;z=(m[0][2]+m[2][0])/s;}
        else if(m[1][1]>m[2][2]) {double s=Math.sqrt(1+m[1][1]-m[0][0]-m[2][2])*2;w=(m[0][2]-m[2][0])/s;x=(m[0][1]+m[1][0])/s;y=s/4;z=(m[1][2]+m[2][1])/s;}
        else {double s=Math.sqrt(1+m[2][2]-m[0][0]-m[1][1])*2;w=(m[1][0]-m[0][1])/s;x=(m[0][2]+m[2][0])/s;y=(m[1][2]+m[2][1])/s;z=s/4;}
        return new Quaternion((float)w,(float)x,(float)y,(float)z,0).normalized();
    }
}
