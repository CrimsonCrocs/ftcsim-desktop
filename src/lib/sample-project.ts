import type { ProjectNode } from "./studio-types";

export const SAMPLE_FILES: Record<string, string> = {
  "settings.gradle": `rootProject.name = 'FTC_STUDIO_SAMPLE'

include ':FtcRobotController'
include ':TeamCode'
`,
  "build.gradle": `buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath "com.android.tools.build:gradle:\${androidGradlePluginVersion}"
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register('clean', Delete) {
    delete rootProject.layout.buildDirectory
}
`,
  "build.common.gradle": `apply plugin: 'com.android.application'

def androidCompileSdk = providers.gradleProperty('androidCompileSdk').get().toInteger()
def androidMinSdk = providers.gradleProperty('androidMinSdk').get().toInteger()
def androidTargetSdk = providers.gradleProperty('androidTargetSdk').get().toInteger()
def ftcAppVersionCode = providers.gradleProperty('ftcAppVersionCode').get().toInteger()
def ftcAppVersionName = providers.gradleProperty('ftcAppVersionName').get()

android {
    compileSdkVersion androidCompileSdk
    ndkVersion '21.3.6528147'

    defaultConfig {
        applicationId 'com.qualcomm.ftcrobotcontroller'
        minSdkVersion androidMinSdk
        targetSdkVersion androidTargetSdk
        versionCode ftcAppVersionCode
        versionName ftcAppVersionName
    }

    buildTypes {
        debug {
            debuggable true
            jniDebuggable true
            ndk {
                abiFilters 'armeabi-v7a', 'arm64-v8a'
            }
        }
        release {
            minifyEnabled false
            ndk {
                abiFilters 'armeabi-v7a', 'arm64-v8a'
            }
        }
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    packagingOptions {
        pickFirst '**/*.so'
    }
}
`,
  "build.dependencies.gradle": `def ftcSdkVersion = providers.gradleProperty('ftcSdkVersion').get()
def appCompatVersion = providers.gradleProperty('androidxAppCompatVersion').get()

dependencies {
    implementation "org.firstinspires.ftc:Inspection:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:Blocks:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:RobotCore:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:RobotServer:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:OnBotJava:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:Hardware:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:FtcCommon:\${ftcSdkVersion}"
    implementation "org.firstinspires.ftc:Vision:\${ftcSdkVersion}"
    implementation "androidx.appcompat:appcompat:\${appCompatVersion}"
}
`,
  "gradle.properties": `# Pinned toolchain and FTC dependency versions.
androidGradlePluginVersion=8.7.0
ftcSdkVersion=11.1.0
androidxAppCompatVersion=1.2.0

# Android versions supported by the FTC Robot Controller SDK.
androidCompileSdk=30
androidMinSdk=24
androidTargetSdk=28
ftcAppVersionCode=61
ftcAppVersionName=11.1

# Reproducible, conservative defaults for local and CI builds.
org.gradle.jvmargs=-Xmx2048M -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
android.useAndroidX=true
android.enableJetifier=false
android.nonTransitiveRClass=false
`,
  "TeamCode/build.gradle": `apply from: '../build.common.gradle'
apply from: '../build.dependencies.gradle'

android {
    namespace = 'org.firstinspires.ftc.teamcode'

    packagingOptions {
        jniLibs.useLegacyPackaging true
    }
}

dependencies {
    implementation project(':FtcRobotController')
}
`,
  "TeamCode/src/main/AndroidManifest.xml": `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application />
</manifest>
`,
  "FtcRobotController/build.gradle": `import java.text.SimpleDateFormat

apply plugin: 'com.android.library'

def androidCompileSdk = providers.gradleProperty('androidCompileSdk').get().toInteger()
def androidMinSdk = providers.gradleProperty('androidMinSdk').get().toInteger()
def androidTargetSdk = providers.gradleProperty('androidTargetSdk').get().toInteger()

android {
    namespace = 'com.qualcomm.ftcrobotcontroller'
    compileSdkVersion androidCompileSdk

    defaultConfig {
        minSdkVersion androidMinSdk
        targetSdkVersion androidTargetSdk
        buildConfigField 'String', 'APP_BUILD_TIME', '"' +
            new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.ROOT).format(new Date()) + '"'
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }
}

apply from: '../build.dependencies.gradle'
`,
  "gradle/wrapper/gradle-wrapper.properties": `distributionBase=GRADLE_USER_HOME
distributionPath=wrapper/dists
distributionUrl=https\\://services.gradle.org/distributions/gradle-8.9-bin.zip
distributionSha256Sum=d725d707bfabd4dfdc958c624003b3c80accc03f7037b5122c4b1d0ef15cecab
networkTimeout=10000
validateDistributionUrl=true
zipStoreBase=GRADLE_USER_HOME
zipStorePath=wrapper/dists
`,
  "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RobotDrive.java": `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.util.ElapsedTime;

@TeleOp(name = "Robot Drive", group = "FTC Simulator")
public class RobotDrive extends LinearOpMode {
    private final ElapsedTime runtime = new ElapsedTime();
    private DcMotor frontLeft;
    private DcMotor frontRight;
    private DcMotor backLeft;
    private DcMotor backRight;

    @Override
    public void runOpMode() {
        frontLeft = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft = hardwareMap.get(DcMotor.class, "backLeft");
        backRight = hardwareMap.get(DcMotor.class, "backRight");

        frontRight.setDirection(DcMotor.Direction.REVERSE);
        backRight.setDirection(DcMotor.Direction.REVERSE);

        telemetry.addData("Status", "Initialized");
        telemetry.update();
        waitForStart();
        runtime.reset();

        while (opModeIsActive()) {
            double drive = -gamepad1.left_stick_y;
            double strafe = gamepad1.left_stick_x;
            double turn = gamepad1.right_stick_x;

            double denominator = Math.max(
                Math.abs(drive) + Math.abs(strafe) + Math.abs(turn), 1.0
            );

            frontLeft.setPower((drive + strafe + turn) / denominator);
            backLeft.setPower((drive - strafe + turn) / denominator);
            frontRight.setPower((drive - strafe - turn) / denominator);
            backRight.setPower((drive + strafe - turn) / denominator);

            telemetry.addData("Run Time", runtime.toString());
            telemetry.addData("Motors", "left %.2f / right %.2f",
                frontLeft.getPower(), frontRight.getPower());
            telemetry.update();
        }
    }
}
`,
  "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/AutoSquare.java": `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

@Autonomous(name = "Auto Square")
public class AutoSquare extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
        DcMotor left = hardwareMap.get(DcMotor.class, "frontLeft");
        DcMotor right = hardwareMap.get(DcMotor.class, "frontRight");

        waitForStart();
        for (int side = 0; side < 4 && opModeIsActive(); side++) {
            left.setPower(0.65);
            right.setPower(0.65);
            sleep(900);
            left.setPower(0.55);
            right.setPower(-0.55);
            sleep(520);
        }
        left.setPower(0);
        right.setPower(0);
    }
}
`,
  "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RobotHardware.java": `package org.firstinspires.ftc.teamcode;

import com.qualcomm.robotcore.hardware.DcMotor;
import com.qualcomm.robotcore.hardware.HardwareMap;

public final class RobotHardware {
    public DcMotor frontLeft;
    public DcMotor frontRight;
    public DcMotor backLeft;
    public DcMotor backRight;

    public void init(HardwareMap hardwareMap) {
        frontLeft = hardwareMap.get(DcMotor.class, "frontLeft");
        frontRight = hardwareMap.get(DcMotor.class, "frontRight");
        backLeft = hardwareMap.get(DcMotor.class, "backLeft");
        backRight = hardwareMap.get(DcMotor.class, "backRight");
    }
}
`,
  "README.md": `# FTC Simulator sample workspace

This project targets the FTC SDK 11.1 public API surface. The current emulator
implements the core OpMode lifecycle, motors, servos, gamepad state, hardware
mapping, and telemetry. Android services, camera pipelines, USB devices, and
vendor-native drivers are intentionally reported as unsupported.
`,
};

