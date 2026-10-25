package com.qualcomm.hardware.sparkfun;

import com.qualcomm.robotcore.hardware.HardwareDevice;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/** Optical odometry API backed by a configured world odometry sensor, in SI units internally. */
public final class SparkFunOTOS implements HardwareDevice {
    public static final byte DEFAULT_ADDRESS = 0x17;
    public static final double MIN_SCALAR = 0.872, MAX_SCALAR = 1.127;
    public static class Pose2D {
        public double x, y, h;
        public Pose2D() {}
        public Pose2D(double x, double y, double h) { this.x=x; this.y=y; this.h=h; }
        public void set(Pose2D value) { x=value.x; y=value.y; h=value.h; }
        @Override public String toString() { return String.format("(%.3f, %.3f, %.3f)",x,y,h); }
    }
    private DistanceUnit linearUnit = DistanceUnit.INCH;
    private AngleUnit angularUnit = AngleUnit.DEGREES;
    private double linearScalar=1, angularScalar=1;
    private double x,y,h,vx,vy,vh,ax,ay,ah;
    private double offsetX,offsetY,offsetH,zeroX,zeroY,zeroH;
    private long sampleMillis=-1;
    public synchronized void applyFeedbackForSimulator(double x, double y, double h, double vx, double vy, double vh, long time) {
        if (!Double.isFinite(x+y+h+vx+vy+vh) || time<sampleMillis) throw new IllegalArgumentException("Invalid OTOS feedback");
        if (sampleMillis>=0 && time>sampleMillis) { double dt=(time-sampleMillis)/1000.0; ax=(vx-this.vx)/dt; ay=(vy-this.vy)/dt; ah=(vh-this.vh)/dt; }
        this.x=x;this.y=y;this.h=h;this.vx=vx;this.vy=vy;this.vh=vh;sampleMillis=time;
    }
    public boolean begin() { return isConnected(); }
    public synchronized boolean isConnected() { return sampleMillis>=0; }
    public boolean calibrateImu() { return isConnected(); }
    public boolean calibrateImu(int samples, boolean wait) { if(samples<1||samples>255) return false;return isConnected(); }
    public int getImuCalibrationProgress() { return 0; }
    public synchronized DistanceUnit getLinearUnit() { return linearUnit; }
    public synchronized void setLinearUnit(DistanceUnit unit) { if(unit==null)throw new IllegalArgumentException("Unit cannot be null");linearUnit=unit; }
    public synchronized AngleUnit getAngularUnit() { return angularUnit; }
    public synchronized void setAngularUnit(AngleUnit unit) { if(unit==null)throw new IllegalArgumentException("Unit cannot be null");angularUnit=unit; }
    public synchronized double getLinearScalar() { return linearScalar; }
    public synchronized boolean setLinearScalar(double scalar) { if(!Double.isFinite(scalar)||scalar<MIN_SCALAR||scalar>MAX_SCALAR)return false;linearScalar=scalar;return true; }
    public synchronized double getAngularScalar() { return angularScalar; }
    public synchronized boolean setAngularScalar(double scalar) { if(!Double.isFinite(scalar)||scalar<MIN_SCALAR||scalar>MAX_SCALAR)return false;angularScalar=scalar;return true; }
    public synchronized Pose2D getOffset() { return converted(offsetX,offsetY,offsetH); }
    public synchronized void setOffset(Pose2D value) { finite(value);offsetX=linearUnit.toMeters(value.x);offsetY=linearUnit.toMeters(value.y);offsetH=angularUnit.toRadians(value.h); }
    public synchronized void resetTracking() { setPosition(new Pose2D()); }
    public synchronized void setPosition(Pose2D value) { sample();finite(value);zeroX=correctedX()-linearUnit.toMeters(value.x);zeroY=correctedY()-linearUnit.toMeters(value.y);zeroH=h*angularScalar-offsetH-angularUnit.toRadians(value.h); }
    public synchronized Pose2D getPosition() { sample();return converted(correctedX()-zeroX,correctedY()-zeroY,h*angularScalar-offsetH-zeroH); }
    public synchronized Pose2D getVelocity() { sample();return converted(vx*linearScalar+vh*angularScalar*(Math.sin(h)*offsetX+Math.cos(h)*offsetY),vy*linearScalar-vh*angularScalar*(Math.cos(h)*offsetX-Math.sin(h)*offsetY),vh*angularScalar); }
    public synchronized Pose2D getAcceleration() { sample();double w=vh*angularScalar;return converted(ax*linearScalar+ah*angularScalar*(Math.sin(h)*offsetX+Math.cos(h)*offsetY)+w*w*(Math.cos(h)*offsetX-Math.sin(h)*offsetY),ay*linearScalar-ah*angularScalar*(Math.cos(h)*offsetX-Math.sin(h)*offsetY)+w*w*(Math.sin(h)*offsetX+Math.cos(h)*offsetY),ah*angularScalar); }
    public synchronized void getPosVelAcc(Pose2D position,Pose2D velocity,Pose2D acceleration) { if(position==null||velocity==null||acceleration==null)throw new IllegalArgumentException("Output poses cannot be null");position.set(getPosition());velocity.set(getVelocity());acceleration.set(getAcceleration()); }
    private double correctedX() { return x*linearScalar-Math.cos(h)*offsetX+Math.sin(h)*offsetY; }
    private double correctedY() { return y*linearScalar-Math.sin(h)*offsetX-Math.cos(h)*offsetY; }
    private Pose2D converted(double x,double y,double h) { return new Pose2D(linearUnit.fromMeters(x),linearUnit.fromMeters(y),angularUnit.getUnnormalized().fromRadians(h)); }
    private void sample() { if(sampleMillis<0)throw new IllegalStateException("No OTOS frame has been applied"); }
    private static void finite(Pose2D value) { if(value==null||!Double.isFinite(value.x)||!Double.isFinite(value.y)||!Double.isFinite(value.h))throw new IllegalArgumentException("Pose must be finite"); }
    @Override public Manufacturer getManufacturer() { return Manufacturer.SparkFun; }
    @Override public String getDeviceName() { return "Simulated SparkFun OTOS"; }
}
