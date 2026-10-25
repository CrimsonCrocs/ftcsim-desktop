package org.firstinspires.ftc.sim;

import org.firstinspires.ftc.robotcore.external.navigation.AngleUnit;
import org.firstinspires.ftc.robotcore.external.navigation.YawPitchRollAngles;

import java.util.Locale;

/** Checks the SDK's locale-independent, degree-formatted orientation string. */
public final class YawPitchRollAnglesContractSmokeTest {
    public static void main(String[] args) {
        Locale original = Locale.getDefault();
        try {
            Locale.setDefault(Locale.GERMANY);
            YawPitchRollAngles angles = new YawPitchRollAngles(
                    AngleUnit.RADIANS, Math.PI / 3.0, -Math.PI / 6.0, Math.PI, 42L);
            require("{yaw=60.000, pitch=-30.000, roll=-180.000}".equals(angles.toString()),
                    "orientation string should use US decimal formatting in degrees");
        } finally {
            Locale.setDefault(original);
        }
        System.out.println("yaw-pitch-roll string contract tests passed");
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }
}
