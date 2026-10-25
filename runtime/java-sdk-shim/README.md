# FTC SDK 11.1.0 simulator compatibility layer

This directory is a deliberately small Java proof that familiar FTC-style source can compile and
run against browser-simulator-owned implementations. Selected published FTC navigation/color-processor and
EasyOpenCV sources are adapted under their original licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
This portable subset does not replace the Android FTC SDK.

## What compiles here

- iterative `OpMode`, `LinearOpMode`, `@TeleOp`, `@Autonomous`, and `@Disabled`
- `HardwareMap`, `DcMotorSimple`, `DcMotor`, `DcMotorEx`, `Servo`, and two `Gamepad` instances
- motor modes, enable state, target/tolerance, velocity, PIDF/current metadata, BRAKE, and FLOAT
- FTC/PlayStation aliases, button edges, and browser-forwardable rumble requests
- ordered FTC `Telemetry` data/lines, lazy retained values, actions, logs, display settings, and
  deterministic transmission throttling
- deterministic `ElapsedTime`, `Range`, `AngleUnit`, and `CurrentUnit`
- a default `imu` with yaw/pitch/roll, quaternions, all SDK orientation axes orders, angular-rate
  feedback and `resetYaw()`; navigation values and portable matrix/vector transforms
- SDK-compatible linear/iterative inheritance, cooperative stop requests, hardware enumeration and
  legacy typed maps; configured digital inputs also support active-low `TouchSensor` lookup
- a default `Control Hub` voltage sensor available through `HardwareMap.get()` and `getAll()`
- a minimal threaded `SimulatorRunner` that starts/stops a `LinearOpMode`

The included `BasicLinearTeleOp` is conventional `TeamCode`-style Java: it looks up named
motors/servos, waits for start, reads `gamepad1`, writes telemetry, and loops while active.

## Smoke test

From this directory, run:

```sh
bash smoke-test.sh
```

The implementation uses only the Java standard library and the script compiles it with
`javac --release 8`; it does not use Gradle, Android Studio, the Android SDK, or Java library
dependencies. The smoke harness also uses this repository's Bun runtime to parse every CLI response
as JSON. It compiles every source file into a temporary `.build/` directory, runs the sample under
`SimulatorRunner`, asserts device/telemetry output, and removes the build directory.

## Compiled OpMode runner protocol

`org.firstinspires.ftc.sim.OpModeRunnerCli` is the process boundary between a compiler service and
the simulator. The caller puts both this shim and its freshly compiled TeamCode on the classpath,
then supplies the OpMode class and simulated inputs as arguments:

```sh
java -cp <shim-and-teamcode-classes> org.firstinspires.ftc.sim.OpModeRunnerCli \
  --class org.firstinspires.ftc.teamcode.BasicLinearTeleOp \
  --cycles 50 \
  --cycle-ms 20 \
  --motor-profile v1,left_drive,RevRobotics20HDHexMotor,560,300,0.85 \
  --motor-profile v1,right_drive,RevRobotics40HDHexMotor,1120,150,0.85 \
  --servo claw \
  --gamepad1 left_stick_y=-0.75 \
  --gamepad1 a=true
```

The exact argument contract is:

- `--class <fully.qualified.ClassName>` is required once. The class must be public, concrete,
  extend `LinearOpMode`, and have a public no-argument constructor.
- `--cycles <integer>` is optional and defaults to `50`; its range is `1..10000`.
- `--cycle-ms <integer>` is optional and defaults to `20`; its range is `1..1000`.
  `cycles * cycle-ms` may not exceed 30,000 milliseconds.
- `--motor-profile <v1,name,modelId,ticksPerRevolution,maxRpm,achievableFraction>` installs a
  physical profile for one motor and may be repeated. `name` and `modelId` use URL percent encoding
  when they contain delimiter characters. `--motor <name>` remains accepted as a legacy alias and
  selects the generic 537.7-tick profile. `--servo <name>` may also be repeated. Names must be
  unique across device types. At most 128 devices may be declared.
- `--gamepad1 <field=value>` and `--gamepad2 <field=value>` may be repeated. Stick axes accept
  `-1.0..1.0`; triggers accept `0.0..1.0`; buttons accept exactly `true` or `false`. Each field may
  be assigned once per gamepad.

Supported gamepad fields are `left_stick_x`, `left_stick_y`, `right_stick_x`, `right_stick_y`,
`left_trigger`, `right_trigger`, `a`, `b`, `x`, `y`, `dpad_up`, `dpad_down`, `dpad_left`,
`dpad_right`, `left_bumper`, `right_bumper`, `left_stick_button`, `right_stick_button`, `start`,
`back`, and `guide`.

The CLI accepts no stdin and emits exactly one JSON line to stdout. A successful response contains
`ok`, `opModeClass`, `completedCycles`, `telemetry`, named `motors`, named `servos`,
`capturedStdout`, and `capturedStdoutTruncated`. Motor values include power, encoder and target
positions, busy state, direction, mode, and zero-power behavior. Servo values include commanded
and physical positions plus direction. Output written by TeamCode is capped at 65,536 bytes and
captured in the envelope so it cannot corrupt the protocol.

Class loading, static initialization, and construction are supervised with a two-second deadline.
Execution is supervised for the requested simulated duration plus 2.5 seconds of runner overhead.
The CLI explicitly exits after flushing its response so non-daemon threads left by TeamCode cannot
keep the disposable JVM alive. An outer service must still enforce its own harder process deadline.

