package org.firstinspires.ftc.teamcode

import com.pedropathing.api.Paths
import com.pedropathing.api.PoseFactory
import com.pedropathing.controllers.Controller
import com.pedropathing.follower.Follower
import com.pedropathing.math.Matrix
import com.pedropathing.math.Pose
import com.qualcomm.robotcore.eventloop.opmode.Autonomous
import com.qualcomm.robotcore.hardware.DcMotor
import com.qualcomm.robotcore.hardware.DcMotorEx
import com.qualcomm.robotcore.hardware.DigitalChannel
import com.qualcomm.robotcore.hardware.Servo
import com.qualcomm.robotcore.util.ElapsedTime
import dev.nextftc.core.commands.Command
import dev.nextftc.ftc.NextFTCOpMode
import org.firstinspires.ftc.robotcore.external.hardware.camera.WebcamName
import org.firstinspires.ftc.teamcode.pedro.Constants
import org.firstinspires.ftc.vision.VisionPortal
import org.firstinspires.ftc.vision.apriltag.AprilTagProcessor
import kotlin.math.*

/** Four-tip rehearsal route for the unchanged Red/Near pollen-only robot. */
@Autonomous(name = "Red Pollen — Tips + Park", group = "BIOBUZZ")
class RedPollenAuto : NextFTCOpMode() {
    companion object {
        private const val INCH = 0.0254
        private const val FLYWHEEL_FRACTION = 0.391
        private const val HOOD_RADIANS = 1.29
        private const val SECOND_FRACTION = 0.344
        private const val SECOND_HOOD = 1.309

        private val poses = PoseFactory.radians()

        private fun pose(x: Double, z: Double, heading: Double): Pose =
            poses.of(x / INCH, -z / INCH, heading)

        private val START = pose(-1.5761196, 1.02, 0.0)
        private val SHOOT = pose(-1.5100796, 1.02, 0.0)
        private val GARDEN_APPROACH = pose(-1.30, 1.25, -PI / 2)
        // Leave the wall-side garden pollen: one starting pollen may remain aboard.
        private val GARDEN = pose(-1.49, 1.475, -PI / 2)
        private val GARDEN_RETURN = pose(-1.49, 1.475, PI / 2)
        private val MOUTH = pose(-1.075, -1.40, -PI / 2)
        private val UNDER_POS = pose(-1.20, 1.05, PI)
        private val UNDER_NEG = pose(-1.05, -1.05, -PI / 2)
        private val CATCH_POS = pose(-0.220, 1.50, PI / 2)
        private val SCOOP_POS = pose(-0.220, 0.99, PI / 2)
        private val BANK_POS = pose(-1.05, 1.15, PI / 2)
        private val HOME = pose(-1.40, -0.75, 0.0)
        private val FLOWER_RETURN = pose(-1.075, -1.40, PI)
    }

    private lateinit var follower: Follower
    private lateinit var intake: DcMotorEx
    private lateinit var feeder: DcMotorEx
    private lateinit var flywheel: DcMotorEx
    private lateinit var hood: Servo
    private lateinit var gate: Servo
    private lateinit var release: Servo
    private lateinit var turret: Servo
    private lateinit var beam: DigitalChannel
    private lateinit var tags: AprilTagProcessor
    private var portal: VisionPortal? = null
    private var routine: AutoRoutine? = null

    private val initialTags = mutableMapOf<Int, DoubleArray>()
    private val clock = ElapsedTime()
    private var hiveNormal: DoubleArray? = null
    private var hiveFlipped = false
    private var hiveMoving = false
    private var visionAngle = 0.0
    private var observedTips = 0
    private var phase = "READY — RED / NEAR"

