package com.qualcomm.robotcore.hardware;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.CurrentUnit;
import com.qualcomm.robotcore.hardware.configuration.typecontainers.MotorConfigurationType;

/** Simulator-owned concrete motor. TeamCode sees only the official DcMotorEx interface. */
public final class SimDcMotorEx implements DcMotorEx {
    private static final double LEGACY_TICKS_PER_REVOLUTION = 537.7;
    private static final double LEGACY_MAX_RPM = 2800.0 * 60.0 / LEGACY_TICKS_PER_REVOLUTION;

    private String modelId;
    private double ticksPerRevolution;
    private double maxRpm;
    private double achievableMaxRpmFraction;
    private double maximumTicksPerSecond;
    private MotorConfigurationType motorType;
    private double power;
    private Direction direction = Direction.FORWARD;
    private RunMode mode = RunMode.RUN_WITHOUT_ENCODER;
    private ZeroPowerBehavior zeroPowerBehavior = ZeroPowerBehavior.BRAKE;
    private double currentPositionTicks;
    private double velocityTicksPerSecond;
    private double currentAmps;
    private boolean enabled = true;
    private Double velocitySetpointTicksPerSecond;
    private boolean hasExternalFeedback;
    private int targetPositionTicks;
    private int targetPositionTolerance = 5;
    private double currentAlertAmps = Double.POSITIVE_INFINITY;
    private PIDCoefficients velocityPid = new PIDCoefficients(0, 0, 0);
    private PIDFCoefficients positionPidf = new PIDFCoefficients(0, 0, 0, 0);

    public SimDcMotorEx() {
        this("legacy-generic-537.7", LEGACY_TICKS_PER_REVOLUTION, LEGACY_MAX_RPM, 1);
    }

    public SimDcMotorEx(
            String modelId,
            double ticksPerRevolution,
            double maxRpm,
            double achievableMaxRpmFraction) {
        if (modelId == null || modelId.length() == 0) {
            throw new IllegalArgumentException("modelId cannot be empty");
        }
        if (!Double.isFinite(ticksPerRevolution) || ticksPerRevolution <= 0) {
            throw new IllegalArgumentException("ticksPerRevolution must be finite and positive");
        }
        if (!Double.isFinite(maxRpm) || maxRpm <= 0) {
            throw new IllegalArgumentException("maxRpm must be finite and positive");
        }
        if (!Double.isFinite(achievableMaxRpmFraction)
                || achievableMaxRpmFraction <= 0
                || achievableMaxRpmFraction > 1) {
            throw new IllegalArgumentException(
                    "achievableMaxRpmFraction must be greater than 0 and at most 1");
        }
        this.modelId = modelId;
        this.ticksPerRevolution = ticksPerRevolution;
        this.maxRpm = maxRpm;
        this.achievableMaxRpmFraction = achievableMaxRpmFraction;
        this.maximumTicksPerSecond = ticksPerRevolution * maxRpm * achievableMaxRpmFraction / 60.0;
        this.motorType = MotorConfigurationType.createForSimulator(
                modelId, ticksPerRevolution, maxRpm, achievableMaxRpmFraction);
    }

    @Override
    public synchronized void setPower(double power) {
        if (!Double.isFinite(power)) throw new IllegalArgumentException("power must be finite");
        this.power = Math.max(-1.0, Math.min(1.0, power));
        velocitySetpointTicksPerSecond = null;
    }

    @Override
    public synchronized double getPower() { return power; }

    @Override
    public synchronized void setDirection(Direction direction) {
        if (direction == null) throw new IllegalArgumentException("direction cannot be null");
        this.direction = direction;
    }

    @Override
    public synchronized Direction getDirection() { return direction; }

    @Override
    public synchronized void setMode(RunMode mode) {
        if (mode == null) throw new IllegalArgumentException("mode cannot be null");
        this.mode = mode;
        if (mode == RunMode.STOP_AND_RESET_ENCODER) {
            currentPositionTicks = 0;
            power = 0;
            velocitySetpointTicksPerSecond = null;
        }
    }

    @Override
    public synchronized RunMode getMode() { return mode; }

    @Override
    public synchronized void setZeroPowerBehavior(ZeroPowerBehavior zeroPowerBehavior) {
        if (zeroPowerBehavior == null) {
            throw new IllegalArgumentException("zeroPowerBehavior cannot be null");
        }
        this.zeroPowerBehavior = zeroPowerBehavior;
    }

