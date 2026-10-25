package com.qualcomm.robotcore.hardware.configuration.typecontainers;

/**
 * Simulator-supported FTC motor type contract.
 *
 * <p>The FTC SDK's device configuration type also carries Robot Controller UI metadata and hub
 * PIDF settings. The simulator implements the physical motor fields used by {@code DcMotor} and
 * TeamCode; configuration-registry and hub-configuration APIs are not emulated.</p>
 */
public final class MotorConfigurationType implements Cloneable {
    private String name = "Unspecified Motor";
    private String description = "";
    private String modelId = "unspecified";
    private double ticksPerRev;
    private double maxRPM;
    private double achievableMaxRPMFraction;
    private double gearing;

    public MotorConfigurationType() {}

    /** SDK-compatible fallback when no configured motor profile is available. */
    public static MotorConfigurationType getUnspecifiedMotorType() {
        return new MotorConfigurationType();
    }

    /** Creates a motor type from the simulator's resolved physical profile. */
    public static MotorConfigurationType createForSimulator(
            String modelId,
            double ticksPerRev,
            double maxRPM,
            double achievableMaxRPMFraction) {
        MotorConfigurationType type = new MotorConfigurationType();
        type.setModelIdForSimulator(modelId);
        type.name = modelId;
        type.ticksPerRev = ticksPerRev;
        type.maxRPM = maxRPM;
        type.achievableMaxRPMFraction = achievableMaxRPMFraction;
        return type;
    }

    public double getTicksPerRev() { return ticksPerRev; }

    public double getAchieveableMaxTicksPerSecond() {
        return ticksPerRev * maxRPM * achievableMaxRPMFraction / 60.0;
    }

    public int getAchieveableMaxTicksPerSecondRounded() {
        return (int) Math.round(getAchieveableMaxTicksPerSecond());
    }

    public void setTicksPerRev(double ticksPerRev) { this.ticksPerRev = ticksPerRev; }

    public double getGearing() { return gearing; }

    public void setGearing(double gearing) { this.gearing = gearing; }

    public double getMaxRPM() { return maxRPM; }

    public void setMaxRPM(double maxRPM) { this.maxRPM = maxRPM; }

    public double getAchieveableMaxRPMFraction() { return achievableMaxRPMFraction; }

    public void setAchieveableMaxRPMFraction(double fraction) {
        this.achievableMaxRPMFraction = fraction;
    }

    /** SDK-compatible display name inherited from UserConfigurationType. */
    public String getName() { return name; }

    /** SDK-compatible description inherited from UserConfigurationType. */
    public String getDescription() { return description; }

    public void setDescriptionForSimulator(String description) {
        this.description = description == null ? "" : description;
    }

    public String getModelIdForSimulator() { return modelId; }

    private void setModelIdForSimulator(String modelId) {
        if (modelId == null || modelId.length() == 0) {
            throw new IllegalArgumentException("modelId cannot be empty");
        }
        this.modelId = modelId;
    }

    @Override
    public MotorConfigurationType clone() {
        try {
            return (MotorConfigurationType) super.clone();
        } catch (CloneNotSupportedException impossible) {
            throw new AssertionError(impossible);
        }
    }
}
