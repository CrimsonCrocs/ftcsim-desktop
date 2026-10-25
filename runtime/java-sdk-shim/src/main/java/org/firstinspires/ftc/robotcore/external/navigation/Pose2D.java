package org.firstinspires.ftc.robotcore.external.navigation;

/** FTC 11.1 immutable planar pose value returned by the Pinpoint driver. */
public class Pose2D {
    protected final double x;
    protected final double y;
    protected final DistanceUnit distanceUnit;
    protected final double heading;
    protected final AngleUnit headingUnit;

    public Pose2D(
            DistanceUnit distanceUnit,
            double x,
            double y,
            AngleUnit headingUnit,
            double heading) {
        if (distanceUnit == null || headingUnit == null) {
            throw new IllegalArgumentException("Pose units cannot be null");
        }
        requireFinite(x, "x"); requireFinite(y, "y"); requireFinite(heading, "heading");
        this.distanceUnit = distanceUnit;
        this.x = x;
        this.y = y;
        this.headingUnit = headingUnit;
        this.heading = heading;
    }

    public double getX(DistanceUnit unit) { return unit.fromUnit(distanceUnit, x); }
    public double getY(DistanceUnit unit) { return unit.fromUnit(distanceUnit, y); }
    public double getHeading(AngleUnit unit) { return unit.fromUnit(headingUnit, heading); }

    @Override public String toString() {
        return "Pose2D{" + getX(DistanceUnit.METER) + "," + getY(DistanceUnit.METER)
                + "," + getHeading(AngleUnit.RADIANS) + "}";
    }

    private static void requireFinite(double value, String field) {
        if (!Double.isFinite(value)) throw new IllegalArgumentException(field + " must be finite");
    }
}
