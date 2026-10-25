package org.firstinspires.ftc.teamcode;

import com.pedropathing.api.PoseFactory;
import com.pedropathing.follower.Follower;
import com.pedropathing.math.Pose;
import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.DcMotorEx;
import com.qualcomm.robotcore.hardware.DigitalChannel;
import com.qualcomm.robotcore.hardware.Servo;
import com.qualcomm.robotcore.util.ElapsedTime;
import dev.nextftc.core.commands.Command;
import dev.nextftc.ftc.NextFTCOpMode;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;
import org.firstinspires.ftc.teamcode.pedro.Constants;
import java.util.HashMap;
import java.util.Map;

import static com.pedropathing.api.Paths.line;

@Autonomous(name = "Red Pollen — Tips + Park", group = "BIOBUZZ")
public final class RedPollenAuto extends NextFTCOpMode {
    private static final double INCH = 0.0254;
    // Velocity fractions are tuned for this project's virtual flywheel and pollen.
    private static final double FLYWHEEL_FRACTION = 0.40;
    private static final double HOOD_RADIANS = 1.29;
    private static final double SECOND_FRACTION = 0.38;
    private static final double SECOND_HOOD = 1.29;
    // Reserve a drive escape if collection falls behind schedule.
    private static final double PARK_AT = 22.5;
    private static final PoseFactory POSES = PoseFactory.radians();
    private static Pose pose(double x, double z, double heading) { return POSES.of(x / INCH, -z / INCH, heading); }
    private static final Pose START = pose(-1.5761196, 1.02, 0);
    private static final Pose SHOOT = pose(-1.5100796, 1.02, 0);
    private static final Pose GARDEN_APPROACH = pose(-1.30, 1.25, -Math.PI / 2);
    // Leave the wall-side garden pollen: one starting pollen may remain aboard.
    private static final Pose GARDEN = pose(-1.46, 1.475, -Math.PI / 2);
    private static final Pose GARDEN_RETURN = pose(-1.30, 1.25, 0);
    private static final Pose CLEAR = pose(-1.20, 1.02, 0);
    private static final Pose PARK_APPROACH = pose(-1.20, -0.58, 0);
    private static final Pose PARK = pose(-1.40, -0.58, 0);
    private Follower follower;
    private DcMotorEx intake, feeder, flywheel;
    private Servo hood, gate, release, turret;
    private DigitalChannel beam;
    private AprilTagProcessor tags;
    private VisionPortal portal;
    private final Map<Integer, double[]> initialTags = new HashMap<>();
    private final ElapsedTime clock = new ElapsedTime();
    private boolean hiveFlipped, hiveMoving;
    private double visionAngle;
    private int observedTips;
    private String phase = "READY — RED / NEAR";
    private AutoRoutine routine;

    @Override public void onInit() {
        follower = Constants.create(hardwareMap);
        follower.setPose(START);
        intake = hardwareMap.get(DcMotorEx.class, "intake");
        flywheel = hardwareMap.get(DcMotorEx.class, "flywheel");
        feeder = hardwareMap.get(DcMotorEx.class, "feeder");
        turret = hardwareMap.get(Servo.class, "turret");
        hood = hardwareMap.get(Servo.class, "hood");
        gate = hardwareMap.get(Servo.class, "gate");
        release = hardwareMap.get(Servo.class, "release");
        beam = hardwareMap.get(DigitalChannel.class, "beam_break");
        beam.setMode(DigitalChannel.Mode.INPUT);
        for (DcMotorEx motor : new DcMotorEx[] {intake, flywheel, feeder}) {
            motor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
            motor.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
            motor.setPower(0);
        }
        flywheel.setMode(DcMotor.RunMode.RUN_USING_ENCODER);
        gate.setPosition(0); release.setPosition(0);
        hood.setPosition((HOOD_RADIANS - Math.PI / 12) / (Math.PI / 3));
        tags = AprilTagProcessor.easyCreateWithDefaults();
        portal = new VisionPortal.Builder().setCamera(hardwareMap.get(WebcamName.class, "Webcam 1")).addProcessor(tags).build();
        telemetry.setMsTransmissionInterval(0);
    }

    @Override public void onWaitForStart() {
        telemetry.addData("Setup", "BIOBUZZ • RED • NEAR • four starting pollen");
        telemetry.addData("Libraries", "NextFTC 1.1.0 / Pedro 3.0.2");
        telemetry.update();
        waitForStart();
    }

    @Override public void onStartButtonPressed() {
        clock.reset();
        routine = new AutoRoutine();
        routine.schedule();
    }