    override fun onInit() {
        follower = Constants.create(hardwareMap)
        follower.setPose(START)
        intake = hardwareMap.get(DcMotorEx::class.java, "intake")
        flywheel = hardwareMap.get(DcMotorEx::class.java, "flywheel")
        feeder = hardwareMap.get(DcMotorEx::class.java, "feeder")
        turret = hardwareMap.get(Servo::class.java, "turret")
        hood = hardwareMap.get(Servo::class.java, "hood")
        gate = hardwareMap.get(Servo::class.java, "gate")
        release = hardwareMap.get(Servo::class.java, "release")
        beam = hardwareMap.get(DigitalChannel::class.java, "beam_break")
        beam.mode = DigitalChannel.Mode.INPUT

        for (motor in arrayOf(intake, flywheel, feeder)) {
            motor.zeroPowerBehavior = DcMotor.ZeroPowerBehavior.BRAKE
            motor.mode = DcMotor.RunMode.RUN_WITHOUT_ENCODER
            motor.power = 0.0
        }

        flywheel.mode = DcMotor.RunMode.RUN_WITHOUT_ENCODER
        gate.position = 0.0
        release.position = 0.0
        hood.position = (HOOD_RADIANS - PI / 12) / (PI / 3)
        tags = AprilTagProcessor.easyCreateWithDefaults()
        portal = VisionPortal.Builder()
            .setCamera(hardwareMap.get(WebcamName::class.java, "Webcam 1"))
            .addProcessor(tags)
            .build()
        telemetry.msTransmissionInterval = 0

        // Prepare Pedro during INIT, then return motor demand to zero.
        follower.update()
        follower.follow(Paths.line(START, SHOOT).linear(START, SHOOT))
        follower.stop()
        routine = AutoRoutine()
    }

    override fun onWaitForStart() {
        telemetry.addData("Setup", "BIOBUZZ • RED • NEAR • four starting pollen")
        telemetry.addData("Libraries", "NextFTC 1.1.0 / Pedro 3.0.2")
        telemetry.update()
        waitForStart()
    }

    override fun onStartButtonPressed() {
        clock.reset()
        routine?.schedule()
    }

    override fun onUpdate() {
        follower.update()
        updateHiveVision()
        telemetry.addData("Phase", phase)
        telemetry.addData("Auto seconds", clock.seconds())
        telemetry.addData("Remaining", max(0.0, 30 - clock.seconds()))
        telemetry.addData("Pedro X", follower.pose().x())
        telemetry.addData("Pedro Y", follower.pose().y())
        telemetry.addData("Pedro heading", Math.toDegrees(follower.pose().heading()))
        telemetry.addData("Flywheel ticks/s", flywheel.velocity)
        telemetry.addData("Throat beam", !beam.state)
        telemetry.addData("Hive tags", initialTags.size)
        telemetry.addData("Hive flipped", hiveFlipped)
        telemetry.addData("Hive angle", visionAngle)
        telemetry.addData("Observed tips", observedTips)
        telemetry.addData("Shots this volley", routine?.fired ?: 0)
        telemetry.update()
        idle()
    }

    private fun rotation(pitch: Double, roll: Double, yaw: Double): DoubleArray {
        val x = Math.toRadians(pitch)
        val y = Math.toRadians(roll)
        val z = Math.toRadians(yaw)
        val a = cos(x)
        val b = sin(x)
        val c = cos(y)
        val d = sin(y)
        val e = cos(z)
        val f = sin(z)
        return doubleArrayOf(
            e * c, e * d * b - f * a, e * d * a + f * b,
            f * c, f * d * b + e * a, f * d * a - e * b,
            -d, c * b, c * a,
        )
    }

    private fun multiply(a: DoubleArray, b: DoubleArray): DoubleArray {
        val result = DoubleArray(9)
        for (i in 0..2) {
            for (j in 0..2) {
                for (k in 0..2) {
                    result[3 * i + j] += a[3 * i + k] * b[3 * k + j]
                }
            }
        }
        return result
    }

    private fun updateHiveVision() {
        val extrinsic = rotation(30.0, 0.0, Math.toDegrees(follower.pose().heading()))
        for (tag in tags.freshDetections) {
            val tagPose = tag.ftcPose ?: continue
            if (tag.id < 30 || tag.id > 37) continue
            val current = multiply(extrinsic, rotation(tagPose.pitch, tagPose.roll, tagPose.yaw))
            val normal = doubleArrayOf(current[1], current[4], current[7])
            if (clock.seconds() < 2) {
                initialTags[tag.id] = current
                hiveNormal = normal
                continue
            }

            val initial = hiveNormal ?: continue
            var dot = 0.0
            var a = 0.0
            var b = 0.0
            for (i in 0..2) {
                dot += initial[i] * normal[i]
                a += initial[i] * initial[i]
                b += normal[i] * normal[i]
            }
            val angle = Math.toDegrees(acos(max(-1.0, min(1.0, dot / sqrt(a * b)))))
            visionAngle = angle
            hiveMoving = angle > 8 && angle < 55
            if ((angle >= 55 && !hiveFlipped) || (angle <= 8 && hiveFlipped)) {
                hiveFlipped = !hiveFlipped
                observedTips++
            }
        }
    }