    @Override
    public synchronized ZeroPowerBehavior getZeroPowerBehavior() { return zeroPowerBehavior; }

    @Override
    public synchronized void setPowerFloat() {
        power = 0;
        velocitySetpointTicksPerSecond = null;
        zeroPowerBehavior = ZeroPowerBehavior.FLOAT;
    }

    @Override
    public synchronized boolean getPowerFloat() {
        return power == 0 && zeroPowerBehavior == ZeroPowerBehavior.FLOAT;
    }

    @Override
    public synchronized void setTargetPosition(int position) { targetPositionTicks = position; }

    @Override
    public synchronized int getTargetPosition() { return targetPositionTicks; }

    @Override
    public synchronized int getCurrentPosition() {
        return (int) Math.round(currentPositionTicks);
    }

    @Override
    public synchronized MotorConfigurationType getMotorType() {
        return motorType.clone();
    }

    @Override
    public synchronized void setMotorType(MotorConfigurationType motorType) {
        if (motorType == null) throw new IllegalArgumentException("motorType cannot be null");
        double ticksPerRev = motorType.getTicksPerRev();
        double maxRPM = motorType.getMaxRPM();
        double achievableFraction = motorType.getAchieveableMaxRPMFraction();
        if (!Double.isFinite(ticksPerRev) || ticksPerRev <= 0
                || !Double.isFinite(maxRPM) || maxRPM <= 0
                || !Double.isFinite(achievableFraction)
                || achievableFraction <= 0 || achievableFraction > 1) {
            throw new IllegalArgumentException(
                    "motorType requires positive finite ticks/RPM and a fraction in (0, 1]");
        }
        this.motorType = motorType.clone();
        this.modelId = motorType.getModelIdForSimulator();
        this.ticksPerRevolution = ticksPerRev;
        this.maxRpm = maxRPM;
        this.achievableMaxRpmFraction = achievableFraction;
        this.maximumTicksPerSecond = ticksPerRev * maxRPM * achievableFraction / 60.0;
    }

    @Override
    public synchronized boolean isBusy() {
        return mode == RunMode.RUN_TO_POSITION
                && Math.abs(targetPositionTicks - getCurrentPosition()) > targetPositionTolerance;
    }

    @Override
    public synchronized void setMotorEnable() { setEnabledForSimulator(true); }

    @Override
    public synchronized void setMotorDisable() { setEnabledForSimulator(false); }

    @Override
    public synchronized boolean isMotorEnabled() { return enabled; }

    @Override
    public synchronized void setVelocity(double angularRate) {
        if (!Double.isFinite(angularRate)) {
            throw new IllegalArgumentException("velocity must be finite");
        }
        velocitySetpointTicksPerSecond = angularRate;
    }

    @Override
    public synchronized void setVelocity(double angularRate, AngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        double revolutionsPerSecond = unit.getUnnormalized().toRadians(angularRate) / (Math.PI * 2.0);
        setVelocity(revolutionsPerSecond * ticksPerRevolution);
    }

    @Override
    public synchronized double getVelocity() { return velocityTicksPerSecond; }

    @Override
    public synchronized double getVelocity(AngleUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        double radiansPerSecond = getVelocity() / ticksPerRevolution * Math.PI * 2.0;
        return unit.getUnnormalized().fromRadians(radiansPerSecond);
    }

    @Override
    public synchronized void setPIDCoefficients(RunMode mode, PIDCoefficients coefficients) {
        requireClosedLoopMode(mode);
        if (coefficients == null) throw new IllegalArgumentException("coefficients cannot be null");
        velocityPid = new PIDCoefficients(coefficients.p, coefficients.i, coefficients.d);
    }

    @Override
    public synchronized PIDCoefficients getPIDCoefficients(RunMode mode) {
        requireClosedLoopMode(mode);
        return new PIDCoefficients(velocityPid.p, velocityPid.i, velocityPid.d);
    }

    @Override
    public synchronized void setPIDFCoefficients(RunMode mode, PIDFCoefficients coefficients) {
        requireClosedLoopMode(mode);
        if (coefficients == null) throw new IllegalArgumentException("coefficients cannot be null");
        positionPidf = new PIDFCoefficients(
                coefficients.p, coefficients.i, coefficients.d, coefficients.f,
                coefficients.algorithm);
    }

