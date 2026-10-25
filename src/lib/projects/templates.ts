import { SAMPLE_FILES } from "@/lib/sample-project";
import {
  hashBlocksSourceSync,
  markGeneratedBlocksJavaSync,
  opModePaths,
} from "@/lib/blocks/documents";
import {
  createBiobuzzRobotConfiguration,
  createLegacyPhysicalHardware,
  createRobotConfigurationManifest,
  openRobotConfiguration,
  type RobotConfigurationV2,
  type RobotConfigurationV3,
} from "@/lib/robot-configuration";
import type { RobotVariant } from "@/lib/studio-types";
import type { NewProjectInput, StarterTemplateId } from "./types";
import { FTC_SDK_VERSION, KOTLIN_VERSION } from "./types";
import { exampleById } from "./examples";
import { generateOfficialBlocksJava } from "./official-blocks-generator";

type OfficialSources = { java: Record<string, string>; blocks: Record<string, string>; helpers: Record<string, string> };

export type StarterTemplateDescriptor = Readonly<{
  id: StarterTemplateId;
  revision: 1;
  name: string;
  summary: string;
  category: "empty" | "teleop" | "autonomous" | "combined";
  supportedDrivetrains: readonly RobotVariant[];
}>;

export type ProjectTemplate = {
  files: Record<string, string>;
  activeFile: string | null;
  selectedOpMode: string | null;
};

type GeneratedSource = {
  className: string;
  content: string;
  extension?: "java" | "kt";
};

const OFFICIAL_MOTOR_NAMES: Record<string, number> = {
  front_left_drive: 0, left_drive: 0, m1: 0,
  front_right_drive: 1, right_drive: 1, m2: 1,
  back_left_drive: 2, m3: 2,
  back_right_drive: 3, m4: 3,
};

function adaptOfficialJava(source: string, input: NewProjectInput): string {
  let adapted = source.replace(
    /package org\.firstinspires\.ftc\.robotcontroller\.external\.samples(?:\.externalhardware)?;/u,
    `package ${input.javaPackage};`,
  );
  adapted = adapted.replace(/^import com\.qualcomm\.robotcore\.eventloop\.opmode\.Disabled;\n/gmu, "");
  adapted = adapted.replace(/^@Disabled\b[^\n]*$/gmu, "");
  const names = MOTOR_NAMES[input.motorNamingPreset];
  for (const [officialName, index] of Object.entries(OFFICIAL_MOTOR_NAMES)) {
    adapted = adapted.replaceAll(`"${officialName}"`, `"${names[index]}"`);
  }
  // The official REV color/range sample uses one combined device. The starter
  // robot exposes its color and distance channels as separate simulated devices.
  adapted = adapted.replaceAll('hardwareMap.get(DistanceSensor.class, "sensor_color")', 'hardwareMap.get(DistanceSensor.class, "distance")');
  for (const [original, replacement] of Object.entries({
    sensor_color: "color",
    sensor_distance: "distance",
    digitalTouch: "beam_break",
    pinpoint: "odo",
    left_arm: "lift",
    left_hand: "hood",
    right_hand: "release",
    motorTest: "intake",
    servoTest: "gate",
    arm: "lift",
  })) adapted = adapted.replaceAll(`"${original}"`, `"${replacement}"`);
  return adapted;
}

function adaptOfficialBlocks(source: string): string {
  let adapted = source;
  for (const [officialName, index] of Object.entries(OFFICIAL_MOTOR_NAMES).sort((a, b) => b[0].length - a[0].length)) {
    adapted = adapted.replaceAll(`${officialName}AsDcMotor`, `ftcsimMotor${index + 1}AsDcMotor`);
  }
  adapted = adapted.replaceAll("sensor_colorAsDistanceSensor", "distanceAsDistanceSensor");
  for (const [original, replacement] of Object.entries({
    sensor_color: "color",
    sensor_distance: "distance",
    digitalTouch: "beam_break",
    pinpoint: "odo",
    left_hand: "hood",
    right_hand: "release",
    motorTest: "intake",
    servoTest: "gate",
  })) adapted = adapted.replaceAll(`${original}As`, `${replacement}As`);
  return adapted;
}

const ALL_DRIVETRAINS = ["mecanum", "tank", "x-drive", "h-drive"] as const;