    private fun aim() {
        val route = routine
        val position = follower.pose()
        val x = position.x() - 0.15 / INCH * cos(position.heading())
        val y = position.y() - 0.15 / INCH * sin(position.heading())

        if (route != null && route.stage >= 30 && route.stage < 50) {
            var targetY = (if (route.stage < 40) 0.38 else -0.411) / INCH
            var targetX = -0.3236377 / INCH
            if (route.stage == 33 || route.stage == 43) {
                val velocity = follower.velocity()
                val vx = velocity.vx + 0.15 / INCH * velocity.omega * sin(position.heading())
                val vy = velocity.vy - 0.15 / INCH * velocity.omega * cos(position.heading())
                targetX -= vx * 1.18
                targetY -= vy * 1.18
            }

            var angle = atan2(targetY - y, targetX - x) - position.heading()
            angle = atan2(sin(angle), cos(angle))
            turret.position = (angle + PI) / (2 * PI)
            val hoodAngle = SECOND_HOOD - if (route.fired >= 3) {
                if (route.stage == 33) 0.004 else 0.006
            } else 0.0
            hood.position = (hoodAngle - PI / 12) / (PI / 3)
            return
        }

        val third = route != null && (route.stage == 12 || route.stage == 16)
        val second = route != null && (route.stage == 4 || route.stage == 8) ||
            hiveFlipped && !third
        val targetY = (if (third) -0.38 else if (second) 0.38 else -0.2689242) / INCH
        var angle = atan2(targetY - y, -0.3236377 / INCH - x) - position.heading() -
            if (second || third) 0.0 else 0.04
        angle = atan2(sin(angle), cos(angle))
        turret.position = (angle + PI) / (2 * PI)

        var hoodAngle = if (second || third) SECOND_HOOD else HOOD_RADIANS
        if (route != null && route.fired >= 3 &&
            (route.stage == 8 || route.stage == 16 || route.stage >= 30 && route.stage < 50)
        ) {
            hoodAngle -= 0.006
        }
        hood.position = (hoodAngle - PI / 12) / (PI / 3)
    }

    private fun spin() {
        val target = targetSpeed()
        val stage = routine?.stage
        val shooting = stage != null && (stage == 8 || stage == 16 || stage >= 30 && stage < 50)
        val gain = if (shooting) 0.03 else 0.004
        flywheel.power = max(
            -1.0,
            min(1.0, target / (312.0 / 60 * 537.7) + gain * (target - flywheel.velocity)),
        )
    }

    private fun targetSpeed(): Double {
        val route = routine
        if (route != null) {
            val stage = route.stage
            if (stage >= 50) return 0.0
            if (stage >= 30 && stage < 50) {
                var fraction = if (stage < 40) 0.467 else 0.469
                if (stage == 33) {
                    val position = follower.pose()
                    val velocity = follower.velocity()
                    val x = position.x() * INCH - 0.15 * cos(position.heading())
                    val y = position.y() * INCH - 0.15 * sin(position.heading())
                    val vx = velocity.vx * INCH + 0.15 * velocity.omega * sin(position.heading())
                    val vy = velocity.vy * INCH - 0.15 * velocity.omega * cos(position.heading())
                    val targetX = -0.3236377 - vx * 1.18
                    val targetY = (if (stage < 40) 0.38 else -0.411) - vy * 1.18
                    val nominal = if (stage < 40) {
                        hypot(1.05 - 0.3236377, 1.30 + 0.38)
                    } else {
                        hypot(1.05 - 0.3236377, 1.30 + 0.411)
                    }
                    fraction += (hypot(targetX - x, targetY - y) - nominal) / 9.0
                }
                return max(0.35, min(0.60, fraction)) * 312 / 60 * 537.7
            }

            val feederMoving = abs(feeder.velocity) > 5
            val age = clock.seconds() - route.stageSince
            if (stage == 3 && age > 0.8 && abs(feeder.velocity) < 5) return 0.522 * 312 / 60 * 537.7
            if (stage == 20 && age > 0.4 && abs(feeder.velocity) < 5) return 0.494 * 312 / 60 * 537.7
            if (stage == 2 || stage == 3 || stage == 10 || stage == 20 ||
                stage == 4 && feederMoving || stage == 12 && feederMoving
            ) return 0.0
            if (stage == 12 || stage == 16) return 0.494 * 312 / 60 * 537.7
            if (stage == 4 || stage == 8) return 0.522 * 312 / 60 * 537.7
        }
        return (if (hiveFlipped) SECOND_FRACTION else FLYWHEEL_FRACTION) * 312 / 60 * 537.7
    }

