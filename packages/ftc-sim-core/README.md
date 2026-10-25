# `@ftc-studio/sim-core`

Deterministic TypeScript primitives for a browser-based FTC learning simulator. The package
contains a fixed-step clock, a typed `HardwareMap`, idealized motors/servos, gamepads,
telemetry, an OpMode state machine, and 2-D tank, mecanum, X-drive, and H-drive kinematics.
It also exposes a deterministic `PlanarDriveDynamics` controller that turns measured velocity
error into mass-scaled traction force and inertia-scaled yaw torque with bounded acceleration,
braking/coasting deceleration, jerk, finite motor force, and a Coulomb tire-traction limit.

## Dynamics tuning

`DcMotor` ramps wheel velocity instead of snapping between commands. Its optional
`poweredAccelerationTicksPerSecondSquared` and `brakeDecelerationTicksPerSecondSquared`
settings control powered response and `ZeroPowerBehavior.BRAKE`; `floatDampingPerSecond`
continues to control gradual `FLOAT` decay. The defaults are respectively 100× and 8× the
configured maximum ticks per second, per second, so existing low-speed deterministic examples
retain their response while braking remains visible across multiple 20 ms ticks.

`PlanarDriveDynamics` defaults to a 15 kg robot, 67.5 N drive-force limit, 90 N brake-force
limit, coefficient of traction 1.0, and 9.81 m/s² gravity. Its emitted planar force is bounded by
both the active motor-force limit and `tractionCoefficient * massKg *
gravityMetersPerSecondSquared`. This makes added robot mass reduce acceleration unless the drive
force is tuned upward as well. Powered acceleration uses
`maxLinearJerkMetersPerSecondCubed`; releasing the drive uses the independently faster
`maxLinearBrakeJerkMetersPerSecondCubed`, preventing stored positive acceleration from producing
a large speed surge after release. Angular motion has the equivalent powered/brake jerk pair.
Translation and yaw share the same traction budget. `tractionYawRadiusMeters` converts available
tire force into an effective yaw-torque limit, so low grip also reduces turning authority and a
robot cannot demand full translation and full rotation traction at the same instant.

Coasting resistance can be tuned independently with
`coastForwardDecelerationMetersPerSecondSquared` and
`coastLateralDecelerationMetersPerSecondSquared`. The older
`coastDecelerationMetersPerSecondSquared` remains supported and supplies both values when the new
axis-specific settings are omitted.

## Coordinate convention

All drivetrain poses use metres and radians. Local `x` is robot-forward, local `y` is
robot-left, and positive heading is counter-clockwise. The physics/rendering layer can consume
the public `pose` object after every clock tick.

## Deliberate API limits

This is a source-level teaching model, not the Android FTC SDK:

- TypeScript `LinearOpMode` is asynchronous (`await waitForStart()` and `await sleep()`), rather
  than a blocking Java thread.
- Motor behavior is deterministic and idealized; it omits hub firmware, PID dynamics, voltage
  sag, current transients, and backlash. `DcMotorEx` PID fields are stored for inspection but do
  not drive a physical controller.
- No Android context, USB/Lynx communication, Robot Controller/Driver Station networking,
  configuration XML, camera/vision APIs, custom drivers, or season-specific assets are included.
- Mecanum and X-drive use ideal 45-degree inverse/forward kinematics. The planar controller caps
  aggregate tire force but does not model individual contact patches or slip angles; an outer
  physics layer remains responsible for gravity and collision response. Each drivetrain exposes
  signed wheel angular velocities so that a renderer can animate the same wheel solution used by
  forward kinematics.
- `PlanarDriveDynamics` emits forces and torque; it does not integrate or overwrite pose. Feed its
  output to a rigid-body engine using the body's measured local velocity so contact impulses remain
  authoritative.

From the repository root, run package checks with `bun run --filter @ftc-studio/sim-core typecheck` and `bun run --filter @ftc-studio/sim-core test`.
