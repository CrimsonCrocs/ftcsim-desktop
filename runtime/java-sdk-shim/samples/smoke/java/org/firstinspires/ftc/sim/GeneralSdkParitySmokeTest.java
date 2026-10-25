package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.*;
import com.qualcomm.robotcore.hardware.*;
import com.qualcomm.robotcore.util.*;
import org.firstinspires.ftc.robotcore.external.navigation.*;
import org.firstinspires.ftc.robotcore.external.matrices.*;
import java.util.*;
import java.util.concurrent.TimeUnit;

/** Also compiled with the official FTC jars first to verify JVM descriptors and inheritance. */
public final class GeneralSdkParitySmokeTest {
    private static void require(boolean result,String message) { if(!result)throw new AssertionError(message); }
    private static void near(double actual,double expected,double tolerance,String message) { require(Math.abs(actual-expected)<=tolerance,message+": "+actual+" != "+expected); }
    public static void main(String[] args) throws Exception {
        hardware();gamepads();lifecycle();navigation();unitsAndTime();
        System.out.println("GeneralSdkParitySmokeTest passed");
    }
    private static void hardware() {
        HardwareMap map=new SimulatorRunner().getHardwareMap();int initial=map.size();
        DcMotor motor=new SimDcMotorEx();map.put("drive",motor);map.put("alias",motor);
        require(map.get("drive")==motor && map.dcMotor.get("drive")==motor,"Untyped and legacy typed lookup");
        require(map.size()==initial+1 && map.getAll(DcMotor.class).size()==1,"Hardware enumeration deduplicates aliases by identity");
        require(map.dcMotor.size()==2 && map.getAllNames(DcMotor.class).equals(new TreeSet<String>(Arrays.asList("alias","drive"))),"Mapping counts names and enumerates sorted aliases");
        int count=0;for(HardwareDevice device:map)count++;require(count==map.size(),"HardwareMap implements Iterable");
        require(map.remove("alias",motor) && map.getNamesOf(motor).equals(Collections.singleton("drive")),"Removing an alias preserves the device's other names");
        DcMotor replacement=new SimDcMotorEx();map.dcMotor.put("drive",replacement);
        require(map.get(DcMotor.class,"drive")==replacement && map.getAll(DcMotor.class).size()==1,"Typed mapping replacement removes the old registration");
        require(map.dcMotor.entrySet().iterator().next().getValue()==replacement && map.dcMotor.remove("drive"),"Mapping entries and removal");
        SimulatorDigitalChannel pin=new SimulatorDigitalChannel("limit");map.put("limit",pin);pin.applyFeedbackForSimulator(false,0);
        TouchSensor touch=map.get(TouchSensor.class,"limit");require(touch.isPressed() && touch.getValue()==1 && map.touchSensor.get("limit")==touch,"Digital contact is exposed as active-low touch sensor");
        pin.applyFeedbackForSimulator(true,20);require(!touch.isPressed() && touch.getValue()==0,"Touch release follows the actual input level");
        pin.setMode(DigitalChannel.Mode.OUTPUT);try { touch.isPressed();throw new AssertionError("Touch output must fail"); }catch(IllegalStateException expected) { }
    }
    private static void gamepads() {
        Gamepad input=new Gamepad(),copy=new Gamepad();input.a=true;copy.copy(input);
        require(copy.a && copy.cross && copy.atRest(),"Gamepad.copy preserves controls; buttons do not affect atRest");
        require(copy.aWasPressed() && !copy.aWasPressed() && copy.crossWasPressed(),"Button notifications are consumed once and aliases have independent notifications");
        input.a=false;copy.copy(input);input.a=true;copy.copy(input);input.a=false;copy.copy(input);
        require(copy.aWasPressed() && copy.aWasReleased() && !copy.aWasReleased(),"Unpolled press and release events survive subsequent input frames");
        copy.setTriggerThreshold(.7f);input.left_trigger=.6f;copy.copy(input);require(!copy.left_trigger_pressed && !copy.leftTriggerWasPressed(),"Trigger threshold is destination-specific");
        input.left_trigger=.8f;copy.copy(input);require(copy.left_trigger_pressed && copy.leftTriggerWasPressed() && !copy.leftTriggerWasPressed(),"Trigger threshold generates consumable edges");
        copy.resetEdgeDetection();require(!copy.leftTriggerWasPressed() && !copy.aWasPressed(),"Reset clears pending edges");
        input.left_stick_x=.25f;input.setGamepadId(Gamepad.ID_SYNTHETIC);input.setTimestamp(42);copy.copy(input);
        require(!copy.atRest() && copy.getGamepadId()==Gamepad.ID_SYNTHETIC && copy.timestamp==42 && copy.getTriggerThreshold()==.7f,"Copy preserves input metadata and leaves local settings alone");
        input.left_stick_x=0;input.left_trigger=0;copy.copy(input);require(copy.atRest(),"Analog controls returned to rest");
    }
    private static void lifecycle() throws Exception {
        SimulatorClock.reset();LinearOpMode linear=new LinearOpMode() { @Override public void runOpMode() {} };
        OpMode base=linear;HardwareMap map=new SimulatorRunner().getHardwareMap();
        base.getClass().getMethod("initializeForSimulator",HardwareMap.class,org.firstinspires.ftc.robotcore.external.Telemetry.class,Gamepad.class,Gamepad.class)
                .invoke(base,map,new SimulatorTelemetry(),new Gamepad(),new Gamepad());
        require(base.hardwareMap==linear.hardwareMap && base.gamepad1==linear.gamepad1,"LinearOpMode inherits a single shared OpMode context");
        SimulatorClock.advance(20);base.getClass().getMethod("updateRuntimeForSimulator").invoke(base);near(linear.time,.02,1e-10,"Linear OpMode inherits the runtime field");
        OpMode.blackboard.put("general-parity",Boolean.TRUE);require(OpMode.blackboard.remove("general-parity")==Boolean.TRUE,"Shared SDK blackboard");
        base.requestOpModeStop();require(linear.isStopRequested() && !linear.opModeInInit(),"A polymorphic stop request wakes the linear lifecycle");
    }
    private static void navigation() {
        for(AxesReference reference:AxesReference.values())for(AxesOrder order:AxesOrder.values())for(float[] angles:new float[][]{{20,35,-15},{0,0,0},{90,90,-90},{-130,-90,80},{0,180,0}}) {
            OpenGLMatrix matrix=Orientation.getRotationMatrix(reference,order,AngleUnit.DEGREES,angles[0],angles[1],angles[2]);
            Orientation recovered=Orientation.getOrientation(matrix,reference,order,AngleUnit.DEGREES);
            MatrixF roundTrip=recovered.getRotationMatrix();
            for(int r=0;r<3;r++)for(int c=0;c<3;c++)near(roundTrip.get(r,c),matrix.get(r,c),2e-5,"Orientation round-trip "+reference+" "+order);
        }
        OpenGLMatrix transform=OpenGLMatrix.translation(4,5,6).multiplied(OpenGLMatrix.rotation(AngleUnit.DEGREES,90,0,0,1));
        VectorF result=transform.transform(new VectorF(1,0,0));near(result.get(0),4,1e-5,"Rigid transform X");near(result.get(1),6,1e-5,"Rigid transform Y");
        VectorF restored=transform.inverted().transform(result);near(restored.get(0),1,1e-5,"Inverse transform");near(restored.get(1),0,1e-5,"Inverse transform Y");
        require(transform.getData()[12]==4,"OpenGLMatrix uses column-major storage");
        Quaternion rotation=Quaternion.fromMatrix(OpenGLMatrix.rotation(AngleUnit.DEGREES,90,0,0,1),123);
        VectorF rotated=rotation.applyToVector(new VectorF(1,0,0));near(rotated.get(0),0,1e-5,"Quaternion vector X");near(rotated.get(1),1,1e-5,"Quaternion vector Y");
        near(rotation.toOrientation(AxesReference.INTRINSIC,AxesOrder.ZYX,AngleUnit.DEGREES).firstAngle,90,1e-4,"Quaternion orientation");
        require(rotation.toOrientation(AxesReference.EXTRINSIC,AxesOrder.XYZ,AngleUnit.RADIANS).acquisitionTime==123,"Quaternion conversion preserves acquisition time");
        SimulatorIMU sensor=new SimulatorIMU();IMU imu=sensor;imu.initialize(new IMU.Parameters(null));sensor.applyFeedbackForSimulator(1.2,.25,-.5,0,0,4*Math.PI,0);
        Orientation orientation=imu.getRobotOrientation(AxesReference.INTRINSIC,AxesOrder.ZYX,AngleUnit.RADIANS);
        near(orientation.firstAngle,1.2,1e-5,"IMU yaw");near(orientation.secondAngle,.25,1e-5,"IMU pitch");near(orientation.thirdAngle,-.5,1e-5,"IMU roll");
        require(orientation.acquisitionTime==1 && imu.getRobotOrientationAsQuaternion().acquisitionTime==1,"Zero-time quaternion samples preserve the library-compatible nonzero sentinel");
        near(imu.getRobotAngularVelocity(AngleUnit.DEGREES).zRotationRate,720,1e-3,"Angular rates remain unnormalized");
        imu.resetYaw();near(imu.getRobotOrientation(AxesReference.INTRINSIC,AxesOrder.ZYX,AngleUnit.RADIANS).firstAngle,0,1e-5,"General orientation honors yaw reset");
    }
    private static void unitsAndTime() {
        near(AngleUnit.normalizeDegrees(180),-180,0,"Positive half-turn wraps negative");near(AngleUnit.DEGREES.fromRadians(3*Math.PI),-180,1e-10,"Normalized conversion");
        near(UnnormalizedAngleUnit.DEGREES.fromRadians(4*Math.PI),720,1e-10,"Unnormalized conversion");
        require(new YawPitchRollAngles(AngleUnit.DEGREES,270,0,0,0).getYaw()==270,"No-argument YPR accessor preserves stored value");
        Position position=new Position(DistanceUnit.INCH,1,2,3,42);near(position.toUnit(DistanceUnit.MM).x,25.4,1e-9,"Position conversion");
        require(new Position().unit==DistanceUnit.MM && position.toUnit(DistanceUnit.INCH)==position,"Position defaults and same-unit identity");
        near(new Velocity(DistanceUnit.METER,1,2,3,42).toUnit(DistanceUnit.CM).xVeloc,100,1e-9,"Velocity conversion");
        near(Acceleration.fromGravity(0,0,1,42).zAccel,Acceleration.earthGravity,1e-9,"Gravity conversion");
        require(DistanceUnit.MM.fromMeters(DistanceUnit.infinity)==DistanceUnit.infinity,"Distance infinity sentinel survives conversion");
        require(Range.clip((byte)10,(byte)0,(byte)5)==5 && Range.clip((short)-1,(short)0,(short)5)==0,"Narrow numeric clipping");
        try { Range.throwIfRangeIsInvalid(6,0,5);throw new AssertionError("Invalid range must throw"); }catch(IllegalArgumentException expected) { }
        SimulatorClock.reset();ElapsedTime timer=new ElapsedTime();SimulatorClock.advance(20);
        require(timer.nanoseconds()==20_000_000 && timer.time(TimeUnit.MICROSECONDS)==20_000 && timer.now(TimeUnit.MILLISECONDS)==timer.startTimeNanoseconds()/1_000_000+20,"Timers share deterministic simulation time");
    }
}
