package org.firstinspires.ftc.sim;

import java.io.BufferedReader;
import java.io.OutputStreamWriter;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;

/** Runs the ordinary VisionPortal API in the persistent worker against delayed world tag frames. */
public final class VisionPortalBridgeSmokeTest {
    public static void main(String[] args) throws Exception {
        Process process = new ProcessBuilder(
                javaExecutable(), "-cp", System.getProperty("java.class.path"),
                PersistentOpModeRunnerCli.class.getName(),
                "--class", VisionPortalSampleOpMode.class.getName(),
                "--robot-id", "red-1",
                "--camera", "v1,Webcam%201").redirectErrorStream(true).start();
        BufferedReader replies = new BufferedReader(
                new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8));
        PrintWriter commands = new PrintWriter(
                new OutputStreamWriter(process.getOutputStream(), StandardCharsets.UTF_8), true);

        commands.println("INIT\tinit\tred-1\t0\t0\t\t0,0,0,0,0,0,12.5,0\t");
        readSuccess(replies, "INIT");
        commands.println("START\tstart");
        readSuccess(replies, "START");

        commands.println(tick("1", "20", "2", "20", ""));
        String beforeLatency = readSuccess(replies, "pre-latency TICK");
        require(beforeLatency.contains("\"tag_count\":\"0\""),
                "No detections should be exposed before the synthetic camera latency expires: " + beforeLatency);

        String deliveredTag = "tag%3A30%3AWebcam%201=30%2CWebcam%25201%2C20%2C50%2C1%2C0.25%2C-0.5%2C0%2C0%2C0%2C1%2C1.1456%2C0.2%2C0.1";
        commands.println(tick("2", "60", "3", "60", deliveredTag));
        String delivered = readSuccess(replies, "post-latency TICK");
        require(delivered.contains("\"tag_count\":\"1\""), "world-visible tag should be detected");
        require(delivered.contains("\"fresh_count\":\"1\""), "new capture should be reported once as fresh");
        require(delivered.contains("\"tag_id\":\"30\""), "AprilTag id must come from the world observation");
        require(delivered.contains("\"tag_name\":\"BIOBUZZ Red opposite-audience CELL tag 30\""),
                "metadata name must identify the official BIOBUZZ tag");
        require(delivered.contains("\"tag_size\":\"3.25\""), "metadata should carry the published 3.25-inch tag size");
        require(delivered.contains("\"hamming\":\"-1\""), "image decode hamming value must be marked unavailable");
        require(delivered.contains("\"decision_margin\":\"NaN\""),
                "image decode confidence must be marked unavailable");
        require(delivered.contains("\"field_pose\":\"not supplied by world observation API\""),
                "field metadata must remain absent unless the world observation contract supplies it");
        require(delivered.contains("\"ftc_pose\":\"-19.69,39.37,9.84\""),
                "FTC XYZ pose should be converted from the actual synthetic camera transform");
        require(delivered.contains("\"ftc_range\":\"45.10\""), "FTC range must use the supplied world range");
        require(delivered.contains("\"ftc_bearing\":\"11.46\""), "FTC bearing must use the supplied world bearing");
        require(delivered.contains("\"ftc_elevation\":\"5.73\""), "FTC elevation must use the supplied world elevation");
        require(delivered.contains("\"frame_time_ns\":\"20000000\""),
                "capture timestamp should be the source frame time, before delivery latency");
        require(delivered.contains("\"image_data\":\"not provided by world observation API\""),
                "pixel-space image fields must remain explicit instead of fabricated");

        commands.println(tick("3", "80", "4", "80", deliveredTag));
        String repeated = readSuccess(replies, "repeated-frame TICK");
        require(repeated.contains("\"tag_count\":\"1\""), "current visible tags remain available");
        require(repeated.contains("\"fresh_count\":\"0\""), "a repeated capture must not be reported fresh twice");

        commands.println("CLOSE\tclose");
        readSuccess(replies, "CLOSE");
        commands.close();
        require(process.waitFor() == 0, "VisionPortal worker should close cleanly");