    @Override
    public synchronized PIDFCoefficients getPIDFCoefficients(RunMode mode) {
        requireClosedLoopMode(mode);
        return new PIDFCoefficients(
                positionPidf.p, positionPidf.i, positionPidf.d, positionPidf.f,
                positionPidf.algorithm);
    }

    @Override
    public synchronized void setVelocityPIDFCoefficients(double p, double i, double d, double f) {
        positionPidf = new PIDFCoefficients(p, i, d, f);
    }

    @Override
    public synchronized void setPositionPIDFCoefficients(double p) {
        positionPidf = new PIDFCoefficients(p, positionPidf.i, positionPidf.d, positionPidf.f);
    }

    @Override
    public synchronized void setTargetPositionTolerance(int tolerance) {
        if (tolerance < 0) throw new IllegalArgumentException("tolerance cannot be negative");
        targetPositionTolerance = tolerance;
    }

    @Override
    public synchronized int getTargetPositionTolerance() { return targetPositionTolerance; }

    @Override
    public synchronized double getCurrent(CurrentUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        return unit.fromAmps(currentAmps);
    }

    @Override
    public synchronized double getCurrentAlert(CurrentUnit unit) {
        if (unit == null) throw new IllegalArgumentException("unit cannot be null");
        return unit.fromAmps(currentAlertAmps);
    }

    @Override
    public synchronized void setCurrentAlert(double current, CurrentUnit unit) {
        if (unit == null || !Double.isFinite(current) || current < 0) {
            throw new IllegalArgumentException("current alert must be finite and non-negative");
        }
        currentAlertAmps = unit.toAmps(current);
    }

    @Override
    public synchronized boolean isOverCurrent() { return currentAmps > currentAlertAmps; }

    public synchronized void applyFeedbackForSimulator(
            double positionTicks,
            double velocityTicksPerSecond,
            double currentAmps,
            boolean enabled) {
        if (!Double.isFinite(positionTicks) || !Double.isFinite(velocityTicksPerSecond)
                || !Double.isFinite(currentAmps) || currentAmps < 0) {
            throw new IllegalArgumentException("motor feedback must be finite");
        }
        this.currentPositionTicks = positionTicks;
        this.velocityTicksPerSecond = velocityTicksPerSecond;
        this.currentAmps = currentAmps;
        this.enabled = enabled;
        hasExternalFeedback = true;
    }

    public synchronized void setEnabledForSimulator(boolean enabled) {
        this.enabled = enabled;
        if (!enabled) {
            power = 0;
            velocitySetpointTicksPerSecond = null;
        }
    }

    public synchronized Double getVelocitySetpointForSimulator() {
        return velocitySetpointTicksPerSecond;
    }

    public String getModelIdForSimulator() { return modelId; }

    public double getTicksPerRevolutionForSimulator() { return ticksPerRevolution; }

    public double getMaxRpmForSimulator() { return maxRpm; }

    public double getAchievableMaxRpmFractionForSimulator() { return achievableMaxRpmFraction; }

    /** Legacy one-shot runner hook. Persistent sessions use browser-supplied feedback instead. */
    public synchronized void advanceSimulation(double seconds) {
        if (!Double.isFinite(seconds) || seconds < 0 || !enabled) return;
        if (hasExternalFeedback) {
            currentPositionTicks += velocityTicksPerSecond * seconds;
            return;
        }
        double directionMultiplier = direction == Direction.FORWARD ? 1.0 : -1.0;
        double commandedVelocity = velocitySetpointTicksPerSecond == null
                ? power * directionMultiplier * maximumTicksPerSecond
                : velocitySetpointTicksPerSecond;
        if (mode == RunMode.RUN_TO_POSITION) {
            double error = targetPositionTicks - currentPositionTicks;
            double next = currentPositionTicks + Math.signum(error)
                    * Math.abs(commandedVelocity) * seconds;
            if ((error > 0 && next >= targetPositionTicks)
                    || (error < 0 && next <= targetPositionTicks)) {
                currentPositionTicks = targetPositionTicks;
            } else {
                currentPositionTicks = next;
            }
        } else if (mode != RunMode.STOP_AND_RESET_ENCODER) {
            currentPositionTicks += commandedVelocity * seconds;
        }
    }

    private static void requireClosedLoopMode(RunMode mode) {
        if (mode != RunMode.RUN_USING_ENCODER && mode != RunMode.RUN_TO_POSITION) {
            throw new IllegalArgumentException("PID coefficients require a closed-loop run mode");
        }
    }
}
