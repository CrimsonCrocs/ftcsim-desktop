/**
 * Converts render wall time into bounded, fixed control ticks. Physics remains
 * browser-local during an active JVM session; remote frames only update actuator
 * demand and never throttle the field to network round-trip time.
 */
export class RealtimePhysicsClock {
  private remainderSeconds = 0;

  constructor(
    private readonly fixedStepSeconds = 0.02,
    private readonly maxAcceptedFrameSeconds = 0.1,
  ) {}

  consume(elapsedSeconds: number): number {
    this.remainderSeconds += Math.max(0, Math.min(elapsedSeconds, this.maxAcceptedFrameSeconds));
    const steps = Math.floor((this.remainderSeconds + Number.EPSILON) / this.fixedStepSeconds);
    this.remainderSeconds -= steps * this.fixedStepSeconds;
    return steps;
  }

  reset(): void {
    this.remainderSeconds = 0;
  }
}
