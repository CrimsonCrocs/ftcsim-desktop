package com.qualcomm.robotcore.hardware;

/** Simulator-owned servo state. TeamCode sees only the official Servo interface. */
public final class SimServo implements Servo {
    private double commandPosition;
    private Direction direction = Direction.FORWARD;
    private double scaleMin;
    private double scaleMax = 1.0;

    @Override
    public synchronized void setPosition(double position) {
        if (!Double.isFinite(position)) throw new IllegalArgumentException("position must be finite");
        commandPosition = Math.max(MIN_POSITION, Math.min(MAX_POSITION, position));
    }

    @Override
    public synchronized double getPosition() { return commandPosition; }

    @Override
    public synchronized void setDirection(Direction direction) {
        if (direction == null) throw new IllegalArgumentException("direction cannot be null");
        this.direction = direction;
    }

    @Override
    public synchronized Direction getDirection() { return direction; }

    @Override
    public synchronized void scaleRange(double min, double max) {
        if (!Double.isFinite(min) || !Double.isFinite(max)
                || min < MIN_POSITION || max > MAX_POSITION || min >= max) {
            throw new IllegalArgumentException("scale range must satisfy 0 <= min < max <= 1");
        }
        scaleMin = min;
        scaleMax = max;
    }

    public synchronized double getPhysicalPositionForSimulator() {
        double directional = direction == Direction.FORWARD ? commandPosition : 1.0 - commandPosition;
        return scaleMin + directional * (scaleMax - scaleMin);
    }
}