Failures use this shape:

```json
{"ok":false,"error":{"kind":"ARGUMENT_ERROR","message":"..."},"capturedStdout":"","capturedStdoutTruncated":false}
```

Exit code `0` means success, `2` means invalid arguments, `3` means class loading/instantiation
failed, `4` means execution failed, and `5` means an unexpected CLI failure.

## Persistent runner

`PersistentOpModeRunnerCli` stays alive for the FTC lifecycle and accepts newline-framed internal
commands from the Bun WebSocket session. TeamCode stdout is isolated from the protocol. On every
tick the browser supplies actual motor position, velocity, current, and enable feedback together
with robot orientation, angular rate, and Control Hub voltage; the JVM returns
power/velocity/target/zero-power commands. `OpModeDiscoveryCli` inspects compiled classes
without constructing or initializing them. Telemetry publications preserve duplicate captions,
item order, and multi-item line grouping. The bridge emits a structured telemetry payload only
when its revision changes, while a temporary caption/value projection keeps older clients working.

## VisionPortal and AprilTag contract

The shim supports robot-mounted rendered webcams, custom `VisionProcessor` callbacks and
EasyOpenCV pipelines over a portable CPU OpenCV subset. AprilTag detections remain geometric:
they are not decoded from the rendered pixels. See [camera simulation](../../docs/CAMERA_SIMULATION.md)
for supported operations and limitations. A configured camera is retrieved like other FTC
hardware, then connected using the ordinary API shape:

```java
AprilTagProcessor tags = AprilTagProcessor.easyCreateWithDefaults();
VisionPortal portal = new VisionPortal.Builder()
    .setCamera(hardwareMap.get(WebcamName.class, "Webcam 1"))
    .addProcessor(tags)
    .build();
List<AprilTagDetection> detections = tags.getDetections();
```

The named webcam must exist in the robot's `cameras: [{name}]` configuration. Reading detections
before the first world camera frame is an error; the shim does not invent an empty first frame. A
tag observation carries `id`, `camera`, `captureTimeMs`, `availableTimeMs`, a camera-relative
translation in meters, rotation quaternion, range in meters, and bearing/elevation in radians.
Once frames arrive, `getDetections()` reports the world frame's currently visible tags, and
`getFreshDetections()` reports each tag capture once.
World visibility/occlusion, camera placement, configured latency, and noise are decided by the
simulation world. The detection's `frameAcquisitionNanoTime` is the source capture timestamp, so
it can predate the tick at which that observation becomes available. FTC `ftcPose` translation,
range, bearing, elevation, and orientation are derived from the supplied geometric transform and
expressed in the configured output units. The current BIOBUZZ tag library supplies IDs 30–45,
official names, 36h11 family, and 3.25-inch tag size.

The AprilTag adapter does not perform image detection. Its `center`, `corners`, `rawPose`, and `robotPose` are `null`,
`decisionMargin` is `NaN`, and `hamming` is `-1`. The current observation frame also does not
include absolute field pose metadata, so the current BIOBUZZ library's `fieldPosition` and
`fieldOrientation` are `null`. These values indicate unavailable image or field-localization data;
they are not estimated camera results.

The supported executable subset is `VisionPortal.Builder()` with a configured `WebcamName`,
`addProcessor()` for the shim's `AprilTagProcessor.easyCreateWithDefaults()` (or its supported
36h11 builder with output units/library), `build()`, `getDetections()`, `getFreshDetections()`,
processor enable/disable, stream stop/resume, active-camera query, state query, and `close()`. The
official SDK jars are used in the smoke script to compile the exact sample above; the resulting
bytecode is then run with the shim first on the classpath to catch method-descriptor mismatches.

Unsupported operations fail explicitly at the bytecode compatibility gate or at runtime. These
include Android phone cameras/live-view containers, physical USB controls, native detector tuning,
raw Android filesystem capture and multi-camera portals. Bitmap callbacks and a portable annotation
canvas are supported, along with the FTC color processors and rendered-projection calibration. General native
OpenCV modules are not available; the implemented pixel-processing subset is listed in
[camera simulation](../../docs/CAMERA_SIMULATION.md).

## Intentional limits

- This is a classified compatibility layer, not Android or REV firmware. Unsupported Android,
  USB, networking, camera, vision, and vendor-driver references are rejected before Run, and the
  narrower VisionPortal runtime limits above fail explicitly when called.
- Motor shaft physics is supplied by the browser. The layer exposes command and feedback semantics
  but does not pretend to model REV firmware, bulk caching, I2C, or USB/Lynx.
- `Servo` stores a normalized position only; it has no realistic timing/load model.
- The runner uses a regular Java thread and wall-clock sleep solely for the proof. The production
  browser simulator should own a fixed-step clock. `OpModeRunnerCli` is designed to run inside an
  isolated, resource-limited process/VM; it is not itself a security sandbox.
- There is no Android application runtime, Robot Controller/Driver Station networking,
  Blocks/OnBot Java, TensorFlow/Vuforia, arbitrary native camera pipeline, custom hardware driver,
  or unrestricted native OpenCV. See the VisionPortal contract above for the supported synthetic-tag
  path and its explicit limits.
- Unmatched navigation matrix overloads/storage subclasses, hardware transports and sensor calibration remain unsupported.

The simulator-specific helpers (`org.firstinspires.ftc.sim.*` and the `*ForSimulator` methods on
`LinearOpMode`) are runner hooks, not FTC SDK API claims.
