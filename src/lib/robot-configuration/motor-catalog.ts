export type MotorRotation = "CW" | "CCW";
export type MotorPhotoMatch = "exact" | "family" | "compatible-profile";

export interface MotorModelProfile {
  /** FTC SDK XML/configuration identifier. */
  id: string;
  label: string;
  manufacturer: string;
  modelNumber: string;
  gearRatio: number;
  ticksPerRevolution: number;
  maxRpm: number;
  orientation: MotorRotation;
  achievableMaxRpmFraction: number;
  /** Actual product/family photo, hosted by the manufacturer or cited FTC documentation. */
  imageUrl: string;
  imageAlt: string;
  imageSourceLabel: string;
  imageMatch: MotorPhotoMatch;
  productUrl: string;
}

/**
 * FTC SDK 11.1's real built-in goBILDA motor configuration family. BIOBUZZ uses
 * this SDK type as its metadata template, then supplies the installed motor's
 * physical output values from its separate hardware profile.
 */
export const BIOBUZZ_MOTOR_FAMILY_ID = "goBILDA5202SeriesMotor";

/**
 * Selectable motor profiles declared by the pinned FTC SDK 11.1 Hardware artifact.
 * Keep this list mechanically aligned with the @MotorType annotations in that artifact.
 */
export const FTC_11_1_MOTOR_MODELS = [
  { id: "TetrixMotor", label: "Tetrix Motor", manufacturer: "Pitsco", modelNumber: "W39530", gearRatio: 52, ticksPerRevolution: 1440, maxRpm: 165, orientation: "CW", achievableMaxRpmFraction: 0.85, imageUrl: "https://ftc-docs.firstinspires.org/en/latest/_images/W44260.jpg", imageAlt: "TETRIX TorqueNADO motor compatible with the FTC TETRIX motor profile", imageSourceLabel: "FIRST Tech Challenge documentation", imageMatch: "compatible-profile", productUrl: "https://ftc-docs.firstinspires.org/en/latest/control_hard_compon/rc_components/motors/motors.html" },
  { id: "goBILDA5201SeriesMotor", label: "goBILDA 5201 Series", manufacturer: "goBILDA", modelNumber: "goBILDA-5201", gearRatio: 54, ticksPerRevolution: 1500, maxRpm: 104, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-x56mtydx1w/products/836/images/4621/5201-0002-0053-FTC-Legal__41351__17713.1701992249.386.513.jpg?c=1", imageAlt: "Representative goBILDA 5201 Series gear motor", imageSourceLabel: "goBILDA product media", imageMatch: "family", productUrl: "https://www.gobilda.com/5201-series-53-1-ratio-105-rpm-spur-gear-motor-w-encoder/" },
  { id: "goBILDA5202SeriesMotor", label: "goBILDA 5202/3/4 Series", manufacturer: "goBILDA", modelNumber: "goBILDA-5202", gearRatio: 99.5, ticksPerRevolution: 2786, maxRpm: 60, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-x56mtydx1w/products/1066/images/5206/5202-0002-0100-FTC-Legal__62851__62372.1701992463.386.513.jpg?c=1", imageAlt: "Representative goBILDA 5202 Series Yellow Jacket gear motor", imageSourceLabel: "goBILDA product media", imageMatch: "family", productUrl: "https://www.gobilda.com/5202-series-yellow-jacket-planetary-gear-motor-99-5-1-ratio-60-rpm-3-3-5v-encoder/" },
  { id: "Matrix12vMotor", label: "Matrix 12V Motor", manufacturer: "Modern Robotics", modelNumber: "50-0120", gearRatio: 52.8, ticksPerRevolution: 1478.4, maxRpm: 190, orientation: "CW", achievableMaxRpmFraction: 0.85, imageUrl: "https://ftc-docs.firstinspires.org/en/latest/_images/5202-0002-0014.jpg", imageAlt: "Modern Robotics MATRIX 12V DC motor", imageSourceLabel: "FIRST Tech Challenge documentation", imageMatch: "exact", productUrl: "https://ftc-docs.firstinspires.org/en/latest/control_hard_compon/rc_components/motors/motors.html" },
  { id: "NeveRest20Gearmotor", label: "NeveRest 20 Gearmotor", manufacturer: "AndyMark", modelNumber: "am-3102", gearRatio: 20, ticksPerRevolution: 560, maxRpm: 315, orientation: "CW", achievableMaxRpmFraction: 0.85, imageUrl: "https://andymark.com/cdn/shop/files/am-NeveRest-Orbital_1_9cc6d370-56e0-4669-b0b3-2a5d7c10d637_1200x1200.jpg?v=1772134656", imageAlt: "Representative AndyMark NeveRest Orbital gear motor family", imageSourceLabel: "AndyMark product media", imageMatch: "family", productUrl: "https://www.andymark.com/products/neverest-orbital-gearmotors" },
  { id: "NeveRest3.7v1Gearmotor", label: "NeveRest 3.7 v1 Gearmotor", manufacturer: "AndyMark", modelNumber: "am-3461", gearRatio: 3.7, ticksPerRevolution: 44.4, maxRpm: 1784, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://andymark.com/cdn/shop/files/am-3461b_68781be3-bf2b-4a97-a28f-f668f040c455_1200x1200.jpg?v=1772134656", imageAlt: "AndyMark NeveRest 3.7 to 1 Orbital gear motor", imageSourceLabel: "AndyMark product media", imageMatch: "exact", productUrl: "https://www.andymark.com/products/neverest-orbital-gearmotors" },
  { id: "NeveRest40Gearmotor", label: "NeveRest 40 Gearmotor", manufacturer: "AndyMark", modelNumber: "am-2964a", gearRatio: 40, ticksPerRevolution: 1120, maxRpm: 160, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://andymark.com/cdn/shop/files/am-2964a_1_1200x1200.jpg?v=1749943187", imageAlt: "AndyMark NeveRest Classic 40 gear motor", imageSourceLabel: "AndyMark product media", imageMatch: "exact", productUrl: "https://www.andymark.com/products/neverest-classic-40-gearmotor" },
  { id: "NeveRest60Gearmotor", label: "NeveRest 60 Gearmotor", manufacturer: "AndyMark", modelNumber: "am-3103", gearRatio: 60, ticksPerRevolution: 1680, maxRpm: 105, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://andymark.com/cdn/shop/files/am-3103_1_f5bab635-f7ad-4bd8-9853-4904f5328d84_1200x1200.jpg?v=1772140964", imageAlt: "AndyMark NeveRest Classic 60 gear motor", imageSourceLabel: "AndyMark product media", imageMatch: "exact", productUrl: "https://www.andymark.com/products/neverest-classic-60-gearmotor" },
  { id: "RevRobotics20HDHexMotor", label: "REV HD Hex 20:1", manufacturer: "REV Robotics", modelNumber: "REV-41-1301", gearRatio: 20, ticksPerRevolution: 560, maxRpm: 300, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/594/images/2931/Lone_HDHex-New_Sticker-noflag__98232.1659470612.500.500.png?c=2", imageAlt: "Representative REV HD Hex gear motor", imageSourceLabel: "REV Robotics product media", imageMatch: "family", productUrl: "https://www.revrobotics.com/rev-41-1301/" },
  { id: "RevRobotics40HDHexMotor", label: "REV HD Hex 40:1", manufacturer: "REV Robotics", modelNumber: "REV-41-1301", gearRatio: 40, ticksPerRevolution: 1120, maxRpm: 150, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/594/images/2931/Lone_HDHex-New_Sticker-noflag__98232.1659470612.500.500.png?c=2", imageAlt: "Representative REV HD Hex gear motor", imageSourceLabel: "REV Robotics product media", imageMatch: "family", productUrl: "https://www.revrobotics.com/rev-41-1301/" },
  { id: "RevRoboticsCoreHexMotor", label: "REV Core Hex", manufacturer: "REV Robotics", modelNumber: "REV-41-1300", gearRatio: 36.25, ticksPerRevolution: 288, maxRpm: 137, orientation: "CCW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/195/images/2675/REV-41-1300_Core_Hex5_not_lm__05075.1661790332.500.500.png?c=2", imageAlt: "REV Robotics Core Hex motor", imageSourceLabel: "REV Robotics product media", imageMatch: "exact", productUrl: "https://www.revrobotics.com/rev-41-1300/" },
  { id: "RevRoboticsUltraplanetaryHDHexMotor", label: "REV UltraPlanetary HD Hex", manufacturer: "REV Robotics", modelNumber: "REV-41-1600", gearRatio: 20, ticksPerRevolution: 560, maxRpm: 300, orientation: "CW", achievableMaxRpmFraction: 0.85, imageUrl: "https://cdn11.bigcommerce.com/s-t3eo8vwp22/products/479/images/2739/Ultraplanetary-noflag-FINAL__33728.1650563601.500.500.png?c=2", imageAlt: "REV Robotics UltraPlanetary HD Hex motor", imageSourceLabel: "REV Robotics product media", imageMatch: "exact", productUrl: "https://www.revrobotics.com/rev-41-1600/" },
  { id: "StudicaMaverick", label: "Studica Maverick", manufacturer: "Studica", modelNumber: "75001", gearRatio: 61, ticksPerRevolution: 1464, maxRpm: 100, orientation: "CW", achievableMaxRpmFraction: 0.85, imageUrl: "https://www.robohitec.com/204-large_default/maverick-12v-dc-gear-motor-wencoder.jpg", imageAlt: "Studica Maverick 12V DC gear motor with encoder", imageSourceLabel: "Robo Hitec product media", imageMatch: "exact", productUrl: "https://www.studica.com/maverick-12v-dc-gear-motor-with-encoder" },
] as const satisfies readonly MotorModelProfile[];

export const DEFAULT_MOTOR_MODEL_ID = "RevRobotics20HDHexMotor";

const MOTOR_MODELS_BY_ID = new Map<string, MotorModelProfile>(
  FTC_11_1_MOTOR_MODELS.map((profile) => [profile.id, profile]),
);

export function getMotorModelProfile(id: string): MotorModelProfile | undefined {
  return MOTOR_MODELS_BY_ID.get(id);
}
