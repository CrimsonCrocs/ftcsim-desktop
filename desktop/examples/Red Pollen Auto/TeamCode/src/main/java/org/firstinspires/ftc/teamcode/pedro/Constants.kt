package org.firstinspires.ftc.teamcode.pedro

import com.pedropathing.algorithm.Foresight
import com.pedropathing.algorithm.ForesightConfig
import com.pedropathing.controllers.Controller
import com.pedropathing.follower.Follower
import com.pedropathing.math.Matrix
import com.pedropathing.math.Vector2D
import com.pedropathing.revhub.drivetrains.Mecanum
import com.pedropathing.revhub.drivetrains.MecanumConfig
import com.pedropathing.revhub.localizers.PinpointConfig
import com.pedropathing.revhub.localizers.PinpointLocalizer
import com.qualcomm.hardware.gobilda.GoBildaPinpointDriver
import com.qualcomm.robotcore.hardware.DcMotorSimple
import com.qualcomm.robotcore.hardware.HardwareMap

object Constants {
    lateinit var pathConfig: ForesightConfig
        private set

    fun create(hardwareMap: HardwareMap): Follower {
        val localizer = PinpointConfig { config ->
            config.name.set("odo")
            config.xPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD)
            config.yPodDirection.set(GoBildaPinpointDriver.EncoderDirection.FORWARD)
            config.xPodOffset.set(0.0)
            config.yPodOffset.set(0.0)
        }

        val drive = MecanumConfig { config ->
            config.frontLeftName.set("front_left_drive")
            config.frontRightName.set("front_right_drive")
            config.backLeftName.set("back_left_drive")
            config.backRightName.set("back_right_drive")
            config.frontLeftDirection.set(DcMotorSimple.Direction.FORWARD)
            config.frontRightDirection.set(DcMotorSimple.Direction.REVERSE)
            config.backLeftDirection.set(DcMotorSimple.Direction.FORWARD)
            config.backRightDirection.set(DcMotorSimple.Direction.REVERSE)
        }

        val algorithm = ForesightConfig { config ->
            config.maxVelocityConstraint.set(32.0)
            config.headingFeedback.set(Controller.pid(2.0, 0.0, 0.0))
            config.forwardTranslational.set(Controller.pid(0.12, 0.0, 0.0))
            config.strafeTranslational.set(Controller.pid(0.12, 0.0, 0.0))

            // Long transfers coast into endpoint feedback. Pickup legs override this profile.
            config.brake.set(Controller.proportionalFeedforward(0.0))
            config.coast.set(Controller.proportionalFeedforward(0.05))
            config.linearBrakeCoefficients.set(Matrix.diag(0.05, 0.05))
            config.quadraticBrakeCoefficients.set(Matrix.zero(2))
            config.headingBrakeCoefficients.set(Vector2D.cartesian(0.05, 0.0))
            config.maxAchievableForwardVelocity.set(55.0)
            config.maxAchievableStrafeVelocity.set(55.0)
            config.naturalForwardDeceleration.set(120.0)
            config.naturalStrafeDeceleration.set(120.0)
        }

        pathConfig = algorithm
        return Follower(
            PinpointLocalizer(hardwareMap, localizer),
            Mecanum(hardwareMap, drive),
            Foresight(algorithm),
        )
    }
}