    @Override public void onUpdate() {
        follower.update();
        updateHiveVision();
        telemetry.addData("Phase", phase);
        telemetry.addData("Auto seconds", clock.seconds());
        telemetry.addData("Remaining", Math.max(0, 30 - clock.seconds()));
        telemetry.addData("Pedro X", follower.pose().x());
        telemetry.addData("Pedro Y", follower.pose().y());
        telemetry.addData("Pedro heading", Math.toDegrees(follower.pose().heading()));
        telemetry.addData("Flywheel ticks/s", flywheel.getVelocity());
        telemetry.addData("Throat beam", !beam.getState());
        telemetry.addData("Hive tags", initialTags.size());
        telemetry.addData("Hive flipped", hiveFlipped);
        telemetry.addData("Hive angle", visionAngle);
        telemetry.addData("Observed tips", observedTips);
        telemetry.addData("Shots this volley", routine == null ? 0 : routine.fired);
        telemetry.update();
        idle();
    }

    private static double[] rotation(double pitch, double roll, double yaw) {
        double x = Math.toRadians(pitch), y = Math.toRadians(roll), z = Math.toRadians(yaw);
        double a = Math.cos(x), b = Math.sin(x), c = Math.cos(y), d = Math.sin(y), e = Math.cos(z), f = Math.sin(z);
        return new double[] {e*c, e*d*b-f*a, e*d*a+f*b, f*c, f*d*b+e*a, f*d*a-e*b, -d, c*b, c*a};
    }