        verifyUnsupportedVisionContract();
        System.out.println("VisionPortal synthetic AprilTag bridge tests passed");
    }

    private static String tick(String sequence, String time, String worldTick, String simulationTime, String tags) {
        return "TICK\ttick-" + sequence + "\t" + sequence + "\t20\t\t\t\t"
                + "0,0,0,0,0,0,12.5,0\tred-1\t" + worldTick + "\t" + simulationTime + "\t" + tags;
    }

    private static void verifyUnsupportedVisionContract() {
        org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName camera =
                new SimulatorWebcamName("Configured", new SimulatorVisionRuntime("Configured"));
        org.firstinspires.ftc.vision.apriltag.AprilTagProcessor aprilTags =
                org.firstinspires.ftc.vision.apriltag.AprilTagProcessor.easyCreateWithDefaults();
        org.firstinspires.ftc.vision.VisionPortal portal =
                new org.firstinspires.ftc.vision.VisionPortal.Builder()
                        .setCamera(camera).addProcessor(aprilTags).build();
        expectIllegalState("uninitialized camera observations", "No world camera frame has been applied",
                () -> aprilTags.getDetections());
        require(portal.getFps()==0, "No delivered image has zero measured FPS");
        portal.getFrameBitmap(org.firstinspires.ftc.robotcore.external.function.Continuation.createTrivial(
                new org.firstinspires.ftc.robotcore.external.function.Consumer<android.graphics.Bitmap>() {
                    @Override public void accept(android.graphics.Bitmap bitmap) { throw new AssertionError("No image has arrived yet"); }
                }));
        expectUnsupported("physical camera control", "physical camera controls",
                () -> portal.getCameraControl(org.firstinspires.ftc.robotcore.external.hardware.camera.controls.CameraControl.class));
        expectUnsupported("webcam pixel characteristics", "pixel resolutions",
                () -> ((SimulatorWebcamName) camera).getCameraCharacteristics());
        expectUnsupported("AprilTag decimation", "image detector decimation", () -> aprilTags.setDecimation(2.0f));
        expectUnsupported("native pose solver", "native/OpenCV pose solvers",
                () -> aprilTags.setPoseSolver(org.firstinspires.ftc.vision.apriltag.AprilTagProcessor.PoseSolver.OPENCV_ITERATIVE));
        expectUnsupported("pose-solver timing", "native pose-solver timing", () -> aprilTags.getPerTagAvgPoseSolveTime());
        expectUnsupported("direct native processor init", "native image processor initialization",
                () -> aprilTags.init(640, 480, null));
        expectUnsupported("direct native processor frame", "arbitrary camera pipelines are unsupported",
                () -> aprilTags.processFrame(null, 0));
        expectUnsupported("native lens intrinsics", "pixel lens intrinsics",
                () -> new org.firstinspires.ftc.vision.apriltag.AprilTagProcessor.Builder()
                        .setLensIntrinsics(500, 500, 320, 240));
        expectUnsupported("non-field AprilTag family", "BIOBUZZ uses 36h11",
                () -> new org.firstinspires.ftc.vision.apriltag.AprilTagProcessor.Builder()
                        .setTagFamily(org.firstinspires.ftc.vision.apriltag.AprilTagProcessor.TagFamily.TAG_25h9));
        portal.close();

        expectUnsupported("built-in Android camera", "built-in Android phone cameras",
                () -> new org.firstinspires.ftc.vision.VisionPortal.Builder()
                        .setCamera(org.firstinspires.ftc.robotcore.external.hardware.camera.BuiltinCameraDirection.BACK));
        new org.firstinspires.ftc.vision.VisionPortal.Builder().setCamera(camera)
                .setCameraResolution(new android.util.Size(640,480))
                .setStreamFormat(org.firstinspires.ftc.vision.VisionPortal.StreamFormat.MJPEG);
        expectUnsupported("live camera view", "live camera image display",
                () -> new org.firstinspires.ftc.vision.VisionPortal.Builder().enableLiveView(true));

        org.firstinspires.ftc.vision.VisionProcessor arbitrary =
                new org.firstinspires.ftc.vision.VisionProcessor() {
                    @Override public void init(int width, int height,
                            org.firstinspires.ftc.robotcore.internal.camera.calibration.CameraCalibration calibration) {}
                    @Override public Object processFrame(org.opencv.core.Mat frame, long captureTimeNanos) { return null; }
                    @Override public void onDrawFrame(android.graphics.Canvas canvas, int width, int height,
                            float scaleX, float scaleY, Object userContext) {}
                };
        org.firstinspires.ftc.vision.VisionPortal custom = new org.firstinspires.ftc.vision.VisionPortal.Builder()
                .setCamera(camera).addProcessor(arbitrary).build();
        custom.close();
    }

    private static void expectUnsupported(String capability, String expectedMessage, UnsupportedCall call) {
        try {
            call.run();
            throw new AssertionError(capability + " must fail explicitly instead of silently no-oping");
        } catch (UnsupportedOperationException expected) {
            require(expected.getMessage() != null && expected.getMessage().contains(expectedMessage),
                    capability + " should explain its unsupported contract: " + expected.getMessage());
        }
    }

    private static void expectIllegalState(String capability, String expectedMessage, UnsupportedCall call) {
        try {
            call.run();
            throw new AssertionError(capability + " must not fabricate an empty observation frame");
        } catch (IllegalStateException expected) {
            require(expected.getMessage() != null && expected.getMessage().contains(expectedMessage),
                    capability + " should explain why no observation is available: " + expected.getMessage());
        }
    }

    private interface UnsupportedCall { void run(); }

    private static String readSuccess(BufferedReader replies, String operation) throws Exception {
        String response = replies.readLine();
        if (response == null) throw new AssertionError(operation + " returned no worker frame");
        if (!response.contains("\"ok\":true")) {
            throw new AssertionError(operation + " returned a worker error: " + response);
        }
        return response;
    }

    private static String javaExecutable() {
        String executable = System.getProperty("os.name", "").toLowerCase().contains("win")
                ? "java.exe" : "java";
        return System.getProperty("java.home") + java.io.File.separator + "bin"
                + java.io.File.separator + executable;
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
