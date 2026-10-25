package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;

/** The SDK current-game library is the official BIOBUZZ 2026-2027 set, not a fabricated camera feed. */
public final class AprilTagGameDatabase {
    private static final AprilTagLibrary BIOBUZZ = createBioBuzzLibrary();
    public AprilTagGameDatabase() {}

    public static AprilTagLibrary getCurrentGameTagLibrary() { return BIOBUZZ; }
    public static AprilTagLibrary getCenterStageTagLibrary() {
        throw new UnsupportedOperationException("Only the current BIOBUZZ field tag library is available in this simulator");
    }
    public static AprilTagLibrary getIntoTheDeepTagLibrary() {
        throw new UnsupportedOperationException("Only the current BIOBUZZ field tag library is available in this simulator");
    }
    public static AprilTagLibrary getDecodeTagLibrary() {
        throw new UnsupportedOperationException("Only the current BIOBUZZ field tag library is available in this simulator");
    }
    public static AprilTagLibrary getSampleTagLibrary() {
        throw new UnsupportedOperationException("Sample tags are not part of the simulator field");
    }

    private static AprilTagLibrary createBioBuzzLibrary() {
        AprilTagMetadata[] tags = new AprilTagMetadata[16];
        for (int id = 30; id <= 45; id++) {
            String region;
            if (id <= 33) region = "Red opposite-audience CELL";
            else if (id <= 37) region = "Red audience-side CELL";
            else if (id <= 41) region = "Blue audience-side CELL";
            else region = "Blue opposite-audience CELL";
            tags[id - 30] = new AprilTagMetadata(id, "BIOBUZZ " + region + " tag " + id,
                    3.25, DistanceUnit.INCH);
        }
        return new AprilTagLibrary(tags);
    }
}