    private void updateHiveVision() {
        double heading = Math.atan2(Math.sin(follower.pose().heading()), Math.cos(follower.pose().heading()));
        if (Math.abs(heading) > 0.06) return;
        for (AprilTagDetection tag : tags.getFreshDetections()) {
            if (tag.id < 30 || tag.id > 37 || tag.ftcPose == null) continue;
            double[] current = rotation(tag.ftcPose.pitch, tag.ftcPose.roll, tag.ftcPose.yaw);
            if (clock.seconds() < 2) { initialTags.put(tag.id, current); continue; }
            double[] initial = initialTags.get(tag.id);
            if (initial == null) continue;
            double trace = 0;
            for (int i = 0; i < 9; i++) trace += initial[i] * current[i];
            double angle = Math.toDegrees(Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2))));
            visionAngle = angle;
            // Latch near the 60-degree stop before the cell occludes its own tags.
            // Hysteresis keeps a partly tipping hive from selecting the next cell.
            hiveMoving = angle > 8 && angle < 55;
            if ((angle >= 55 && !hiveFlipped) || (angle <= 8 && hiveFlipped)) {
                hiveFlipped = !hiveFlipped; observedTips++;
            }
        }
    }

    private void aim() {
        Pose p = follower.pose();
        double x = p.x() - 0.15 / INCH * Math.cos(p.heading());
        double y = p.y() - 0.15 / INCH * Math.sin(p.heading());
        double targetY = (hiveFlipped ? 0.2374818 : -0.2689242) / INCH;
        double angle = Math.atan2(targetY - y, -0.3236377 / INCH - x) - p.heading() - (hiveFlipped ? 0 : 0.04);
        angle = Math.atan2(Math.sin(angle), Math.cos(angle));
        turret.setPosition((angle + Math.PI) / (2 * Math.PI));
        double hoodAngle = hiveFlipped ? SECOND_HOOD : HOOD_RADIANS;
        hood.setPosition((hoodAngle - Math.PI / 12) / (Math.PI / 3));
    }

    private double targetSpeed() { return (hiveFlipped ? SECOND_FRACTION : FLYWHEEL_FRACTION) * 312 / 60 * 537.7; }
    private void neutral() {
        follower.stop(); intake.setPower(0); feeder.setPower(0);
        flywheel.setVelocity(0); flywheel.setPower(0);
    }
    @Override public void onStop() { try { neutral(); } finally { if (portal != null) portal.close(); } }

    private final class AutoRoutine extends Command {
        private int stage, parkLeg, fired;
        private boolean done, feeding, sawBeam;
        private double stageSince, feedStarted, nextFeed, arrivedSince = -1;
        private Pose destination;
        @Override public boolean isDone() { return done; }
        private void drive(Pose destination) {
            this.destination = destination; arrivedSince = -1;
            Pose from = follower.pose();
            follower.follow(line(from, destination).linear(from, destination));
        }
        private boolean arrived() {
            if (destination == null || follower.isBusy()) { arrivedSince = -1; return false; }
            Pose p = follower.pose();
            double headingError = Math.atan2(Math.sin(p.heading() - destination.heading()), Math.cos(p.heading() - destination.heading()));
            if (Math.hypot(p.x() - destination.x(), p.y() - destination.y()) > 0.65 || Math.abs(headingError) > 0.04) { arrivedSince = -1; return false; }
            if (arrivedSince < 0) arrivedSince = clock.seconds();
            return clock.seconds() - arrivedSince > 0.30;
        }
        private void enter(int next) { stage = next; stageSince = clock.seconds(); }
        private void volley(int next) { enter(next); fired = 0; feeding = false; sawBeam = false; nextFeed = clock.seconds(); }
        @Override public void start() { drive(SHOOT); enter(0); }
        private void shoot() {
            aim(); intake.setPower(0.6);
            double time = clock.seconds(), target = targetSpeed();
            flywheel.setVelocity(target);
            if (!feeding && time >= nextFeed && flywheel.getVelocity() > 0.95 * target && !hiveMoving) {
                feeding = true; sawBeam = false; feedStarted = time;
            }
            if (feeding) {
                if (!beam.getState()) sawBeam = true;
                if ((sawBeam && beam.getState()) || time - feedStarted > 1.7 || hiveMoving) {
                    if (sawBeam && beam.getState()) fired++;
                    feeding = false; nextFeed = time + 0.25;
                }
            }
            feeder.setPower(feeding ? 0.7 : 0);
        }
        private void park() {
            phase = "PEDRO PARK";
            intake.setPower(0); feeder.setPower(0); flywheel.setVelocity(0);
            if (parkLeg == 0) { drive(CLEAR); parkLeg = 1; }
            else if (arrived()) {
                if (parkLeg == 1) { drive(PARK_APPROACH); parkLeg = 2; }
                else if (parkLeg == 2) { drive(PARK); parkLeg = 3; }
                else { phase = "PARKED — MOTORS OFF"; neutral(); done = true; }
            }
        }
        @Override public void update() {
            double time = clock.seconds(), age = time - stageSince;
            if (time >= 29.5) { phase = "TIME LIMIT — MOTORS OFF"; neutral(); done = true; return; }
            if (stage == 13 || (time >= PARK_AT && stage < 6)) { stage = 13; park(); return; }
            flywheel.setVelocity(targetSpeed());
            if (stage != 0 && stage != 8) { feeding = false; feeder.setPower(0); }
            switch (stage) {
                case 0:
                    phase = "OPENING POLLEN VOLLEY";
                    if (time < 3.5) { aim(); intake.setPower(0.6); feeder.setPower(0); }
                    else shoot();
                    if (hiveFlipped || (fired >= 4 && time >= nextFeed) || time > 10.5) {
                        intake.setPower(0); feeder.setPower(0); drive(GARDEN_APPROACH); enter(1);
                    }
                    break;
                case 1:
                    phase = "GARDEN APPROACH";
                    if (arrived()) { drive(GARDEN); enter(2); }
                    break;
                case 2:
                    phase = "INTAKE GARDEN POLLEN"; intake.setPower(0.8);
                    if (arrived()) enter(3);
                    break;
                case 3:
                    phase = "COLLECT GARDEN POLLEN"; intake.setPower(0.8);
                    if (age > 2.1) { intake.setPower(0); drive(GARDEN_RETURN); enter(4); }
                    break;
                case 4:
                    phase = "CLEAR GARDEN";
                    if (arrived()) { drive(CLEAR); enter(5); }
                    break;
                case 5:
                    phase = "CROSS TO RED LOADING ZONE";
                    if (arrived()) { drive(PARK_APPROACH); enter(6); }
                    break;
                case 6:
                    phase = "ALIGN FINAL POLLEN VOLLEY";
                    if (arrived()) { drive(PARK); enter(7); }
                    break;
                case 7:
                    phase = "SETTLE IN RED LOADING ZONE";
                    if (arrived()) volley(8);
                    break;
                case 8:
                    phase = fired >= 4 ? "WAIT FOR HIVE" : "FINAL POLLEN VOLLEY";
                    if (fired < 4 && observedTips < 2) shoot();
                    else { aim(); intake.setPower(0); feeder.setPower(0); }
                    if (observedTips >= 2 || time >= 28.8) {
                        phase = "PARKED — MOTORS OFF"; neutral(); done = true;
                    }
                    break;
            }
            if (stage != 0 && stage != 3 && stage != 8 && time - stageSince > 4.5) { stage = 13; park(); }
        }
        @Override public void stop(boolean interrupted) { neutral(); }
    }
}
