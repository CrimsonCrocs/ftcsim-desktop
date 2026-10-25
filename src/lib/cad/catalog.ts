import type { MotorElectricalProfile } from "../../../packages/ftc-sim-core/src/world-types";

export interface CadProduct {
  id: string;
  label: string;
  kind: "motor" | "camera" | "wheel" | "servo" | "hub" | "sensor";
  aliases: string[];
  source: string;
  motorModelId?: string;
  motor?: MotorElectricalProfile;
  /** Right-angle housings cannot reveal their output axis from the longest PCA axis. */
  outputShaftRequired?: boolean;
  wheel?: { kind: "mecanum" | "omni" | "traction"; radius: number };
  camera?: { kind: "webcam" | "limelight3a" | "huskylens"; horizontalFov: number; verticalFov: number; assumedOptics?: boolean };
  servo?: { speedRadiansPerSecond: number; torqueNm: number; maximumTravelRadians: number; voltage: number };
  sensorKind?: "distance" | "color" | "digital" | "pinpoint";
  needsReview?: string;
}
const yellowSource = "https://www.gobilda.com/yellow-jacket-planetary-gear-motors/";
// Actual reductions/encoder counts, rather than rounded SKU suffixes. Source: manufacturer spec sheets.
const yellowRatios = [
  ["0001", 1, 6000, 1.47, 28], ["0003", 3.7, 1620, 5.4, 103.8], ["0005", 5.2, 1150, 7.9, 145.1],
  ["0014", 13.7, 435, 18.7, 384.5], ["0019", 19.2, 312, 24.3, 537.7], ["0027", 26.9, 223, 38, 753.2],
  ["0051", 50.9, 117, 68.4, 1425.1], ["0071", 71.2, 84, 93.6, 1993.6], ["0100", 99.5, 60, 133.2, 2786.2],
  ["0139", 139, 43, 185, 3895.9], ["0188", 188, 30, 250, 5281.1],
] as const;
const motorProfile = (id: string, rpm: number, ticks: number, torque: number, source: string, current = 9.2): MotorElectricalProfile => ({
  id, nominalVoltage: 12, freeSpeedRpm: rpm, ticksPerRevolution: ticks, stallTorqueNm: torque,
  stallCurrentAmps: current, freeCurrentAmps: .25, rotorInertiaKgM2: .0012, source,
});
const yellow = ["5202", "5203", "5204"].flatMap((series) => yellowRatios.map(([suffix, ratio, rpm, torque, ticks]) => {
  const sku = `${series}-${series === "5204" ? "8002" : "2402"}-${suffix}`;
  return {
    id: sku, label: `goBILDA ${series} · ${rpm} RPM (${ratio}:1)`, kind: "motor" as const,
    aliases: [sku, `${series}-0002-${suffix}`], source: yellowSource, motorModelId: "goBILDA5202SeriesMotor",
    motor: motorProfile(sku, rpm, ticks, torque * .0980665, `https://www.gobilda.com/content/spec_sheets/${sku}_spec_sheet.pdf`),
  };
}));
function rev(id: string, label: string, model: string, rpm: number, ticks: number, torque: number, aliases: string[] = [], review?: string): CadProduct {
  const source = `https://www.revrobotics.com/${id.toLowerCase()}/`;
  return { id, label, kind: "motor", aliases: [id, ...aliases], source, motorModelId: model, motor: motorProfile(id, rpm, ticks, torque, source, id === "REV-41-1300" ? 4.4 : 8.5), outputShaftRequired: id === "REV-41-1300", needsReview: review };
}
export const CAD_PRODUCTS: readonly CadProduct[] = [
  ...yellow,
  ...["5000-0002-0001", "5000-0002-4008"].map((sku) => ({ id: sku, label: `goBILDA 5000 · 6000 RPM · ${sku.endsWith("4008") ? "8 mm REX" : "D-shaft"}`, kind: "motor" as const, aliases: [sku], source: "https://www.gobilda.com/5000-series-motors", motorModelId: "goBILDA5202SeriesMotor", motor: motorProfile(sku, 6000, 28, 1.47 * .0980665, "https://www.gobilda.com/5000-series-12vdc-motor/"), needsReview: "Bare motor output. Configure any external gearing in Drivetrain settings." })),
  rev("REV-41-1300", "REV Core Hex", "RevRoboticsCoreHexMotor", 125, 288, 3.2, ["core hex", "corehex"]),
  rev("REV-41-1301", "REV HD Hex 40:1", "RevRobotics40HDHexMotor", 150, 1120, 4.2, ["hd hex 40", "hdhex40"]),
  rev("REV-41-1211", "REV HD Hex 20:1", "RevRobotics20HDHexMotor", 300, 560, 2.1, ["hd hex 20", "hdhex20"]),
  rev("REV-41-1291", "REV HD Hex · no gearbox", "RevRoboticsUltraplanetaryHDHexMotor", 6000, 28, .105),
  rev("REV-41-1600", "REV UltraPlanetary · review reduction", "RevRoboticsUltraplanetaryHDHexMotor", 300, 560, 2.1, ["ultraplanetary"], "Select the installed cartridge reduction; the 20:1 output is a starting estimate."),
  { id: "gobilda-5201", label: "goBILDA 5201 · 53:1", kind: "motor", aliases: ["5201-0002-0053", "5201 series"], source: "https://www.gobilda.com/5201-series-53-1-ratio-105-rpm-spur-gear-motor-w-encoder/", motorModelId: "goBILDA5201SeriesMotor", motor: motorProfile("gobilda-5201", 105, 1500, 3.7, yellowSource), needsReview: "Confirm the 5201 output profile in Drivetrain settings." },
  { id: "limelight-3a", label: "Limelight 3A", kind: "camera", aliases: ["limelight3a", "limelight 3a", "limelight_3a", "limelightv3a", "ll3a"], source: "https://docs.limelightvision.io/docs/docs-limelight/getting-started/limelight-3a", camera: { kind: "limelight3a", horizontalFov: 54.5, verticalFov: 42 } },
  { id: "huskylens", label: "DFRobot HuskyLens", kind: "camera", aliases: ["huskylens", "husky lens", "huskycam", "SEN0305", "SEN0336"], source: "https://wiki.dfrobot.com/sen0305/", camera: { kind: "huskylens", horizontalFov: 60, verticalFov: 45, assumedOptics: true } },
  { id: "webcam", label: "USB webcam", kind: "camera", aliases: ["webcam", "logitech c270", "logitech c920", "arducam", "lifecam"], source: "https://ftc-docs.firstinspires.org/en/latest/hardware_and_software_configuration/configuring/configuring_external_webcam/configuring-external-webcam.html", camera: { kind: "webcam", horizontalFov: 70, verticalFov: 50, assumedOptics: true } },
  { id: "gobilda-mecanum-left", label: "goBILDA 104 mm mecanum · left", kind: "wheel", aliases: ["3625-0100-0104"], source: "https://www.gobilda.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers/", wheel: { kind: "mecanum", radius: .052 } },
  { id: "gobilda-mecanum-right", label: "goBILDA 104 mm mecanum · right", kind: "wheel", aliases: ["3625-0001-0104"], source: "https://www.gobilda.com/96mm-mecanum-wheel-set-70a-durometer-bearing-supported-rollers/", wheel: { kind: "mecanum", radius: .052 } },
  { id: "mecanum-wheel", label: "Mecanum wheel", kind: "wheel", aliases: ["mecanum wheel", "mecanum_wheel", "mecanumwheel"], source: "", wheel: { kind: "mecanum", radius: .048 } },
  { id: "omni-wheel", label: "Omni wheel", kind: "wheel", aliases: ["omni wheel", "omni_wheel", "omniwheel", "REV-41-1190"], source: "https://www.revrobotics.com/rev-41-1190/", wheel: { kind: "omni", radius: .045 } },
  { id: "traction-wheel", label: "Traction wheel", kind: "wheel", aliases: ["traction wheel", "traction_wheel", "tractionwheel", "grip wheel"], source: "", wheel: { kind: "traction", radius: .048 } },
  { id: "rev-control-hub", label: "REV Control Hub", kind: "hub", aliases: ["REV-31-1595", "control hub", "controlhub"], source: "https://www.revrobotics.com/rev-31-1595/" },
  { id: "rev-expansion-hub", label: "REV Expansion Hub", kind: "hub", aliases: ["REV-31-1153", "expansion hub", "expansionhub"], source: "https://www.revrobotics.com/rev-31-1153/" },
  { id: "rev-servo", label: "REV Smart Robot Servo", kind: "servo", aliases: ["REV-41-1097", "smart robot servo"], source: "https://www.revrobotics.com/rev-41-1097/" },
  { id: "generic-servo", label: "Custom positional servo", kind: "servo", aliases: [], source: "", needsReview: "Enter this servo's travel, speed and torque in Robot Settings; the initial dynamics are unmeasured estimates." },
  { id: "gobilda-servo", label: "goBILDA dual-mode servo", kind: "servo", aliases: ["2000-0025-0002", "2000-0025-0003", "gobilda servo"], source: "https://www.gobilda.com/2000-series-dual-mode-servo-25-2-torque/" },
  ...([
    ["axon-max-mk2", "Axon MAX MK2", ["axon max mk2", "axonmaxmk2", "axon max v2"], .140, 28, 360, "servos/max"],
    ["axon-mini-mk2", "Axon MINI MK2", ["axon mini mk2", "axonminimk2", "axon mini v2"], .110, 20, 360, "servos/mini"],
    ["axon-max-plus", "Axon MAX+", ["axon max+", "axonmaxplus"], .140, 28, 355, "archive/max"],
    ["axon-mini-plus", "Axon MINI+", ["axon mini+", "axonminiplus"], .110, 20, 355, "archive/mini"],
    ["axon-micro-plus", "Axon MICRO+", ["axon micro+", "axonmicroplus", "axon micro"], .085, 6.5, 355, "archive/micro"],
  ] as const).map(([id, label, aliases, secondsPer60Degrees, kgCm, travel, page]) => ({ id, label, aliases: [...aliases], kind: "servo" as const, source: `https://docs.axon-robotics.com/${page}`, servo: { speedRadiansPerSecond: Math.PI / 3 / secondsPer60Degrees, torqueNm: kgCm * .0980665, maximumTravelRadians: travel * Math.PI / 180, voltage: 4.8 }, needsReview: "Manufacturer 4.8 V speed/torque profile; check programmed travel, supply voltage and servo/CR mode. Analog feedback wiring is not inferred." })),
  { id: "rev-distance", label: "REV 2m Distance Sensor", kind: "sensor", aliases: ["REV-31-1505", "2m distance"], source: "https://www.revrobotics.com/rev-31-1505/", sensorKind: "distance" },
  { id: "rev-color", label: "REV Color Sensor V3", kind: "sensor", aliases: ["REV-31-1557", "color sensor v3"], source: "https://www.revrobotics.com/rev-31-1557/", sensorKind: "color" },
  { id: "gobilda-pinpoint", label: "goBILDA Pinpoint", kind: "sensor", aliases: ["3110-0002-0001", "pinpoint"], source: "https://www.gobilda.com/pinpoint-odometry-computer-imu-sensor-fusion-for-2-wheel-odometry/", sensorKind: "pinpoint" },
];
export const getCadProduct = (id: string | null | undefined) => CAD_PRODUCTS.find((product) => product.id === id);
