package org.firstinspires.ftc.vision.apriltag;

import org.firstinspires.ftc.robotcore.external.matrices.VectorF;
import org.firstinspires.ftc.robotcore.external.navigation.DistanceUnit;
import org.firstinspires.ftc.robotcore.external.navigation.Quaternion;

/** FTC AprilTag library metadata. BIOBUZZ name, id and published target size are supplied. */
public class AprilTagMetadata {
    public final int id;
    public final double tagsize;
    public final String name;
    public final DistanceUnit distanceUnit;
    public final VectorF fieldPosition;
    public final Quaternion fieldOrientation;

    public AprilTagMetadata(int id, String name, double tagsize, VectorF fieldPosition,
            DistanceUnit distanceUnit, Quaternion fieldOrientation) {
        this.id = id; this.name = name; this.tagsize = tagsize;
        this.distanceUnit = distanceUnit; this.fieldPosition = fieldPosition;
        this.fieldOrientation = fieldOrientation;
    }

    public AprilTagMetadata(int id, String name, double tagsize, DistanceUnit distanceUnit) {
        this(id, name, tagsize, null, distanceUnit, null);
    }
}
