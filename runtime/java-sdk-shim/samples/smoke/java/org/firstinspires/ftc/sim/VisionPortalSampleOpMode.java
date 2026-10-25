package org.firstinspires.ftc.sim;

import com.qualcomm.robotcore.eventloop.opmode.OpMode;
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName;
import org.firstinspires.ftc.vision.VisionPortal;
import org.firstinspires.ftc.vision.apriltag.AprilTagDetection;
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor;
import java.util.ArrayList;

/** Uses the ordinary FTC VisionPortal + AprilTagProcessor sample setup and detection fields. */
public final class VisionPortalSampleOpMode extends OpMode {
    private AprilTagProcessor processor;
    private VisionPortal portal;

    @Override public void init() {
        telemetry.setMsTransmissionInterval(0);
        processor = AprilTagProcessor.easyCreateWithDefaults();
        portal = new VisionPortal.Builder()
                .setCamera(hardwareMap.get(WebcamName.class, "Webcam 1"))
                .addProcessor(processor)
                .build();
    }

    @Override public void loop() {
        ArrayList<AprilTagDetection> detections = processor.getDetections();
        ArrayList<AprilTagDetection> fresh = processor.getFreshDetections();
        telemetry.addData("tag_count", detections.size());
        telemetry.addData("fresh_count", fresh.size());
        if (!detections.isEmpty()) {
            AprilTagDetection detection = detections.get(0);
            telemetry.addData("tag_id", detection.id);
            telemetry.addData("hamming", detection.hamming);
            telemetry.addData("decision_margin", detection.decisionMargin);
            telemetry.addData("tag_name", detection.metadata == null ? "no metadata" : detection.metadata.name);
            telemetry.addData("tag_size", detection.metadata == null ? "no metadata" : detection.metadata.tagsize);
            telemetry.addData("field_pose", detection.metadata == null
                    || detection.metadata.fieldPosition == null || detection.metadata.fieldOrientation == null
                    ? "not supplied by world observation API" : "unexpected field pose");
            telemetry.addData("ftc_pose", detection.ftcPose == null ? "no pose"
                    : String.format(java.util.Locale.ROOT, "%.2f,%.2f,%.2f",
                            detection.ftcPose.x, detection.ftcPose.y, detection.ftcPose.z));
            telemetry.addData("ftc_range", detection.ftcPose == null ? "no pose"
                    : String.format(java.util.Locale.ROOT, "%.2f", detection.ftcPose.range));
            telemetry.addData("ftc_bearing", detection.ftcPose == null ? "no pose"
                    : String.format(java.util.Locale.ROOT, "%.2f", detection.ftcPose.bearing));
            telemetry.addData("ftc_elevation", detection.ftcPose == null ? "no pose"
                    : String.format(java.util.Locale.ROOT, "%.2f", detection.ftcPose.elevation));
            telemetry.addData("frame_time_ns", detection.frameAcquisitionNanoTime);
            telemetry.addData("image_data", detection.center == null && detection.corners == null
                    ? "not provided by world observation API" : "unexpected image coordinates");
        }
        telemetry.addData("camera_state", portal.getCameraState());
        telemetry.update();
    }

    @Override public void stop() {
        if (portal != null) portal.close();
    }
}
