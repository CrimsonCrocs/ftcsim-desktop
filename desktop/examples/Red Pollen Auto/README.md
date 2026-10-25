# Red Pollen Auto

A Kotlin red-alliance BIOBUZZ autonomous that uses real NextFTC 1.1.0 and Pedro Pathing core/revhub 3.0.2. The robot collects pollen through a compliant intake. Its shooter and drivetrain are rigid.

The best verified route makes **four red hive tips and parks for 88 points** within 30 simulated seconds. This result uses seed `20261024`, the supplied robot, and three idle robots. Five pollen-only tips with park has not been achieved. The tests do not prove that five is impossible.

## Run it

1. Open this project in FTC Simulator Desktop. Keep its robot configuration and the Red/Near field setup. The four starting pollen begin on the floor beside the robot.
2. Select **Red Pollen — Tips + Park**. Use **Build and Play** for the first run, then **Run** to reuse the loaded build.
3. Use **Evaluate 30 s** for a fast, repeatable trial. For a fresh physics check through MCP, call `evaluate_autonomous` with `{"seed":20261024,"full":true}`.

Telemetry shows the current phase, time, Pedro pose, flywheel speed, throat beam, and hive tag observations. Source edits use the warm compiler after the first build.

## The route

The robot shoots three starting pollen into the first upward cell. It collects three garden pollen and keeps the fourth starting pollen for the next volley. It then crosses to the far partner's four starting pollen and makes the third tip.

For the fourth volley, the robot waits outside the landing area, collects the discharged pollen from the floor, and moves left for a diagonal shot. It follows the outside lane into the red loading area and stops. The route reserves time for park and has a motor cutoff at 29.9 seconds.

Pedro controls each drive path and holds its endpoint. Short pickup and shooting legs use their own speed and braking profile. The throat beam tracks feed events, and the flywheel encoder controls wheel speed. The autonomous uses SDK sensors and known field coordinates; it does not read simulator scores or private game state.

## Robot and libraries

- All hardware names and physical dimensions are in `ftcsim.project.json`.
- The intake uses a compliant roller and backing ramp. The 80 mm storage channel admits 71 mm pollen and excludes 91 mm Nectar.
- The feeder has its own motor. A servo aims the turret, and another servo sets the hood angle. The lift stays stowed.
- `pedro/Constants.kt` configures the mecanum motors and Pinpoint `odo`. Pedro uses inches and radians. `pose()` converts the field's metres and Z axis.
- FTC SDK 11.1.0, NextFTC 1.1.0, Pedro core/revhub 3.0.2, Kotlin tooling 2.2.10, and Gradle 8.9 are pinned. Pedro [core](https://repo.maven.apache.org/maven2/com/pedropathing/core/maven-metadata.xml) and [revhub](https://repo.maven.apache.org/maven2/com/pedropathing/revhub/maven-metadata.xml) 3.0.2 were the latest stable Maven releases checked on 2026-10-25.

`onWaitForStart()` uses the SDK start latch. `onUpdate()` calls `idle()` so the NextFTC program yields to the simulator's control clock. The code compiles against the published libraries.

## Recorded result and limits

[validation.json](validation.json) records the seed, source hashes, score, parking result, element types, peak payload, neutral STOP output, and fresh physics step count. A full check advances all 6,000 physics steps for the 30-second autonomous. The Kotlin version retains the four-tip result of the earlier Java route.

The recorded run collected no Nectar, carried at most four pollen, and ended with neutral motor outputs. It used the original floor start and robot configuration. Other robots were present and idle. A fixed-seed result does not establish performance against moving opponents or across all seeds.

The intake contact model is a reduced pinch model. It is not a deforming mesh or a material model calibrated against a real intake. Physics, drive, and shooter parameters need measured calibration before results can transfer to hardware.