    private fun neutral() {
        follower.stop()
        intake.power = 0.0
        feeder.power = 0.0
        flywheel.power = 0.0
    }

    override fun onStop() {
        try {
            neutral()
        } finally {
            portal?.close()
        }
    }

    private inner class AutoRoutine : Command() {
        var stage = 0
            private set
        var fired = 0
            private set
        var stageSince = 0.0
            private set

        private var done = false
        private var sawBeam = false
        private var volleyReady = false
        private var nextFeed = 0.0
        private var lastShotTime = 0.0
        private var previousVolleyShot = 0.0
        private var receiveSince = -1.0
        private var arrivedSince = -1.0
        private var destination: Pose? = null

        override val isDone: Boolean
            get() = done

        private fun drive(target: Pose) {
            destination = target
            arrivedSince = -1.0
            val from = follower.pose()
            val config = Constants.pathConfig
            var path = Paths.line(from, target).linear(from, target)

            if (target === CATCH_POS && -from.y() * INCH < 0) {
                path = Paths.curve(
                    from,
                    pose(-0.95, -0.80, 0.0),
                    pose(-1.40, 1.55, 0.0),
                    target,
                ).constant(target)
            }
            if (target === GARDEN_RETURN) {
                path = path.with(config.headingFeedback.at(Controller.pid(4.0, 0.0, 0.12)))
            }
            if (target === MOUTH || target === UNDER_POS || target === UNDER_NEG ||
                target === CATCH_POS || target === SCOOP_POS || target === BANK_POS
            ) {
                val derivative = if (target === BANK_POS) 0.025 else if (target === MOUTH) 0.006 else 0.012
                val maxVelocity = if (target === BANK_POS || target === MOUTH) 42.0 else 55.0
                path = path.with(
                    config.headingFeedback.at(Controller.pid(4.0, 0.0, 0.12)),
                    config.forwardTranslational.at(Controller.pid(0.12, 0.0, derivative)),
                    config.strafeTranslational.at(Controller.pid(0.12, 0.0, derivative)),
                    config.maxVelocityConstraint.at(maxVelocity),
                )
            }
            if (target === SCOOP_POS) {
                path = path.with(
                    config.maxVelocityConstraint.at(18.0),
                    config.coast.at(Controller.proportionalFeedforward(1.0 / 55)),
                    config.brake.at(Controller.proportionalFeedforward(0.025)),
                    config.linearBrakeCoefficients.at(Matrix.diag(0.12, 0.12)),
                    config.maxBrakingPower.at(0.6),
                )
            }
            if (target === CATCH_POS || target === BANK_POS) {
                path = path.with(
                    config.coast.at(Controller.proportionalFeedforward(1.0 / 55)),
                    config.brake.at(Controller.proportionalFeedforward(0.025)),
                    config.linearBrakeCoefficients.at(Matrix.diag(0.12, 0.12)),
                    config.maxBrakingPower.at(0.6),
                )
            }
            follower.follow(path)
        }

        private fun arrived(): Boolean {
            val target = destination ?: return false
            if (follower.isBusy && target !== GARDEN_RETURN && target !== MOUTH &&
                target !== UNDER_POS && target !== UNDER_NEG && target !== CATCH_POS &&
                target !== BANK_POS
            ) {
                arrivedSince = -1.0
                return false
            }

            val position = follower.pose()
            val headingError = atan2(
                sin(position.heading() - target.heading()),
                cos(position.heading() - target.heading()),
            )
            val slowApproach = target === GARDEN_RETURN || target === MOUTH || stage >= 30
            if (hypot(position.x() - target.x(), position.y() - target.y()) > 1.0 ||
                abs(headingError) > 0.06 || slowApproach &&
                (follower.velocity().linSpeed() > 4 || abs(follower.velocity().omega) > 0.2)
            ) {
                arrivedSince = -1.0
                return false
            }

            if (arrivedSince < 0) arrivedSince = clock.seconds()
            return clock.seconds() - arrivedSince > 0.08
        }

        private fun passed(radius: Double): Boolean {
            val target = destination ?: return false
            val position = follower.pose()
            val headingError = atan2(
                sin(position.heading() - target.heading()),
                cos(position.heading() - target.heading()),
            )
            return hypot(position.x() - target.x(), position.y() - target.y()) < radius / INCH &&
                abs(headingError) < 0.15
        }

        private fun enter(next: Int) {
            stage = next
            stageSince = clock.seconds()
            if (next == 2 || next == 10) receiveSince = -1.0
        }

        private fun volley(next: Int) {
            volleyReady = false
            enter(next)
            fired = 0
            sawBeam = false
            nextFeed = clock.seconds()
        }

        override fun start() {
            drive(SHOOT)
            enter(0)
        }

        private fun shoot() {
            aim()
            intake.power = 0.8
            val target = targetSpeed()
            spin()
            if (target < 1) {
                feeder.power = 0.0
                return
            }

            if (!beam.state) {
                sawBeam = true
            } else if (sawBeam) {
                fired++
                lastShotTime = clock.seconds()
                sawBeam = false
            }

            val ready = flywheel.velocity >= 0.985 * target
            if (ready) volleyReady = true
            val feedReady = if (stage == 0) ready else volleyReady
            val movingShot = (stage == 8 || stage == 16 || stage == 33) && clock.seconds() > 7.2
            feeder.power = if (feedReady && (!hiveMoving || movingShot)) 1.0 else 0.0
        }

        private fun home() {
            feeder.power = 0.0
            intake.power = 0.0
            if (follower.pose().y() < 0) {
                drive(UNDER_POS)
                enter(60)
            } else {
                drive(HOME)
                enter(50)
            }
        }

        override fun update() {
            val time = clock.seconds()
            val age = time - stageSince
            if (time >= 29.9) {
                phase = "TIME LIMIT — MOTORS OFF"
                neutral()
                done = true
                return
            }
            if (time >= 28.0 && stage >= 30 && stage < 40) home()
            if (time >= 29.0 && stage < 50) home()
            spin()
            aim()
            if (stage != 0 && stage != 8 && stage != 16 && stage != 33 && stage != 43) {
                feeder.power = 0.0
            }

            val receiving = stage == 2 || stage == 3 || stage == 10 || stage == 11 ||
                stage == 20 || stage == 21
            if (receiving && abs(flywheel.velocity) < 100) {
                if (!beam.state && receiveSince < 0) receiveSince = time
                feeder.power = if (receiveSince < 0 || time - receiveSince < 0.3) 0.35 else 0.0
            }

            when (stage) {
                0 -> {
                    phase = "OPENING THREE POLLEN"
                    if (time < 1.2) {
                        intake.power = 0.8
                        feeder.power = 0.0
                    } else if (fired < 3) {
                        shoot()
                    } else {
                        feeder.power = 0.0
                    }
                    if (fired >= 3 && time > 3.15) {
                        feeder.power = 0.0
                        drive(GARDEN_APPROACH)
                        enter(1)
                    }
                }
                1 -> {
                    phase = "EARLY GARDEN APPROACH"
                    intake.power = 0.8
                    if (arrived()) {
                        drive(GARDEN)
                        enter(2)
                    }
                }
                2 -> {
                    phase = "GARDEN PICKUP"
                    intake.power = 0.8
                    if (arrived()) enter(3)
                }
                3 -> {
                    phase = "DRAW GARDEN POLLEN INTO HOPPER"
                    intake.power = 0.8
                    if (age > 1.3) {
                        intake.power = 0.0
                        drive(GARDEN_RETURN)
                        enter(4)
                    }
                }
                4 -> {
                    phase = "FACE THE FAR CELL"
                    intake.power = 0.0
                    if (arrived()) volley(8)
                }
                8 -> {
                    phase = "GARDEN BANK ACROSS HIVE"
                    if (time > 7.2) shoot() else feeder.power = 0.0
                    if (age > 4.5 || age > 1.6 && volleyReady && fired > 0 && time - lastShotTime > 0.6) {
                        feeder.power = 0.0
                        intake.power = 0.0
                        drive(FLOWER_RETURN)
                        enter(10)
                    }
                }
                10 -> {
                    phase = "DIRECT CROSS TO PARTNER POLLEN"
                    intake.power = 0.8
                    if (arrived()) enter(20)
                }
                20 -> {
                    phase = "STOW FOUR IN THE LOWER CHANNEL"
                    intake.power = 0.8
                    feeder.power = if (age < 0.2) 0.35 else 0.0
                    if (age > 0.8) {
                        drive(MOUTH)
                        enter(12)
                    }
                }
                12 -> {
                    phase = "PRE-FEED AS THIRD TURN FINISHES"
                    intake.power = 0.8
                    val error = follower.pose().heading() - MOUTH.heading()
                    val thirdError = atan2(sin(error), cos(error))
                    if (abs(thirdError) < 0.45 && follower.velocity().linSpeed() < 2) volley(16)
                }
                16 -> {
                    phase = "THIRD TIP — PARTNER POLLEN"
                    shoot()
                    if (fired >= 4 && time - lastShotTime > 0.18) {
                        previousVolleyShot = lastShotTime
                        feeder.power = 0.0
                        intake.power = 0.0
                        drive(CATCH_POS)
                        enter(31)
                    } else if (age > 4.5) home()
                }
                31 -> {
                    phase = "WAIT OUTSIDE POSITIVE LANDING"
                    intake.power = 0.8
                    if (passed(0.10) && time - previousVolleyShot > 3.25) {
                        drive(SCOOP_POS)
                        enter(32)
                    }
                }
                32 -> {
                    phase = "SCOOP POSITIVE POLLEN AFTER BOUNCE"
                    intake.power = 1.0
                    feeder.power = 0.0
                    if (passed(0.05)) {
                        if (arrivedSince < 0) arrivedSince = time
                        if (time - arrivedSince > 0.18) {
                            drive(BANK_POS)
                            enter(34)
                        }
                    }
                }
                34 -> {
                    phase = "PRE-FEED FOURTH BANK"
                    intake.power = 0.8
                    if (arrived()) volley(33)
                }
                33 -> {
                    phase = "FOURTH TIP — RECYCLED POLLEN"
                    shoot()
                    if (fired >= 4 && time - lastShotTime > 0.08 ||
                        fired >= 3 && time - lastShotTime > 0.5
                    ) {
                        previousVolleyShot = lastShotTime
                        home()
                    } else if (age > 4.5) home()
                }
                60 -> {
                    phase = "SAFE PARK — CLEAR THE HIVE"
                    intake.power = 0.0
                    feeder.power = 0.0
                    flywheel.power = 0.0
                    if (passed(0.12)) {
                        drive(UNDER_NEG)
                        enter(61)
                    }
                }
                61 -> {
                    phase = "SAFE PARK — LEFT LANE"
                    intake.power = 0.0
                    feeder.power = 0.0
                    flywheel.power = 0.0
                    if (passed(0.12)) {
                        drive(HOME)
                        enter(50)
                    }
                }
                50 -> {
                    phase = "PEDRO PARK"
                    intake.power = 0.0
                    feeder.power = 0.0
                    flywheel.power = 0.0
                    if (arrived()) {
                        phase = "PARKED — MOTORS OFF"
                        neutral()
                        done = true
                    }
                }
            }
        }

        override fun stop(interrupted: Boolean) {
            neutral()
        }
    }
}
