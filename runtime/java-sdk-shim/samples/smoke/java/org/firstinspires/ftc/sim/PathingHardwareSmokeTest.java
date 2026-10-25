package org.firstinspires.ftc.sim;

import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver;
import com.qualcomm.hardware.sparkfun.SparkFunOTOS;
import com.qualcomm.hardware.rev.RevHubOrientationOnRobot;
import com.qualcomm.hardware.lynx.LynxModule;
import com.qualcomm.robotcore.hardware.HardwareMap;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;
import java.util.Arrays;

public final class PathingHardwareSmokeTest {
    public static void main(String[] args) {
        HardwareMap map=new HardwareMap();map.put("Control Hub",new SimulatorVoltageSensor(12.5));
        require(map.voltageSensor.iterator().next().getVoltage()==12.5,"SDK voltageSensor mapping");
        LynxModule hub=map.getAll(LynxModule.class).get(0);hub.setBulkCachingMode(LynxModule.BulkCachingMode.AUTO);hub.clearBulkCache();
        require(hub.getBulkCachingMode()==LynxModule.BulkCachingMode.AUTO,"Hub cache mode");
        require(map.getNamesOf(hub).contains("Control Hub"),"Hub hardware identity");
        RevHubOrientationOnRobot orientation=new RevHubOrientationOnRobot(RevHubOrientationOnRobot.LogoFacingDirection.UP,RevHubOrientationOnRobot.UsbFacingDirection.FORWARD);
        near(orientation.angularVelocityTransform().z,-Math.sqrt(0.5),"REV internal IMU rotation");
        near(orientation.imuRotationOffset().w,1,"REV upright orientation offset");
        GoBildaPinpointDriver p=new GoBildaPinpointDriver();p.applyFeedbackForSimulator(0,0,0,0,0,0,0,0,0);
        p.setOffsets(100,200,DistanceUnit.MM);p.setEncoderResolution(1000,DistanceUnit.METER);
        p.setEncoderDirections(GoBildaPinpointDriver.EncoderDirection.REVERSED,GoBildaPinpointDriver.EncoderDirection.FORWARD);
        p.applyFeedbackForSimulator(.1,.2,0,.1,.2,0,0,0,20);
        require(p.getEncoderX()==-100&&p.getEncoderY()==200,"Raw pod resolution and direction");
        require(p.getLoopTime()==20000&&p.getFrequency()==50,"Pinpoint microseconds and Hz");
        p.applyFeedbackForSimulator(.1,.2,.1,0,0,5,0,0,40);
        require(p.getEncoderX()==-90&&p.getEncoderY()==220,"Offsets affect rotation-induced pod travel");
        GoBildaPinpointDriver wrapped=new GoBildaPinpointDriver();wrapped.setOffsets(100,200,DistanceUnit.MM);wrapped.setEncoderResolution(1000,DistanceUnit.METER);
        wrapped.applyFeedbackForSimulator(0,0,3.13,0,0,0,0,0,0);wrapped.applyFeedbackForSimulator(0,0,-3.13,0,0,0,0,0,20);
        require(Math.abs(wrapped.getEncoderX())<5&&Math.abs(wrapped.getEncoderY())<10,"Raw pods unwrap small rotations across pi");
        p.resetPosAndIMU();require(p.getEncoderX()==0&&p.getEncoderY()==0,"Reset raw counters");
        SimulatorSensorHub sensors=new SimulatorSensorHub(map,Arrays.asList(SensorProfile.parse("v1,otos,ODOMETRY")));
        sensors.applyFeedbackForSimulator("odometry%3Aotos=0,0,0,0,0,0","red-1",0,0,0,0,0,0,0,0);
        SparkFunOTOS otos=map.get(SparkFunOTOS.class,"otos");require(otos.getLinearUnit()==DistanceUnit.INCH,"OTOS SDK default is inches");otos.setAngularUnit(AngleUnit.RADIANS);otos.setLinearUnit(DistanceUnit.INCH);
        require(otos.calibrateImu()&&otos.isConnected(),"OTOS readiness");otos.resetTracking();
        require(otos.setLinearScalar(1.1)&&!otos.setLinearScalar(2),"OTOS scalar range");
        sensors.applyFeedbackForSimulator("odometry%3Aotos=0.0254,0,0,0.0254,0,0","red-1",1,20,0,0,0,0,0,0);
        near(otos.getPosition().x,1.1,"OTOS converts position units and scalar");near(otos.getVelocity().x,1.1,"OTOS converts velocity");
        near(otos.getAcceleration().x,55,"OTOS derives acceleration from frame timestamps");
        otos.setPosition(new SparkFunOTOS.Pose2D(4,5,.3));near(otos.getPosition().x,4,"OTOS setPosition");
        SimulatorIMU imu=new SimulatorIMU();imu.applyFeedbackForSimulator(Math.PI/2,0,0,0,0,0,0);
        Quaternion q=imu.getRobotOrientationAsQuaternion();near(q.z,Math.sqrt(.5),"IMU quaternion yaw");require(q.acquisitionTime>0,"Zero-time sample remains valid to Road Runner");
        System.out.println("pathing hardware contracts passed");
    }
    private static void near(double actual,double expected,String message) { require(Math.abs(actual-expected)<1e-5,message+": "+actual); }
    private static void require(boolean value,String message) { if(!value)throw new AssertionError(message); }
}