export const STARTER_TEMPLATES = [
  {
    id: "empty",
    revision: 1,
    name: "Empty TeamCode",
    summary: "Project setup without an OpMode.",
    category: "empty",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
  {
    id: "teleop-basic",
    revision: 1,
    name: "Basic TeleOp",
    summary: "Gamepad driving and telemetry.",
    category: "teleop",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
  {
    id: "teleop-precision",
    revision: 1,
    name: "Precision TeleOp",
    summary: "Bumpers switch between three drive speeds.",
    category: "teleop",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
  {
    id: "autonomous-timed",
    revision: 1,
    name: "Timed Park Autonomous",
    summary: "Drive forward for two seconds, then stop.",
    category: "autonomous",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
  {
    id: "autonomous-square",
    revision: 1,
    name: "Square Path Autonomous",
    summary: "Drive a timed square path.",
    category: "autonomous",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
  {
    id: "competition-starter",
    revision: 1,
    name: "TeleOp + Autonomous",
    summary: "Driver Controlled TeleOp and Park Autonomous.",
    category: "combined",
    supportedDrivetrains: ALL_DRIVETRAINS,
  },
] as const satisfies readonly StarterTemplateDescriptor[];

const MOTOR_NAMES = {
  official: ["front_left_drive", "front_right_drive", "back_left_drive", "back_right_drive", "center_drive"],
  descriptive: ["frontLeftMotor", "frontRightMotor", "backLeftMotor", "backRightMotor", "centerStrafeMotor"],
} as const;

export function isStarterTemplateId(value: unknown): value is StarterTemplateId {
  return typeof value === "string" && STARTER_TEMPLATES.some((template) => template.id === value);
}

export function getStarterTemplate(id: StarterTemplateId): StarterTemplateDescriptor {
  const template = STARTER_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown FTC Simulator starter template “${String(id)}”.`);
  return template;
}

function packagePath(javaPackage: string): string {
  return javaPackage.replaceAll(".", "/");
}

function projectSlug(name: string): string {
  return name.replaceAll("'", "").replace(/[^A-Za-z0-9_.-]+/gu, "_");
}

function indent(source: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return source.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function javaDriveFormula(drivetrain: RobotVariant): string {
  if (drivetrain === "tank") {
    return `double left = drive + turn;
double right = drive - turn;
double[] powers = { left, right, left, right };`;
  }
  if (drivetrain === "h-drive") {
    return `double left = drive + turn;
double right = drive - turn;
double[] powers = { left, right, left, right, strafe };`;
  }
  return `double denominator = Math.max(Math.abs(drive) + Math.abs(strafe) + Math.abs(turn), 1.0);
double[] powers = {
    (drive + strafe + turn) / denominator,
    (drive - strafe - turn) / denominator,
    (drive - strafe + turn) / denominator,
    (drive + strafe - turn) / denominator
};`;
}

function kotlinDriveFormula(drivetrain: RobotVariant): string {
  if (drivetrain === "tank") {
    return `val left = drive + turn
val right = drive - turn
val powers = doubleArrayOf(left, right, left, right)`;
  }
  if (drivetrain === "h-drive") {
    return `val left = drive + turn
val right = drive - turn
val powers = doubleArrayOf(left, right, left, right, strafe)`;
  }
  return `val denominator = max(abs(drive) + abs(strafe) + abs(turn), 1.0)
val powers = doubleArrayOf(
    (drive + strafe + turn) / denominator,
    (drive - strafe - turn) / denominator,
    (drive - strafe + turn) / denominator,
    (drive + strafe - turn) / denominator
)`;
}

function javaMotorInitialization(input: NewProjectInput): string {
  const names = MOTOR_NAMES[input.motorNamingPreset];
  const centerMotor = input.drivetrain === "h-drive"
    ? `,\n            hardwareMap.get(DcMotor.class, "${names[4]}")`
    : "";
  return `DcMotor[] motors = {
    hardwareMap.get(DcMotor.class, "${names[0]}"),
    hardwareMap.get(DcMotor.class, "${names[1]}"),
    hardwareMap.get(DcMotor.class, "${names[2]}"),
    hardwareMap.get(DcMotor.class, "${names[3]}")${centerMotor}
};
motors[1].setDirection(DcMotor.Direction.REVERSE);
motors[3].setDirection(DcMotor.Direction.REVERSE);`;
}

function kotlinMotorInitialization(input: NewProjectInput): string {
  const names = MOTOR_NAMES[input.motorNamingPreset];
  const centerMotor = input.drivetrain === "h-drive"
    ? `,\n            hardwareMap.get(DcMotor::class.java, "${names[4]}")`
    : "";
  return `val motors = arrayOf(
    hardwareMap.get(DcMotor::class.java, "${names[0]}"),
    hardwareMap.get(DcMotor::class.java, "${names[1]}"),
    hardwareMap.get(DcMotor::class.java, "${names[2]}"),
    hardwareMap.get(DcMotor::class.java, "${names[3]}")${centerMotor}
)
motors[1].direction = DcMotorSimple.Direction.REVERSE
motors[3].direction = DcMotorSimple.Direction.REVERSE`;
}

function javaTeleOp(input: NewProjectInput, className: string, displayName: string, precision: boolean): string {
  const mechanisms = input.drivetrain === "mecanum" && input.templateId === "competition-starter";
  const scale = precision
    ? "double speed = gamepad1.left_bumper ? 0.35 : (gamepad1.right_bumper ? 1.0 : 0.65);"
    : "double speed = 1.0;";
  return `package ${input.javaPackage};

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;
import com.qualcomm.robotcore.hardware.DcMotor;
${mechanisms ? "import com.qualcomm.robotcore.hardware.Servo;\n" : ""}

@TeleOp(name = "${input.name} ${displayName}", group = "FTC Simulator")
public class ${className} extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
${indent(javaMotorInitialization(input), 8)}
${mechanisms ? indent(`DcMotor intake = hardwareMap.get(DcMotor.class, "intake");
DcMotor flywheel = hardwareMap.get(DcMotor.class, "flywheel");
DcMotor lift = hardwareMap.get(DcMotor.class, "lift");
DcMotor turret = hardwareMap.get(DcMotor.class, "turret");
Servo hood = hardwareMap.get(Servo.class, "hood");
Servo release = hardwareMap.get(Servo.class, "release");
Servo gate = hardwareMap.get(Servo.class, "gate");
lift.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
turret.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);
turret.setMode(DcMotor.RunMode.RUN_WITHOUT_ENCODER);
hood.setPosition(0.5);
release.setPosition(0.0);
gate.setPosition(0.0);`, 8) : ""}

        telemetry.addData("Status", "Initialized");
        telemetry.update();
        waitForStart();

        while (opModeIsActive()) {
            double drive = -gamepad1.left_stick_y;
            double strafe = gamepad1.left_stick_x;
            double turn = gamepad1.right_stick_x;
            ${scale}
${indent(javaDriveFormula(input.drivetrain), 12)}
            for (int index = 0; index < motors.length; index++) {
                motors[index].setPower(powers[index] * speed);
            }
${mechanisms ? indent(`intake.setPower((gamepad1.b || gamepad1.x) ? -1.0 : (gamepad1.a ? 1.0 : gamepad1.left_trigger));
flywheel.setPower(gamepad1.right_trigger);
lift.setPower(gamepad1.dpad_up ? 0.65 : (gamepad1.dpad_down ? -0.45 : 0.0));
boolean turretLeft = gamepad1.dpad_left;
boolean turretRight = gamepad1.dpad_right;
turret.setPower(turretLeft == turretRight ? 0.0 : (turretLeft ? 0.35 : -0.35));
hood.setPosition(gamepad1.left_bumper ? 0.2 : (gamepad1.right_bumper ? 0.8 : 0.5));
release.setPosition(gamepad1.y ? 1.0 : 0.0);
gate.setPosition(gamepad1.b ? 1.0 : 0.0);
double turretRevolutions = turret.getCurrentPosition() / (537.7 * 5.0);
double turretPosition = ((turretRevolutions % 1.0) + 1.0) % 1.0;
telemetry.addData("Turret", "%.1f° (%.3f rev)", turretPosition * 360.0, turretPosition);`, 12) : ""}
            telemetry.addData("Input", "drive %.2f, strafe %.2f, turn %.2f", drive, strafe, turn);
            telemetry.addData("Speed", "%.0f%%", speed * 100.0);
            telemetry.update();
            idle();
        }
    }
}
`;
}

function kotlinTeleOp(input: NewProjectInput, className: string, displayName: string, precision: boolean): string {
  const mechanisms = input.drivetrain === "mecanum" && input.templateId === "competition-starter";
  const scale = precision
    ? "val speed = if (gamepad1.left_bumper) 0.35 else if (gamepad1.right_bumper) 1.0 else 0.65"
    : "val speed = 1.0";
  return `package ${input.javaPackage}

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode
import com.qualcomm.robotcore.eventloop.opmode.TeleOp
import com.qualcomm.robotcore.hardware.DcMotor
import com.qualcomm.robotcore.hardware.DcMotorSimple
${mechanisms ? "import com.qualcomm.robotcore.hardware.Servo\n" : ""}
import kotlin.math.abs
import kotlin.math.max

@TeleOp(name = "${input.name} ${displayName}", group = "FTC Simulator")
class ${className} : LinearOpMode() {
    override fun runOpMode() {
${indent(kotlinMotorInitialization(input), 8)}
${mechanisms ? indent(`val intake = hardwareMap.get(DcMotor::class.java, "intake")
val flywheel = hardwareMap.get(DcMotor::class.java, "flywheel")
val lift = hardwareMap.get(DcMotor::class.java, "lift")
val turret = hardwareMap.get(DcMotor::class.java, "turret")
val hood = hardwareMap.get(Servo::class.java, "hood")
val release = hardwareMap.get(Servo::class.java, "release")
val gate = hardwareMap.get(Servo::class.java, "gate")
lift.zeroPowerBehavior = DcMotor.ZeroPowerBehavior.BRAKE
turret.zeroPowerBehavior = DcMotor.ZeroPowerBehavior.BRAKE
turret.mode = DcMotor.RunMode.RUN_WITHOUT_ENCODER
hood.position = 0.5
release.position = 0.0
gate.position = 0.0`, 8) : ""}

        telemetry.addData("Status", "Initialized")
        telemetry.update()
        waitForStart()

        while (opModeIsActive()) {
            val drive = -gamepad1.left_stick_y.toDouble()
            val strafe = gamepad1.left_stick_x.toDouble()
            val turn = gamepad1.right_stick_x.toDouble()
            ${scale}
${indent(kotlinDriveFormula(input.drivetrain), 12)}
            motors.forEachIndexed { index, motor -> motor.power = powers[index] * speed }
${mechanisms ? indent(`intake.power = if (gamepad1.b || gamepad1.x) -1.0 else if (gamepad1.a) 1.0 else gamepad1.left_trigger.toDouble()
flywheel.power = gamepad1.right_trigger.toDouble()
lift.power = if (gamepad1.dpad_up) 0.65 else if (gamepad1.dpad_down) -0.45 else 0.0
val turretLeft = gamepad1.dpad_left
val turretRight = gamepad1.dpad_right
turret.power = if (turretLeft == turretRight) 0.0 else if (turretLeft) 0.35 else -0.35
hood.position = if (gamepad1.left_bumper) 0.2 else if (gamepad1.right_bumper) 0.8 else 0.5
release.position = if (gamepad1.y) 1.0 else 0.0
gate.position = if (gamepad1.b) 1.0 else 0.0
val turretRevolutions = turret.currentPosition / (537.7 * 5.0)
val turretPosition = ((turretRevolutions % 1.0) + 1.0) % 1.0
telemetry.addData("Turret", "%.1f° (%.3f rev)", turretPosition * 360.0, turretPosition)`, 12) : ""}
            telemetry.addData("Input", "drive %.2f, strafe %.2f, turn %.2f", drive, strafe, turn)
            telemetry.addData("Speed", "%.0f%%", speed * 100.0)
            telemetry.update()
            idle()
        }
    }
}
`;
}

function javaTimedAuto(input: NewProjectInput, className: string, displayName: string): string {
  return `package ${input.javaPackage};

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

@Autonomous(name = "${input.name} ${displayName}", group = "FTC Simulator")
public class ${className} extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
${indent(javaMotorInitialization(input), 8)}
        telemetry.addLine("Ready to park");
        telemetry.update();
        waitForStart();

        try {
            if (opModeIsActive()) {
                driveFor(motors, 0.55, 0.0, 0.0, 2000);
            }
        } finally {
            stopMotors(motors);
        }
    }

    private void driveFor(DcMotor[] motors, double drive, double strafe, double turn, long milliseconds)
            throws InterruptedException {
${indent(javaDriveFormula(input.drivetrain), 8)}
        for (int index = 0; index < motors.length; index++) {
            motors[index].setPower(powers[index]);
        }
        sleep(milliseconds);
    }

    private void stopMotors(DcMotor[] motors) {
        for (DcMotor motor : motors) motor.setPower(0.0);
    }
}
`;
}

function kotlinTimedAuto(input: NewProjectInput, className: string, displayName: string): string {
  return `package ${input.javaPackage}

import com.qualcomm.robotcore.eventloop.opmode.Autonomous
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode
import com.qualcomm.robotcore.hardware.DcMotor
import com.qualcomm.robotcore.hardware.DcMotorSimple
import kotlin.math.abs
import kotlin.math.max

@Autonomous(name = "${input.name} ${displayName}", group = "FTC Simulator")
class ${className} : LinearOpMode() {
    override fun runOpMode() {
${indent(kotlinMotorInitialization(input), 8)}
        telemetry.addLine("Ready to park")
        telemetry.update()
        waitForStart()

        try {
            if (opModeIsActive()) driveFor(motors, 0.55, 0.0, 0.0, 2000L)
        } finally {
            motors.forEach { it.power = 0.0 }
        }
    }

    private fun driveFor(motors: Array<DcMotor>, drive: Double, strafe: Double, turn: Double, milliseconds: Long) {
${indent(kotlinDriveFormula(input.drivetrain), 8)}
        motors.forEachIndexed { index, motor -> motor.power = powers[index] }
        sleep(milliseconds)
    }
}
`;
}

function javaSquareAuto(input: NewProjectInput): string {
  const path = input.drivetrain === "tank"
    ? `for (int side = 0; side < 4 && opModeIsActive(); side++) {
                driveFor(motors, 0.55, 0.0, 0.0, 850);
                driveFor(motors, 0.0, 0.0, 0.55, 480);
            }`
    : `double[][] segments = {
                { 0.55, 0.0, 0.0, 850 },
                { 0.0, 0.55, 0.0, 850 },
                { -0.55, 0.0, 0.0, 850 },
                { 0.0, -0.55, 0.0, 850 }
            };
            for (double[] segment : segments) {
                if (!opModeIsActive()) break;
                driveFor(motors, segment[0], segment[1], segment[2], (long) segment[3]);
            }`;
  return `package ${input.javaPackage};

import com.qualcomm.robotcore.eventloop.opmode.Autonomous;
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.hardware.DcMotor;

@Autonomous(name = "${input.name} Square Path", group = "FTC Simulator")
public class SquareAuto extends LinearOpMode {
    @Override
    public void runOpMode() throws InterruptedException {
${indent(javaMotorInitialization(input), 8)}
        telemetry.addLine("Square path ready");
        telemetry.update();
        waitForStart();

        try {
            ${path}
        } finally {
            for (DcMotor motor : motors) motor.setPower(0.0);
        }
    }

    private void driveFor(DcMotor[] motors, double drive, double strafe, double turn, long milliseconds)
            throws InterruptedException {
${indent(javaDriveFormula(input.drivetrain), 8)}
        for (int index = 0; index < motors.length; index++) motors[index].setPower(powers[index]);
        sleep(milliseconds);
    }
}
`;
}

function kotlinSquareAuto(input: NewProjectInput): string {
  const path = input.drivetrain === "tank"
    ? `repeat(4) {
                if (!opModeIsActive()) return@repeat
                driveFor(motors, 0.55, 0.0, 0.0, 850L)
                driveFor(motors, 0.0, 0.0, 0.55, 480L)
            }`
    : `val segments = arrayOf(
                doubleArrayOf(0.55, 0.0, 0.0, 850.0),
                doubleArrayOf(0.0, 0.55, 0.0, 850.0),
                doubleArrayOf(-0.55, 0.0, 0.0, 850.0),
                doubleArrayOf(0.0, -0.55, 0.0, 850.0)
            )
            segments.forEach { segment ->
                if (!opModeIsActive()) return@forEach
                driveFor(motors, segment[0], segment[1], segment[2], segment[3].toLong())
            }`;
  return `package ${input.javaPackage}

import com.qualcomm.robotcore.eventloop.opmode.Autonomous
import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode
import com.qualcomm.robotcore.hardware.DcMotor
import com.qualcomm.robotcore.hardware.DcMotorSimple
import kotlin.math.abs
import kotlin.math.max

@Autonomous(name = "${input.name} Square Path", group = "FTC Simulator")
class SquareAuto : LinearOpMode() {
    override fun runOpMode() {
${indent(kotlinMotorInitialization(input), 8)}
        telemetry.addLine("Square path ready")
        telemetry.update()
        waitForStart()

        try {
            ${path}
        } finally {
            motors.forEach { it.power = 0.0 }
        }
    }

    private fun driveFor(motors: Array<DcMotor>, drive: Double, strafe: Double, turn: Double, milliseconds: Long) {
${indent(kotlinDriveFormula(input.drivetrain), 8)}
        motors.forEachIndexed { index, motor -> motor.power = powers[index] }
        sleep(milliseconds)
    }
}
`;
}

function generatedSources(input: NewProjectInput, officialSources?: OfficialSources): GeneratedSource[] {
  const renderTeleOp = input.starter === "kotlin" ? kotlinTeleOp : javaTeleOp;
  const renderTimedAuto = input.starter === "kotlin" ? kotlinTimedAuto : javaTimedAuto;
  if (input.exampleIds !== undefined) {
    return input.exampleIds.flatMap((id): GeneratedSource[] => {
      switch (id) {
        case "ftcsim:driver-controlled":
          return [{ className: "DriverControlled", content: renderTeleOp({ ...input, templateId: input.starter === "blocks" ? "teleop-basic" : "competition-starter" }, "DriverControlled", "Driver Controlled", false) }];
        case "ftcsim:park-auto":
          return [{ className: "ParkAuto", content: renderTimedAuto(input, "ParkAuto", "Park Auto") }];
        case "ftcsim:basic-drive":
          return [{ className: "RobotDrive", content: renderTeleOp(input, "RobotDrive", "Drive", false) }];
        case "ftcsim:precision-drive":
          return [{ className: "PrecisionDrive", content: renderTeleOp(input, "PrecisionDrive", "Precision Drive", true) }];
        case "ftcsim:timed-park":
          return [{ className: "TimedParkAuto", content: renderTimedAuto(input, "TimedParkAuto", "Timed Park") }];
        case "ftcsim:square-path":
          return [{ className: "SquareAuto", content: input.starter === "kotlin" ? kotlinSquareAuto(input) : javaSquareAuto(input) }];
        default: {
          if (!id.startsWith("official-java:")) return [];
          const className = id.slice("official-java:".length);
          const source = officialSources?.java[className];
          if (!source) throw new Error(`Official FTC example ${className} is missing from SDK 11.1.`);
          if (className === "ConceptExternalHardwareClass") {
            return [
              { className, content: adaptOfficialJava(source, input), extension: "java" },
              { className: "RobotHardware", content: adaptOfficialJava(officialSources!.helpers.RobotHardware, input), extension: "java" },
            ];
          }
          return [{ className, content: adaptOfficialJava(source, input), extension: "java" }];
        }
      }
    });
  }
  switch (input.templateId) {
    case "empty":
      return [];
    case "teleop-basic":
      return [{ className: "RobotDrive", content: renderTeleOp(input, "RobotDrive", "Drive", false) }];
    case "teleop-precision":
      return [{ className: "PrecisionDrive", content: renderTeleOp(input, "PrecisionDrive", "Precision Drive", true) }];
    case "autonomous-timed":
      return [{ className: "TimedParkAuto", content: renderTimedAuto(input, "TimedParkAuto", "Timed Park") }];
    case "autonomous-square":
      return [{
        className: "SquareAuto",
        content: input.starter === "java" ? javaSquareAuto(input) : kotlinSquareAuto(input),
      }];
    case "competition-starter":
      return [
        { className: "DriverControlled", content: renderTeleOp(input, "DriverControlled", "Driver Controlled", false) },
        { className: "ParkAuto", content: renderTimedAuto(input, "ParkAuto", "Park Auto") },
      ];
  }
}

type BlocksTemplateSource = {
  className: string;
  kind: "teleop" | "autonomous";
  xml: string;
};

function nextChain(blocks: string[]): string {
  return blocks.reduceRight((next, block) => (
    next ? block.replace(/<\/block>$/u, `<next>${next}</next></block>`) : block
  ), "");
}

function numberBlock(value: number): string {
  return `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;
}

function gamepadNumber(property: "LeftStickX" | "LeftStickY" | "RightStickX"): string {
  return `<block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">${property}</field></block>`;
}

function gamepadBoolean(property: "LeftBumper" | "RightBumper"): string {
  return `<block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">${property}</field></block>`;
}

function arithmetic(
  operation: "ADD" | "MINUS" | "MULTIPLY",
  left: string,
  right: string,
): string {
  return `<block type="math_arithmetic"><field name="OP">${operation}</field><value name="A">${left}</value><value name="B">${right}</value></block>`;
}

function negate(value: string): string {
  return `<block type="math_single"><field name="OP">NEG</field><value name="NUM">${value}</value></block>`;
}

function speedExpression(): string {
  return `<block type="logic_ternary"><value name="IF">${gamepadBoolean("LeftBumper")}</value><value name="THEN">${numberBlock(0.35)}</value><value name="ELSE"><block type="logic_ternary"><value name="IF">${gamepadBoolean("RightBumper")}</value><value name="THEN">${numberBlock(1)}</value><value name="ELSE">${numberBlock(0.65)}</value></block></value></block>`;
}

function setMotorPower(identifier: string, value: string): string {
  return `<block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">${identifier}</field><field name="PROP">Power</field><value name="VALUE">${value}</value></block>`;
}

function setMotorDirection(identifier: string): string {
  return `<block type="dcMotor_setProperty_Direction"><field name="IDENTIFIER">${identifier}</field><field name="PROP">Direction</field><value name="VALUE"><block type="dcMotor_typedEnum_direction"><field name="DIRECTION">REVERSE</field></block></value></block>`;
}

function sleepBlock(milliseconds: number): string {
  return `<block type="linearOpMode_sleep_Number"><value name="MILLISECONDS">${numberBlock(milliseconds)}</value></block>`;
}

function waitForStartBlock(): string {
  return '<block type="linearOpMode_waitForStart"></block>';
}

function activeLoop(body: string): string {
  return `<block type="controls_whileUntil"><field name="MODE">WHILE</field><value name="BOOL"><block type="linearOpMode_opModeIsActive"></block></value><statement name="DO">${body}</statement></block>`;
}

function motorIdentifiers(drivetrain: RobotVariant): string[] {
  const four = [
    "ftcsimMotor1AsDcMotor",
    "ftcsimMotor2AsDcMotor",
    "ftcsimMotor3AsDcMotor",
    "ftcsimMotor4AsDcMotor",
  ];
  return drivetrain === "h-drive" ? [...four, "ftcsimMotor5AsDcMotor"] : four;
}

function directionBlocks(): string[] {
  return [
    setMotorDirection("ftcsimMotor2AsDcMotor"),
    setMotorDirection("ftcsimMotor4AsDcMotor"),
  ];
}

function teleOpDriveBlocks(drivetrain: RobotVariant, precision: boolean): string {
  const drive = negate(gamepadNumber("LeftStickY"));
  const strafe = gamepadNumber("LeftStickX");
  const turn = gamepadNumber("RightStickX");
  const raw = drivetrain === "tank"
    ? [
        arithmetic("ADD", drive, turn),
        arithmetic("MINUS", drive, turn),
        arithmetic("ADD", drive, turn),
        arithmetic("MINUS", drive, turn),
      ]
    : [
        arithmetic("ADD", arithmetic("ADD", drive, strafe), turn),
        arithmetic("MINUS", arithmetic("MINUS", drive, strafe), turn),
        arithmetic("ADD", arithmetic("MINUS", drive, strafe), turn),
        arithmetic("MINUS", arithmetic("ADD", drive, strafe), turn),
        ...(drivetrain === "h-drive" ? [strafe] : []),
      ];
  const speed = speedExpression();
  return nextChain(motorIdentifiers(drivetrain).map((identifier, index) => (
    setMotorPower(
      identifier,
      precision ? arithmetic("MULTIPLY", raw[index], speed) : raw[index],
    )
  )));
}

function timedAutonomousBlocks(drivetrain: RobotVariant): string {
  const motors = motorIdentifiers(drivetrain);
  return nextChain([
    ...motors.map((identifier) => setMotorPower(
      identifier,
      numberBlock(identifier === "ftcsimMotor5AsDcMotor" ? 0 : 0.55),
    )),
    sleepBlock(2_000),
    ...motors.map((identifier) => setMotorPower(identifier, numberBlock(0))),
  ]);
}

function squareAutonomousBlocks(drivetrain: RobotVariant): string {
  const motors = motorIdentifiers(drivetrain);
  const drive = motors.map((identifier) => setMotorPower(
    identifier,
    numberBlock(identifier === "ftcsimMotor5AsDcMotor" ? 0 : 0.55),
  ));
  const turnPowers = drivetrain === "h-drive"
    ? [0.5, -0.5, 0.5, -0.5, 0]
    : [0.5, -0.5, 0.5, -0.5];
  const turn = motors.map((identifier, index) => setMotorPower(
    identifier,
    numberBlock(turnPowers[index]),
  ));
  const stop = motors.map((identifier) => setMotorPower(identifier, numberBlock(0)));
  const body = nextChain([
    ...drive,
    sleepBlock(850),
    ...turn,
    sleepBlock(480),
  ]);
  return nextChain([
    `<block type="controls_repeat_ext"><value name="TIMES">${numberBlock(4)}</value><statement name="DO">${body}</statement></block>`,
    ...stop,
  ]);
}

function blocksEnvelope(
  className: string,
  kind: "teleop" | "autonomous",
  body: string,
): string {
  const flavor = kind === "autonomous" ? "AUTONOMOUS" : "TELEOP";
  const workspace = body
    ? `<block type="procedures_defnoreturn" id="ftcsim_${className}" deletable="false" x="32" y="32"><field name="NAME">runOpMode</field><statement name="STACK">${body}</statement></block>`
    : "";
  return `<xml xmlns="https://developers.google.com/blockly/xml">${workspace}</xml><?xml version='1.0' encoding='UTF-8' standalone='yes' ?><Extra><OpModeMeta flavor="${flavor}" group="FTC Simulator" autoTransition="" /><Enabled value="true" /></Extra>`;
}

function blocksTemplateSources(input: NewProjectInput, officialSources?: OfficialSources): BlocksTemplateSource[] {
  const teleOp = (className: string, precision: boolean): BlocksTemplateSource => ({
    className,
    kind: "teleop",
    xml: blocksEnvelope(
      className,
      "teleop",
      nextChain([
        ...directionBlocks(),
        waitForStartBlock(),
        activeLoop(teleOpDriveBlocks(input.drivetrain, precision)),
      ]),
    ),
  });
  const autonomous = (
    className: string,
    square: boolean,
  ): BlocksTemplateSource => ({
    className,
    kind: "autonomous",
    xml: blocksEnvelope(
      className,
      "autonomous",
      nextChain([
        ...directionBlocks(),
        waitForStartBlock(),
        square
          ? squareAutonomousBlocks(input.drivetrain)
          : timedAutonomousBlocks(input.drivetrain),
      ]),
    ),
  });
  if (input.exampleIds !== undefined) {
    return input.exampleIds.flatMap((id): BlocksTemplateSource[] => {
      switch (id) {
        case "ftcsim:driver-controlled": return [teleOp("DriverControlled", false)];
        case "ftcsim:park-auto": return [autonomous("ParkAuto", false)];
        case "ftcsim:basic-drive": return [teleOp("RobotDrive", false)];
        case "ftcsim:precision-drive": return [teleOp("PrecisionDrive", true)];
        case "ftcsim:timed-park": return [autonomous("TimedParkAuto", false)];
        case "ftcsim:square-path": return [autonomous("SquareAuto", true)];
        default: {
          if (!id.startsWith("official-blocks:")) return [];
          const className = id.slice("official-blocks:".length);
          const xml = officialSources?.blocks[className];
          const descriptor = exampleById(id);
          if (!xml || !descriptor) throw new Error(`Official FTC Blocks example ${className} is missing from SDK 11.1.`);
          return [{ className, kind: descriptor.kind, xml: adaptOfficialBlocks(xml) }];
        }
      }
    });
  }
  switch (input.templateId) {
    case "empty":
      return [{
        className: "EmptyBlocks",
        kind: "teleop",
        xml: blocksEnvelope("EmptyBlocks", "teleop", ""),
      }];
    case "teleop-basic":
      return [teleOp("RobotDrive", false)];
    case "teleop-precision":
      return [teleOp("PrecisionDrive", true)];
    case "autonomous-timed":
      return [autonomous("TimedParkAuto", false)];
    case "autonomous-square":
      return [autonomous("SquareAuto", true)];
    case "competition-starter":
      return [teleOp("DriverControlled", false)];
  }
}

function manifest(input: NewProjectInput): string {
  const names = MOTOR_NAMES[input.motorNamingPreset];
  const template = getStarterTemplate(input.templateId);
  let robot: RobotConfigurationV2 | RobotConfigurationV3 = input.drivetrain === "mecanum"
    ? createBiobuzzRobotConfiguration(input.motorNamingPreset, names)
    : createRobotConfigurationManifest(input.drivetrain, input.motorNamingPreset, names);
  if (input.exampleIds !== undefined && !("physical" in robot)) {
    const legacy = createLegacyPhysicalHardware(robot);
    const preset = createBiobuzzRobotConfiguration();
    robot = {
      ...robot,
      physical: {
        ...legacy.robot,
        sensors: structuredClone(preset.physical.sensors),
        cameras: structuredClone(preset.physical.cameras),
      },
      servoPorts: legacy.servoPorts,
      sensorPorts: structuredClone(preset.sensorPorts),
    };
  }
  if (input.exampleIds?.some((id) => id === "official-java:ConceptAprilTagMultiPortal"
      || id === "official-java:ConceptAprilTagSwitchableCameras"
      || id === "official-blocks:ConceptAprilTagSwitchableCameras")) {
    const physical = robot as RobotConfigurationV3;
    const prototype = createBiobuzzRobotConfiguration().physical.cameras[0];
    if (prototype && !physical.physical.cameras.some((camera) => camera.name === "Webcam 2")) {
      physical.physical.cameras.push({
        ...structuredClone(prototype),
        name: "Webcam 2",
        mount: {
          ...structuredClone(prototype.mount),
          position: { ...prototype.mount.position, z: prototype.mount.position.z + 0.08 },
        },
      });
    }
    robot = physical;
  }
  return `${JSON.stringify({
    schemaVersion: 3,
    name: input.name,
    sdkVersion: FTC_SDK_VERSION,
    kotlinVersion: KOTLIN_VERSION,
    javaBytecodeTarget: 8,
    package: input.javaPackage,
    starter: input.starter,
    template: { id: input.exampleIds === undefined ? template.id : "selected-examples", revision: template.revision, language: input.starter },
    ...(input.exampleIds !== undefined ? { examples: input.exampleIds } : {}),
    field: { preset: "biobuzz-2026-2027" },
    robot,
  }, null, 2)}\n`;
}

export function generateProjectTemplate(input: NewProjectInput, officialSources?: OfficialSources): ProjectTemplate {
  const descriptor = getStarterTemplate(input.templateId);
  if (!descriptor.supportedDrivetrains.includes(input.drivetrain)) {
    throw new Error(`${descriptor.name} does not support the ${input.drivetrain} drivetrain.`);
  }

  const files = { ...SAMPLE_FILES };
  for (const path of Object.keys(files)) {
    if (path.startsWith("TeamCode/src/main/") && path !== "TeamCode/src/main/AndroidManifest.xml") {
      delete files[path];
    }
  }

  files["settings.gradle"] = `rootProject.name = '${projectSlug(input.name)}'\n\ninclude ':FtcRobotController'\ninclude ':TeamCode'\n`;
  files["gradle.properties"] = files["gradle.properties"]
    .replace(/ftcSdkVersion=.*$/mu, `ftcSdkVersion=${FTC_SDK_VERSION}`)
    .concat(`kotlinVersion=${KOTLIN_VERSION}\n`);
  files["TeamCode/build.gradle"] = files["TeamCode/build.gradle"]
    .replace("namespace = 'org.firstinspires.ftc.teamcode'", `namespace = '${input.javaPackage}'`);
  files["ftcsim.project.json"] = manifest(input);
  const templateName = input.starter === "blocks" && input.templateId === "competition-starter"
    ? "Competition TeleOp"
    : descriptor.name;
  files["README.md"] = input.exampleIds !== undefined
    ? `# ${input.name}\n\nFTC SDK ${FTC_SDK_VERSION} project.\n\n## Included OpModes\n\n${input.exampleIds.map((id) => `- ${exampleById(id)?.name ?? id}${id.startsWith("official-") ? " (Official FTC Example)" : " (FTCSim Example)"}`).join("\n") || "No OpModes selected."}\n\nOfficial FTC examples are adapted from the [FTC SDK 11.1 samples](https://github.com/FIRST-Tech-Challenge/FtcRobotController/tree/v11.1/FtcRobotController/src/main/java/org/firstinspires/ftc/robotcontroller/external/samples) and the SDK Blocks 11.1.0 package. Keep the copyright notices in the Java sources.\n`
    : `# ${input.name}\n\n${templateName} project targeting FTC SDK ${FTC_SDK_VERSION}.\n`;

  if (input.starter === "kotlin") {
    files["build.gradle"] = files["build.gradle"].replace(
      /dependencies \{\n/u,
      `dependencies {\n        classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:\${kotlinVersion}"\n`,
    );
    files["TeamCode/build.gradle"] = `apply plugin: 'kotlin-android'\n${files["TeamCode/build.gradle"]}`
      .replace("android {\n", "android {\n    kotlinOptions {\n        jvmTarget = '1.8'\n    }\n\n");
  }

  if (input.starter === "blocks") {
    const visualSources = blocksTemplateSources(input, officialSources);
    const javaSources = input.templateId === "empty" && input.exampleIds === undefined
      ? [{
          className: "EmptyBlocks",
          content: `package ${input.javaPackage};

import com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;
import com.qualcomm.robotcore.eventloop.opmode.TeleOp;

@TeleOp(name = "EmptyBlocks", group = "FTC Simulator")
public class EmptyBlocks extends LinearOpMode {
    @Override
    public void runOpMode() {
        // Empty visual workspace.
    }
}
`,
        }]
      : generatedSources(input.exampleIds === undefined ? { ...input, starter: "java" } : input, officialSources);
    const configurationHash = openRobotConfiguration(
      files["ftcsim.project.json"],
    ).resolved.configurationHash;
    for (const visual of visualSources) {
      const paths = opModePaths(input.javaPackage, visual.className, "blocks");
      const generatedJavaPath = paths.generatedJavaPath as string;
      const java = javaSources.find((candidate) => candidate.className === visual.className);
      if (!java && input.exampleIds === undefined) throw new Error(`Blocks template source ${visual.className} has no Java output.`);
      files[paths.sourcePath] = visual.xml;
      if (java) files[generatedJavaPath] = markGeneratedBlocksJavaSync(
        java.content,
        paths.sourcePath,
        hashBlocksSourceSync(visual.xml),
        input.javaPackage,
        configurationHash,
      );
    }
    const primary = visualSources[0];
    const primaryPath = primary ? opModePaths(input.javaPackage, primary.className, "blocks").sourcePath : null;
    return {
      files,
      activeFile: primaryPath,
      selectedOpMode: input.templateId === "empty" && input.exampleIds === undefined || !primary
        ? null
        : `${input.javaPackage}.${primary.className}`,
    };
  }

  const extension = input.starter === "java" ? "java" : "kt";
  const sources = generatedSources(input, officialSources);
  for (const source of sources) {
    const path = `TeamCode/src/main/java/${packagePath(input.javaPackage)}/${source.className}.${source.extension ?? extension}`;
    files[path] = source.content;
  }
  const primary = sources[0];
  const activeFile = primary
    ? `TeamCode/src/main/java/${packagePath(input.javaPackage)}/${primary.className}.${primary.extension ?? extension}`
    : null;

  return {
    files,
    activeFile,
    selectedOpMode: primary ? `${input.javaPackage}.${primary.className}` : null,
  };
}

/** Loads FIRST's source archive only when a project actually selects an official example. */
export async function generateProjectWithExamples(input: NewProjectInput): Promise<ProjectTemplate> {
  const officialSources = input.exampleIds?.some((id) => id.startsWith("official-"))
    ? (await import("./official-ftc-samples-11.1.0.json")).default as OfficialSources
    : undefined;
  const project = generateProjectTemplate(input, officialSources);
  return generateOfficialBlocksJava(input, project);
}