export const DEFAULT_FILE = "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RobotDrive.java";

export const PROJECT_TREE: ProjectNode[] = [
  {
    name: "FTC_STUDIO_SAMPLE",
    kind: "folder",
    children: [
      { name: ".github", kind: "folder", children: [] },
      { name: ".gradle", kind: "folder", children: [] },
      { name: ".idea", kind: "folder", children: [] },
      {
        name: "FtcRobotController",
        kind: "folder",
        children: [
          { name: "build.gradle", kind: "file", path: "FtcRobotController/build.gradle", tone: "config" },
        ],
      },
      {
        name: "gradle",
        kind: "folder",
        children: [
          {
            name: "wrapper",
            kind: "folder",
            children: [
              {
                name: "gradle-wrapper.properties",
                kind: "file",
                path: "gradle/wrapper/gradle-wrapper.properties",
                tone: "config",
              },
            ],
          },
        ],
      },
      {
        name: "TeamCode",
        kind: "folder",
        children: [
          {
            name: "src",
            kind: "folder",
            children: [
              {
                name: "main",
                kind: "folder",
                children: [
                  { name: "AndroidManifest.xml", kind: "file", path: "TeamCode/src/main/AndroidManifest.xml", tone: "config" },
                  {
                    name: "java",
                    kind: "folder",
                    tone: "source",
                    children: [
                      {
                        name: "org.firstinspires.ftc.teamcode",
                        kind: "folder",
                        children: [
                          { name: "RobotDrive.java", kind: "file", path: "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RobotDrive.java", tone: "source" },
                          { name: "AutoSquare.java", kind: "file", path: "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/AutoSquare.java", tone: "source" },
                          { name: "RobotHardware.java", kind: "file", path: "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/RobotHardware.java", tone: "source" },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          { name: "build.gradle", kind: "file", path: "TeamCode/build.gradle", tone: "config" },
        ],
      },
      { name: "build.gradle", kind: "file", path: "build.gradle", tone: "config" },
      { name: "build.common.gradle", kind: "file", path: "build.common.gradle", tone: "config" },
      { name: "build.dependencies.gradle", kind: "file", path: "build.dependencies.gradle", tone: "config" },
      { name: "gradle.properties", kind: "file", path: "gradle.properties", tone: "config" },
      { name: "README.md", kind: "file", path: "README.md", tone: "source" },
      { name: "settings.gradle", kind: "file", path: "settings.gradle", tone: "config" },
      { name: "External Libraries", kind: "folder", children: [] },
      { name: "Scratches and Consoles", kind: "folder", children: [] },
    ],
  },
];
