# Red Pollen Auto

A BIOBUZZ red-alliance autonomous using the actual NextFTC 1.1.0 command scheduler and Pedro Pathing revhub/core 3.0.2. The robot handles pollen through a channel narrower than nectar. Intake compliance is supplied by simulator physics v9; the shooter and drivetrain use their existing models.

## Run in FTC Simulator

1. Select BIOBUZZ, Red alliance, Near start, and four starting pollen. Keep this project's robot configuration.
2. Select **Red Pollen — Tips + Park**, then Build, INIT, and START.
3. Watch Phase, Observed tips, Throat beam, and the timer in telemetry.

The robot collects the four starting pollen, shoots into the initially upright red cell, collects three red garden pollen while reserving room for a retained starting pollen, and follows Pedro paths into the red loading area. It shoots the final volley from there and shuts down by 29.5 simulated seconds. The final scoring position overlaps the loading area while leaving clearance for an idle far-start partner.

Pedro controls every drive leg and holds each endpoint. Transitions require position and heading to settle. AprilTag orientation selects the upright cell; a hysteresis latch retains the last observed near-stop orientation when the cell hides its tags. A throat beam sequences individual feeds, and the flywheel encoder gates each feed on speed recovery. No game-state or score API is read by the autonomous.

## Robot and libraries

- REV mappings and all physical dimensions are in `ftcsim.project.json`.
- The intake is a compliant roller with a backing ramp. The 80 mm storage channel admits 71 mm pollen and excludes 91 mm nectar.
- The feeder has its own motor. A servo aims the turret; the hood servo sets elevation. The lift remains stowed.
- `pedro/Constants.java` configures four mecanum drive motors and Pinpoint `odo`. Pedro uses inches and radians; `pose()` converts the simulator field's metres and Z axis.
- NextFTC 1.1.0 is the supported NextFTC lifecycle used by this project. It is pinned deliberately; this project does not claim to use NextFTC 2.
- Pedro 3.0.2 was the latest stable `com.pedropathing:revhub` published in Maven Central when checked on 2026-10-24.
- FTC SDK 11.1.0, Kotlin 2.2.10 tooling, Gradle 8.9.

`onWaitForStart()` uses the SDK start latch, and `onUpdate()` yields with `idle()` so NextFTC participates in the simulator's clocked LinearOpMode lifecycle. The project compiles against the published libraries rather than lookalike local classes.

## Validation

The development harness runs the compiled Java OpMode for the full 30 simulated seconds against the BIOBUZZ rigid-body world. It checks tip count, park completion, controlled elements, nectar intake, and neutral motor outputs. The best verified result from the route and shooter sweeps is one tip, 3 leave points, and 5 park points (28 total), with shutdown at 28.8 s. Checks across seeds 2026, 20261024, and 20261025 confirmed a park, at most four controlled elements, no nectar intake, no rule warnings, and neutral motor outputs. The second volley is an attempt, not a guaranteed second tip. Other robots are present but idle. This is a solo route and does not claim collision avoidance against moving opponents or a mathematical maximum number of tips.

The intake contact model is an uncalibrated reduced pinch model, not a deforming mesh or a hardware-validated material simulation. Retune the physical parameters and drive/shooter calibration for a real robot.
