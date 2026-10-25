package org.firstinspires.ftc.vision.apriltag;

/** Lookup-only FTC AprilTag library used for the published BIOBUZZ 36h11 targets. */
public class AprilTagLibrary {
    private final AprilTagMetadata[] tags;

    public AprilTagLibrary() { this(new AprilTagMetadata[0]); }

    public AprilTagLibrary(AprilTagMetadata[] tags) {
        if (tags == null) throw new IllegalArgumentException("tag metadata cannot be null");
        this.tags = tags.clone();
        for (AprilTagMetadata tag : this.tags) {
            if (tag == null) throw new IllegalArgumentException("tag metadata cannot contain null");
        }
    }

    public AprilTagMetadata[] getAllTags() { return tags.clone(); }

    public AprilTagMetadata lookupTag(int id) {
        for (AprilTagMetadata tag : tags) if (tag.id == id) return tag;
        return null;
    }
}
