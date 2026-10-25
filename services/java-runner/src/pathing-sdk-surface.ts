/** Exact additional SDK contracts exercised by real Pedro and Road Runner localizers. */
export const PATHING_SDK_CLASSES = new Set([
  'com.qualcomm.hardware.lynx.LynxModule',
]);
export const PATHING_SDK_VALUE_CLASSES = new Set([
  'com.qualcomm.hardware.lynx.LynxModule$BulkCachingMode',
  'com.qualcomm.hardware.gobilda.GoBildaPinpointDriver$ReadData',
]);
const PINPOINT = 'com.qualcomm.hardware.gobilda.GoBildaPinpointDriver';
const LYNX = 'com.qualcomm.hardware.lynx.LynxModule';
export const PATHING_SDK_MEMBERS = new Map<string, 'physically-modeled' | 'behaviorally-modeled'>([
  ...[
    ['getLoopTime', '()I'], ['getFrequency', '()D'], ['getEncoderX', '()I'], ['getEncoderY', '()I'],
    ['getXOffset', '(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)F'],
    ['getYOffset', '(Lorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)F'],
    ['setOffsets', '(DDLorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)V'],
    ['setEncoderDirections', '(Lcom/qualcomm/hardware/gobilda/GoBildaPinpointDriver$EncoderDirection;Lcom/qualcomm/hardware/gobilda/GoBildaPinpointDriver$EncoderDirection;)V'],
    ['setEncoderResolution', '(Lcom/qualcomm/hardware/gobilda/GoBildaPinpointDriver$GoBildaOdometryPods;)V'],
    ['setEncoderResolution', '(DLorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)V'],
    ['setPosX', '(DLorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)V'],
    ['setPosY', '(DLorg/firstinspires/ftc/robotcore/external/navigation/DistanceUnit;)V'],
    ['setHeading', '(DLorg/firstinspires/ftc/robotcore/external/navigation/AngleUnit;)V'],
    ['recalibrateIMU', '()V'],
    ['update', '(Lcom/qualcomm/hardware/gobilda/GoBildaPinpointDriver$ReadData;)V'],
  ].map(([name, descriptor]) => [`${PINPOINT}|method|${name}|${descriptor}`, 'behaviorally-modeled'] as const),
  ...[
    ['setBulkCachingMode', '(Lcom/qualcomm/hardware/lynx/LynxModule$BulkCachingMode;)V'],
    ['getBulkCachingMode', '()Lcom/qualcomm/hardware/lynx/LynxModule$BulkCachingMode;'],
    ['clearBulkCache', '()V'], ['getFirmwareVersionString', '()Ljava/lang/String;'],
    ['getNullableFirmwareVersionString', '()Ljava/lang/String;'],
  ].map(([name, descriptor]) => [`${LYNX}|method|${name}|${descriptor}`, 'behaviorally-modeled'] as const),
]);
