/* Sanitized FTC Offline Blocks runtime. Project/sample data was deliberately removed. */
var allHardwareIdentifiers = [
    'ControlHubAsREVModule',
    'ControlHubAsServoController',
    'ControlHubAsVoltageSensor',
    'ExpansionHub2AsREVModule',
    'ExpansionHub2AsServoController',
    'ExpansionHub2AsVoltageSensor',
    'Webcam1AsWebcamName',
    'backLeftAsDcMotor',
    'backRightAsDcMotor',
    'frontLeftAsDcMotor',
    'frontRightAsDcMotor',
    'imuAsIMU',
    'auxMotor1AsDcMotor',
    'auxMotor2AsDcMotor',
  ];

var IDENTIFIERS_USED_PREFIX = '// IDENTIFIERS_USED=';

var XML_END_TAG = '</xml>';
var XML_EXTRA_START = '<?xml version=\'1.0\' encoding=\'UTF-8\' standalone=\'yes\' ?>';

var AUTO_TRANSITION_OPTIONS = [];

var currentGameName = 'DECODE';
var currentGameNameNoSpaces = 'DECODE';

var methodLookupStrings = [
];

function getOctoQuadConstant(constantIdentifier) {
  switch (constantIdentifier) {
    case 'OCTOQUAD_CHIP_ID':
      return '0x51';
    case 'SUPPORTED_FW_VERSION_MAJ':
      return '3';
    case 'ENCODER_FIRST':
      return '0';
    case 'ENCODER_LAST':
      return '7';
    case 'NUM_ENCODERS':
      return '8';
    case 'MIN_VELOCITY_MEASUREMENT_INTERVAL_MS':
      return '1';
    case 'MAX_VELOCITY_MEASUREMENT_INTERVAL_MS':
      return '255';
    case 'MIN_PULSE_WIDTH_US':
      return '0';
    case 'MAX_PULSE_WIDTH_US':
      return '0xFFFF';
  }
  return '';
}

function isValidProjectName(projectName) {
  if (projectName) {
    return /^[a-zA-Z0-9 \!\#\$\%\&\'\(\)\+\,\-\.\;\=\@\[\]\^_\{\}\~]+$/.test(projectName);
  }
  return false;
}

function getSparkFunOTOSConstant(constantIdentifier) {
  switch (constantIdentifier) {
    case 'MIN_SCALAR':
      return '0.872';
    case 'MAX_SCALAR':
      return '1.127';
  }
  return '';
}

function getColorConstant(constantIdentifier) {
  switch (constantIdentifier) {
    case 'BLACK':
      return '0xFF000000';
    case 'BLUE':
      return '0xFF0000FF';
    case 'CYAN':
      return '0xFF00FFFF';
    case 'DKGRAY':
      return '0xFF444444';
    case 'GRAY':
      return '0xFF888888';
    case 'GREEN':
      return '0xFF00FF00';
    case 'LTGRAY':
      return '0xFFCCCCCC';
    case 'MAGENTA':
      return '0xFFFF00FF';
    case 'RED':
      return '0xFFFF0000';
    case 'WHITE':
      return '0xFFFFFFFF';
    case 'YELLOW':
      return '0xFFFFFF00';
  }
  return '';
}

var BLINKIN_PATTERN_TOOLTIPS = [
  ['RAINBOW_RAINBOW_PALETTE', 'The BlinkinPattern value RAINBOW_RAINBOW_PALETTE.'],
  ['RAINBOW_PARTY_PALETTE', 'The BlinkinPattern value RAINBOW_PARTY_PALETTE.'],
  ['RAINBOW_OCEAN_PALETTE', 'The BlinkinPattern value RAINBOW_OCEAN_PALETTE.'],
  ['RAINBOW_LAVA_PALETTE', 'The BlinkinPattern value RAINBOW_LAVA_PALETTE.'],
  ['RAINBOW_FOREST_PALETTE', 'The BlinkinPattern value RAINBOW_FOREST_PALETTE.'],
  ['RAINBOW_WITH_GLITTER', 'The BlinkinPattern value RAINBOW_WITH_GLITTER.'],
  ['CONFETTI', 'The BlinkinPattern value CONFETTI.'],
  ['SHOT_RED', 'The BlinkinPattern value SHOT_RED.'],
  ['SHOT_BLUE', 'The BlinkinPattern value SHOT_BLUE.'],
  ['SHOT_WHITE', 'The BlinkinPattern value SHOT_WHITE.'],
  ['SINELON_RAINBOW_PALETTE', 'The BlinkinPattern value SINELON_RAINBOW_PALETTE.'],
  ['SINELON_PARTY_PALETTE', 'The BlinkinPattern value SINELON_PARTY_PALETTE.'],
  ['SINELON_OCEAN_PALETTE', 'The BlinkinPattern value SINELON_OCEAN_PALETTE.'],
  ['SINELON_LAVA_PALETTE', 'The BlinkinPattern value SINELON_LAVA_PALETTE.'],
  ['SINELON_FOREST_PALETTE', 'The BlinkinPattern value SINELON_FOREST_PALETTE.'],
  ['BEATS_PER_MINUTE_RAINBOW_PALETTE', 'The BlinkinPattern value BEATS_PER_MINUTE_RAINBOW_PALETTE.'],
  ['BEATS_PER_MINUTE_PARTY_PALETTE', 'The BlinkinPattern value BEATS_PER_MINUTE_PARTY_PALETTE.'],
  ['BEATS_PER_MINUTE_OCEAN_PALETTE', 'The BlinkinPattern value BEATS_PER_MINUTE_OCEAN_PALETTE.'],
  ['BEATS_PER_MINUTE_LAVA_PALETTE', 'The BlinkinPattern value BEATS_PER_MINUTE_LAVA_PALETTE.'],
  ['BEATS_PER_MINUTE_FOREST_PALETTE', 'The BlinkinPattern value BEATS_PER_MINUTE_FOREST_PALETTE.'],
  ['FIRE_MEDIUM', 'The BlinkinPattern value FIRE_MEDIUM.'],
  ['FIRE_LARGE', 'The BlinkinPattern value FIRE_LARGE.'],
  ['TWINKLES_RAINBOW_PALETTE', 'The BlinkinPattern value TWINKLES_RAINBOW_PALETTE.'],
  ['TWINKLES_PARTY_PALETTE', 'The BlinkinPattern value TWINKLES_PARTY_PALETTE.'],
  ['TWINKLES_OCEAN_PALETTE', 'The BlinkinPattern value TWINKLES_OCEAN_PALETTE.'],
  ['TWINKLES_LAVA_PALETTE', 'The BlinkinPattern value TWINKLES_LAVA_PALETTE.'],
  ['TWINKLES_FOREST_PALETTE', 'The BlinkinPattern value TWINKLES_FOREST_PALETTE.'],
  ['COLOR_WAVES_RAINBOW_PALETTE', 'The BlinkinPattern value COLOR_WAVES_RAINBOW_PALETTE.'],
  ['COLOR_WAVES_PARTY_PALETTE', 'The BlinkinPattern value COLOR_WAVES_PARTY_PALETTE.'],
  ['COLOR_WAVES_OCEAN_PALETTE', 'The BlinkinPattern value COLOR_WAVES_OCEAN_PALETTE.'],
  ['COLOR_WAVES_LAVA_PALETTE', 'The BlinkinPattern value COLOR_WAVES_LAVA_PALETTE.'],
  ['COLOR_WAVES_FOREST_PALETTE', 'The BlinkinPattern value COLOR_WAVES_FOREST_PALETTE.'],
  ['LARSON_SCANNER_RED', 'The BlinkinPattern value LARSON_SCANNER_RED.'],
  ['LARSON_SCANNER_GRAY', 'The BlinkinPattern value LARSON_SCANNER_GRAY.'],
  ['LIGHT_CHASE_RED', 'The BlinkinPattern value LIGHT_CHASE_RED.'],
  ['LIGHT_CHASE_BLUE', 'The BlinkinPattern value LIGHT_CHASE_BLUE.'],
  ['LIGHT_CHASE_GRAY', 'The BlinkinPattern value LIGHT_CHASE_GRAY.'],
  ['HEARTBEAT_RED', 'The BlinkinPattern value HEARTBEAT_RED.'],
  ['HEARTBEAT_BLUE', 'The BlinkinPattern value HEARTBEAT_BLUE.'],
  ['HEARTBEAT_WHITE', 'The BlinkinPattern value HEARTBEAT_WHITE.'],
  ['HEARTBEAT_GRAY', 'The BlinkinPattern value HEARTBEAT_GRAY.'],
  ['BREATH_RED', 'The BlinkinPattern value BREATH_RED.'],
  ['BREATH_BLUE', 'The BlinkinPattern value BREATH_BLUE.'],
  ['BREATH_GRAY', 'The BlinkinPattern value BREATH_GRAY.'],
  ['STROBE_RED', 'The BlinkinPattern value STROBE_RED.'],
  ['STROBE_BLUE', 'The BlinkinPattern value STROBE_BLUE.'],
  ['STROBE_GOLD', 'The BlinkinPattern value STROBE_GOLD.'],
  ['STROBE_WHITE', 'The BlinkinPattern value STROBE_WHITE.'],
  ['CP1_END_TO_END_BLEND_TO_BLACK', 'The BlinkinPattern value CP1_END_TO_END_BLEND_TO_BLACK.'],
  ['CP1_LARSON_SCANNER', 'The BlinkinPattern value CP1_LARSON_SCANNER.'],
  ['CP1_LIGHT_CHASE', 'The BlinkinPattern value CP1_LIGHT_CHASE.'],
  ['CP1_HEARTBEAT_SLOW', 'The BlinkinPattern value CP1_HEARTBEAT_SLOW.'],
  ['CP1_HEARTBEAT_MEDIUM', 'The BlinkinPattern value CP1_HEARTBEAT_MEDIUM.'],
  ['CP1_HEARTBEAT_FAST', 'The BlinkinPattern value CP1_HEARTBEAT_FAST.'],
  ['CP1_BREATH_SLOW', 'The BlinkinPattern value CP1_BREATH_SLOW.'],
  ['CP1_BREATH_FAST', 'The BlinkinPattern value CP1_BREATH_FAST.'],
  ['CP1_SHOT', 'The BlinkinPattern value CP1_SHOT.'],
  ['CP1_STROBE', 'The BlinkinPattern value CP1_STROBE.'],
  ['CP2_END_TO_END_BLEND_TO_BLACK', 'The BlinkinPattern value CP2_END_TO_END_BLEND_TO_BLACK.'],
  ['CP2_LARSON_SCANNER', 'The BlinkinPattern value CP2_LARSON_SCANNER.'],
  ['CP2_LIGHT_CHASE', 'The BlinkinPattern value CP2_LIGHT_CHASE.'],
  ['CP2_HEARTBEAT_SLOW', 'The BlinkinPattern value CP2_HEARTBEAT_SLOW.'],
  ['CP2_HEARTBEAT_MEDIUM', 'The BlinkinPattern value CP2_HEARTBEAT_MEDIUM.'],
  ['CP2_HEARTBEAT_FAST', 'The BlinkinPattern value CP2_HEARTBEAT_FAST.'],
  ['CP2_BREATH_SLOW', 'The BlinkinPattern value CP2_BREATH_SLOW.'],
  ['CP2_BREATH_FAST', 'The BlinkinPattern value CP2_BREATH_FAST.'],
  ['CP2_SHOT', 'The BlinkinPattern value CP2_SHOT.'],
  ['CP2_STROBE', 'The BlinkinPattern value CP2_STROBE.'],
  ['CP1_2_SPARKLE_1_ON_2', 'The BlinkinPattern value CP1_2_SPARKLE_1_ON_2.'],
  ['CP1_2_SPARKLE_2_ON_1', 'The BlinkinPattern value CP1_2_SPARKLE_2_ON_1.'],
  ['CP1_2_COLOR_GRADIENT', 'The BlinkinPattern value CP1_2_COLOR_GRADIENT.'],
  ['CP1_2_BEATS_PER_MINUTE', 'The BlinkinPattern value CP1_2_BEATS_PER_MINUTE.'],
  ['CP1_2_END_TO_END_BLEND_1_TO_2', 'The BlinkinPattern value CP1_2_END_TO_END_BLEND_1_TO_2.'],
  ['CP1_2_END_TO_END_BLEND', 'The BlinkinPattern value CP1_2_END_TO_END_BLEND.'],
  ['CP1_2_NO_BLENDING', 'The BlinkinPattern value CP1_2_NO_BLENDING.'],
  ['CP1_2_TWINKLES', 'The BlinkinPattern value CP1_2_TWINKLES.'],
  ['CP1_2_COLOR_WAVES', 'The BlinkinPattern value CP1_2_COLOR_WAVES.'],
  ['CP1_2_SINELON', 'The BlinkinPattern value CP1_2_SINELON.'],
  ['HOT_PINK', 'The BlinkinPattern value HOT_PINK.'],
  ['DARK_RED', 'The BlinkinPattern value DARK_RED.'],
  ['RED', 'The BlinkinPattern value RED.'],
  ['RED_ORANGE', 'The BlinkinPattern value RED_ORANGE.'],
  ['ORANGE', 'The BlinkinPattern value ORANGE.'],
  ['GOLD', 'The BlinkinPattern value GOLD.'],
  ['YELLOW', 'The BlinkinPattern value YELLOW.'],
  ['LAWN_GREEN', 'The BlinkinPattern value LAWN_GREEN.'],
  ['LIME', 'The BlinkinPattern value LIME.'],
  ['DARK_GREEN', 'The BlinkinPattern value DARK_GREEN.'],
  ['GREEN', 'The BlinkinPattern value GREEN.'],
  ['BLUE_GREEN', 'The BlinkinPattern value BLUE_GREEN.'],
  ['AQUA', 'The BlinkinPattern value AQUA.'],
  ['SKY_BLUE', 'The BlinkinPattern value SKY_BLUE.'],
  ['DARK_BLUE', 'The BlinkinPattern value DARK_BLUE.'],
  ['BLUE', 'The BlinkinPattern value BLUE.'],
  ['BLUE_VIOLET', 'The BlinkinPattern value BLUE_VIOLET.'],
  ['VIOLET', 'The BlinkinPattern value VIOLET.'],
  ['WHITE', 'The BlinkinPattern value WHITE.'],
  ['GRAY', 'The BlinkinPattern value GRAY.'],
  ['DARK_GRAY', 'The BlinkinPattern value DARK_GRAY.'],
];

var BLINKIN_PATTERN_FROM_TEXT_TOOLTIP =
    'Returns the pattern associated with the given text. Valid input is ' +
    'RAINBOW_RAINBOW_PALETTE, ' +
    'RAINBOW_PARTY_PALETTE, ' +
    'RAINBOW_OCEAN_PALETTE, ' +
    'RAINBOW_LAVA_PALETTE, ' +
    'RAINBOW_FOREST_PALETTE, ' +
    'RAINBOW_WITH_GLITTER, ' +
    'CONFETTI, ' +
    'SHOT_RED, ' +
    'SHOT_BLUE, ' +
    'SHOT_WHITE, ' +
    'SINELON_RAINBOW_PALETTE, ' +
    'SINELON_PARTY_PALETTE, ' +
    'SINELON_OCEAN_PALETTE, ' +
    'SINELON_LAVA_PALETTE, ' +
    'SINELON_FOREST_PALETTE, ' +
    'BEATS_PER_MINUTE_RAINBOW_PALETTE, ' +
    'BEATS_PER_MINUTE_PARTY_PALETTE, ' +
    'BEATS_PER_MINUTE_OCEAN_PALETTE, ' +
    'BEATS_PER_MINUTE_LAVA_PALETTE, ' +
    'BEATS_PER_MINUTE_FOREST_PALETTE, ' +
    'FIRE_MEDIUM, ' +
    'FIRE_LARGE, ' +
    'TWINKLES_RAINBOW_PALETTE, ' +
    'TWINKLES_PARTY_PALETTE, ' +
    'TWINKLES_OCEAN_PALETTE, ' +
    'TWINKLES_LAVA_PALETTE, ' +
    'TWINKLES_FOREST_PALETTE, ' +
    'COLOR_WAVES_RAINBOW_PALETTE, ' +
    'COLOR_WAVES_PARTY_PALETTE, ' +
    'COLOR_WAVES_OCEAN_PALETTE, ' +
    'COLOR_WAVES_LAVA_PALETTE, ' +
    'COLOR_WAVES_FOREST_PALETTE, ' +
    'LARSON_SCANNER_RED, ' +
    'LARSON_SCANNER_GRAY, ' +
    'LIGHT_CHASE_RED, ' +
    'LIGHT_CHASE_BLUE, ' +
    'LIGHT_CHASE_GRAY, ' +
    'HEARTBEAT_RED, ' +
    'HEARTBEAT_BLUE, ' +
    'HEARTBEAT_WHITE, ' +
    'HEARTBEAT_GRAY, ' +
    'BREATH_RED, ' +
    'BREATH_BLUE, ' +
    'BREATH_GRAY, ' +
    'STROBE_RED, ' +
    'STROBE_BLUE, ' +
    'STROBE_GOLD, ' +
    'STROBE_WHITE, ' +
    'CP1_END_TO_END_BLEND_TO_BLACK, ' +
    'CP1_LARSON_SCANNER, ' +
    'CP1_LIGHT_CHASE, ' +
    'CP1_HEARTBEAT_SLOW, ' +
    'CP1_HEARTBEAT_MEDIUM, ' +
    'CP1_HEARTBEAT_FAST, ' +
    'CP1_BREATH_SLOW, ' +
    'CP1_BREATH_FAST, ' +
    'CP1_SHOT, ' +
    'CP1_STROBE, ' +
    'CP2_END_TO_END_BLEND_TO_BLACK, ' +
    'CP2_LARSON_SCANNER, ' +
    'CP2_LIGHT_CHASE, ' +
    'CP2_HEARTBEAT_SLOW, ' +
    'CP2_HEARTBEAT_MEDIUM, ' +
    'CP2_HEARTBEAT_FAST, ' +
    'CP2_BREATH_SLOW, ' +
    'CP2_BREATH_FAST, ' +
    'CP2_SHOT, ' +
    'CP2_STROBE, ' +
    'CP1_2_SPARKLE_1_ON_2, ' +
    'CP1_2_SPARKLE_2_ON_1, ' +
    'CP1_2_COLOR_GRADIENT, ' +
    'CP1_2_BEATS_PER_MINUTE, ' +
    'CP1_2_END_TO_END_BLEND_1_TO_2, ' +
    'CP1_2_END_TO_END_BLEND, ' +
    'CP1_2_NO_BLENDING, ' +
    'CP1_2_TWINKLES, ' +
    'CP1_2_COLOR_WAVES, ' +
    'CP1_2_SINELON, ' +
    'HOT_PINK, ' +
    'DARK_RED, ' +
    'RED, ' +
    'RED_ORANGE, ' +
    'ORANGE, ' +
    'GOLD, ' +
    'YELLOW, ' +
    'LAWN_GREEN, ' +
    'LIME, ' +
    'DARK_GREEN, ' +
    'GREEN, ' +
    'BLUE_GREEN, ' +
    'AQUA, ' +
    'SKY_BLUE, ' +
    'DARK_BLUE, ' +
    'BLUE, ' +
    'BLUE_VIOLET, ' +
    'VIOLET, ' +
    'WHITE, ' +
    'GRAY, ' +
    'DARK_GRAY, ' +
    'or BLACK.';

function createLanguageCodeDropdown() {
  var CHOICES = [
      ['en', 'en'],
  ];
  return createFieldDropdown(CHOICES);
}

var LANGUAGE_CODE_TOOLTIPS = [
  ['en', 'The language code for English.'],
];

function createCountryCodeDropdown() {
  var CHOICES = [
      ['US', 'US'],
  ];
  return createFieldDropdown(CHOICES);
}

var COUNTRY_CODE_TOOLTIPS = [
  ['US', 'The country code for United States.'],
];

function createSkyStoneSoundResourceDropdown() {
  var CHOICES = [
      ['ss_alarm', 'ss_alarm'],
      ['ss_bb8_down', 'ss_bb8_down'],
      ['ss_bb8_up', 'ss_bb8_up'],
      ['ss_darth_vader', 'ss_darth_vader'],
      ['ss_fly_by', 'ss_fly_by'],
      ['ss_laser', 'ss_laser'],
      ['ss_laser_burst', 'ss_laser_burst'],
      ['ss_light_saber', 'ss_light_saber'],
      ['ss_light_saber_long', 'ss_light_saber_long'],
      ['ss_light_saber_short', 'ss_light_saber_short'],
      ['ss_light_speed', 'ss_light_speed'],
      ['ss_mf_fail', 'ss_mf_fail'],
      ['ss_mine', 'ss_mine'],
      ['ss_power_up', 'ss_power_up'],
      ['ss_r2d2_up', 'ss_r2d2_up'],
      ['ss_roger_roger', 'ss_roger_roger'],
      ['ss_siren', 'ss_siren'],
      ['ss_wookie', 'ss_wookie'],
  ];
  return createFieldDropdown(CHOICES);
}

var SKY_STONE_SOUND_RESOURCE_TOOLTIPS = [
  ['ss_alarm', 'The SoundResource value ss_alarm.'],
  ['ss_bb8_down', 'The SoundResource value ss_bb8_down.'],
  ['ss_bb8_up', 'The SoundResource value ss_bb8_up.'],
  ['ss_darth_vader', 'The SoundResource value ss_darth_vader.'],
  ['ss_fly_by', 'The SoundResource value ss_fly_by.'],
  ['ss_laser', 'The SoundResource value ss_laser.'],
  ['ss_laser_burst', 'The SoundResource value ss_laser_burst.'],
  ['ss_light_saber', 'The SoundResource value ss_light_saber.'],
  ['ss_light_saber_long', 'The SoundResource value ss_light_saber_long.'],
  ['ss_light_saber_short', 'The SoundResource value ss_light_saber_short.'],
  ['ss_light_speed', 'The SoundResource value ss_light_speed.'],
  ['ss_mf_fail', 'The SoundResource value ss_mf_fail.'],
  ['ss_mine', 'The SoundResource value ss_mine.'],
  ['ss_power_up', 'The SoundResource value ss_power_up.'],
  ['ss_r2d2_up', 'The SoundResource value ss_r2d2_up.'],
  ['ss_roger_roger', 'The SoundResource value ss_roger_roger.'],
  ['ss_siren', 'The SoundResource value ss_siren.'],
  ['ss_wookie', 'The SoundResource value ss_wookie.'],
];

var androidSoundPoolRawResPrefix = 'RawRes:';
var accelerationIdentifierForJavaScript = 'accelerationAccess';
var androidAccelerometerIdentifierForJavaScript = 'androidAccelerometerAccess';
var androidAccelerometerIdentifierForFtcJava = 'androidAccelerometer';
var androidGyroscopeIdentifierForJavaScript = 'androidGyroscopeAccess';
var androidGyroscopeIdentifierForFtcJava = 'androidGyroscope';
var androidOrientationIdentifierForJavaScript = 'androidOrientationAccess';
var androidOrientationIdentifierForFtcJava = 'androidOrientation';
var androidSoundPoolIdentifierForJavaScript = 'androidSoundPoolAccess';
var androidSoundPoolIdentifierForFtcJava = 'androidSoundPool';
var androidTextToSpeechIdentifierForJavaScript = 'androidTextToSpeechAccess';
var androidTextToSpeechIdentifierForFtcJava = 'androidTextToSpeech';
var andyMarkImuOrientationOnRobotIdentifierForJavaScript = 'andyMarkImuOrientationOnRobotAccess';
var angularVelocityIdentifierForJavaScript = 'angularVelocityAccess';
var aprilTagIdentifierForJavaScript = 'aprilTagAccess';
var blackboardIdentifierForJavaScript = 'blackboard';
var blinkinPatternIdentifierForJavaScript = 'blinkinPatternAccess';
var bno055imuParametersIdentifierForJavaScript = 'bno055imuParametersAccess';
var colorIdentifierForJavaScript = 'colorAccess';
var colorBlobLocatorIdentifierForJavaScript = 'colorBlobLocatorAccess';
var dbgLogIdentifierForJavaScript = 'dbgLogAccess';
var elapsedTimeIdentifierForJavaScript = 'elapsedTimeAccess';
var exposureControlIdentifierForJavaScript = 'exposureControlAccess';
var focusControlIdentifierForJavaScript = 'focusControlAccess';
var gainControlIdentifierForJavaScript = 'gainControlAccess';
var imuParametersIdentifierForJavaScript = 'imuParametersAccess';
var ledEffectIdentifierForJavaScript = 'ledEffectAccess';
var llResultIdentifierForJavaScript = 'llResultAccess';
var llStatusIdentifierForJavaScript = 'llStatusAccess';
var linearOpModeIdentifierForJavaScript = 'linearOpMode';
var magneticFluxIdentifierForJavaScript = 'magneticFluxAccess';
var matrixFIdentifierForJavaScript = 'matrixFAccess';
var miscIdentifierForJavaScript = 'miscAccess';
var navigationIdentifierForJavaScript = 'navigationAccess';
var opencvIdentifierForJavaScript = 'opencvAccess';
var openGLMatrixIdentifierForJavaScript = 'openGLMatrixAccess';
var orientationIdentifierForJavaScript = 'orientationAccess';
var pidfCoefficientsIdentifierForJavaScript = 'pidfCoefficientsAccess';
var pose2DIdentifierForJavaScript = 'pose2DAccess';
var positionIdentifierForJavaScript = 'positionAccess';
var predominantColorIdentifierForJavaScript = 'predominantColorAccess';
var ptzControlIdentifierForJavaScript = 'ptzControlAccess';
var quaternionIdentifierForJavaScript = 'quaternionAccess';
var rangeIdentifierForJavaScript = 'rangeAccess';
var revHubOrientationOnRobotIdentifierForJavaScript = 'revHubOrientationOnRobotAccess';
var rev9AxisImuOrientationOnRobotIdentifierForJavaScript = 'rev9AxisImuOrientationOnRobotAccess';
var rumbleEffectIdentifierForJavaScript = 'rumbleEffectAccess';
var systemIdentifierForJavaScript = 'systemAccess';
var telemetryIdentifierForJavaScript = 'telemetry';
var temperatureIdentifierForJavaScript = 'temperatureAccess';
var vectorFIdentifierForJavaScript = 'vectorFAccess';
var velocityIdentifierForJavaScript = 'velocityAccess';
var visionPortalIdentifierForJavaScript = 'visionPortalAccess';
var whiteBalanceControlIdentifierForJavaScript = 'whiteBalanceControlAccess';
var yawPitchRollAnglesIdentifierForJavaScript = 'yawPitchRollAnglesAccess';
var tensorFlowIdentifierForJavaScript = 'tensorFlowAccess';
var tfodIdentifierForJavaScript = 'tfodAccess';
var tfodIdentifierForFtcJava = 'tfod';
var tfodCustomModelIdentifierForJavaScript = 'tfodCustomModelAccess';
var tfodCustomModelIdentifierForFtcJava = 'tfodCustomModel';
var tfodCurrentGameIdentifierForJavaScript = 'tfodCurrentGameAccess';
var tfodCurrentGameIdentifierForFtcJava = 'tfodPOWERPLAY';
var tfodRoverRuckusIdentifierForJavaScript = 'tfodRoverRuckusAccess';
var tfodRoverRuckusIdentifierForFtcJava = 'tfodRoverRuckus';
var tfodSkyStoneIdentifierForJavaScript = 'tfodSkyStoneAccess';
var tfodSkyStoneIdentifierForFtcJava = 'tfodSkyStone';
var vuforiaCurrentGameIdentifierForJavaScript = 'vuforiaCurrentGameAccess';
var vuforiaCurrentGameIdentifierForFtcJava = 'vuforiaPOWERPLAY';
var vuforiaIdentifierForJavaScript = 'vuforiaAccess';
var vuforiaRelicRecoveryIdentifierForFtcJava = 'vuforiaRelicRecovery';
var vuforiaRoverRuckusIdentifierForJavaScript = 'vuforiaRoverRuckusAccess';
var vuforiaRoverRuckusIdentifierForFtcJava = 'vuforiaRoverRuckus';
var vuforiaSkyStoneIdentifierForJavaScript = 'vuforiaSkyStoneAccess';
var vuforiaSkyStoneIdentifierForFtcJava = 'vuforiaSkyStone';
var vuforiaLocalizerIdentifierForJavaScript = 'vuforiaLocalizerAccess';
var vuforiaLocalizerParametersIdentifierForJavaScript = 'vuforiaLocalizerParametersAccess';
var vuforiaTrackableIdentifierForJavaScript = 'vuforiaTrackableAccess';
var vuforiaTrackableDefaultListenerIdentifierForJavaScript = 'vuforiaTrackableDefaultListenerAccess';
var vuforiaTrackablesIdentifierForJavaScript = 'vuforiaTrackablesAccess';

function createWebcamDeviceNameDropdown() {
  var CHOICES = [
    ['Webcam 1', 'Webcam 1'],
  ];
  return createFieldDropdown(CHOICES);
}

function createAccelerationSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createAnalogInputDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createAndyMarkColorSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createBNO055IMUDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createColorRangeSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createColorSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createCompassSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createCRServoDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createDcMotorDropdown() {
  var CHOICES = [
      ['backLeft', 'backLeftAsDcMotor'],
      ['backRight', 'backRightAsDcMotor'],
      ['frontLeft', 'frontLeftAsDcMotor'],
      ['frontRight', 'frontRightAsDcMotor'],
      ['auxMotor1', 'auxMotor1AsDcMotor'],
      ['auxMotor2', 'auxMotor2AsDcMotor'],
  ];
  return createFieldDropdown(CHOICES);
}

function createDcMotorExDropdown() {
  var CHOICES = [
      ['backLeft', 'backLeftAsDcMotor'],
      ['backRight', 'backRightAsDcMotor'],
      ['frontLeft', 'frontLeftAsDcMotor'],
      ['frontRight', 'frontRightAsDcMotor'],
      ['auxMotor1', 'auxMotor1AsDcMotor'],
      ['auxMotor2', 'auxMotor2AsDcMotor'],
  ];
  return createFieldDropdown(CHOICES);
}

function createDigitalChannelDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createDistanceSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createGoBildaPinpointDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createGyroSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createHuskyLensDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createImuDropdown() {
  var CHOICES = [
      ['imu', 'imuAsIMU'],
  ];
  return createFieldDropdown(CHOICES);
}

function createIrSeekerSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createLedDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createLightSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createLimelight3ADropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createMaxSonarI2CXLDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createMrI2cCompassSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createMrI2cRangeSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createOctoQuadDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createOpticalDistanceSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createRevBlinkinLedDriverDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createServoDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createServoControllerDropdown() {
  var CHOICES = [
      ['Control Hub', 'ControlHubAsServoController'],
      ['Expansion Hub 2', 'ExpansionHub2AsServoController'],
  ];
  return createFieldDropdown(CHOICES);
}

function createSparkFunLEDStickDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createSparkFunOTOSDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createTouchSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createUltrasonicSensorDropdown() {
  var CHOICES = [
  ];
  return createFieldDropdown(CHOICES);
}

function createVoltageSensorDropdown() {
  var CHOICES = [
      ['Control Hub', 'ControlHubAsVoltageSensor'],
      ['Expansion Hub 2', 'ExpansionHub2AsVoltageSensor'],
  ];
  return createFieldDropdown(CHOICES);
}

function getHardwareIdentifierSuffixes() {
  var suffixes = [
    'AsAccelerationSensor',
    'AsAnalogInput',
    'AsAndyMarkColorSensor',
    'AsBNO055IMU',
    'AsREVColorRangeSensor',
    'AsColorSensor',
    'AsCompassSensor',
    'AsCRServo',
    'AsDcMotor',
    'AsDigitalChannel',
    'AsDistanceSensor',
    'AsGoBildaPinpoint',
    'AsGyroSensor',
    'AsHuskyLens',
    'AsIMU',
    'AsIrSeekerSensor',
    'AsLED',
    'AsLightSensor',
    'AsLimelight3A',
    'AsREVModule',
    'AsMaxSonarI2CXL',
    'AsMrI2cCompassSensor',
    'AsMrI2cRangeSensor',
    'AsOctoQuad',
    'AsOpticalDistanceSensor',
    'AsRevBlinkinLedDriver',
    'AsServo',
    'AsServoController',
    'AsSparkFunLEDStick',
    'AsSparkFunOTOS',
    'AsTouchSensor',
    'AsUltrasonicSensor',
    'AsVoltageSensor',
    'AsWebcamName',
  ];
  return suffixes;
}

function addReservedWordsForJavaScript() {
  Blockly.JavaScript.addReservedWords('ControlHubAsREVModule');
  Blockly.JavaScript.addReservedWords('ControlHubAsServoController');
  Blockly.JavaScript.addReservedWords('ControlHubAsVoltageSensor');
  Blockly.JavaScript.addReservedWords('ExpansionHub2AsREVModule');
  Blockly.JavaScript.addReservedWords('ExpansionHub2AsServoController');
  Blockly.JavaScript.addReservedWords('ExpansionHub2AsVoltageSensor');
  Blockly.JavaScript.addReservedWords('Webcam1AsWebcamName');
  Blockly.JavaScript.addReservedWords('backLeftAsDcMotor');
  Blockly.JavaScript.addReservedWords('backRightAsDcMotor');
  Blockly.JavaScript.addReservedWords('frontLeftAsDcMotor');
  Blockly.JavaScript.addReservedWords('frontRightAsDcMotor');
  Blockly.JavaScript.addReservedWords('imuAsIMU');
  Blockly.JavaScript.addReservedWords('auxMotor1AsDcMotor');
  Blockly.JavaScript.addReservedWords('auxMotor2AsDcMotor');
  Blockly.JavaScript.addReservedWords('accelerationAccess');
  Blockly.JavaScript.addReservedWords('androidAccelerometerAccess');
  Blockly.JavaScript.addReservedWords('androidGyroscopeAccess');
  Blockly.JavaScript.addReservedWords('androidOrientationAccess');
  Blockly.JavaScript.addReservedWords('androidSoundPoolAccess');
  Blockly.JavaScript.addReservedWords('androidTextToSpeechAccess');
  Blockly.JavaScript.addReservedWords('andyMarkImuOrientationOnRobotAccess');
  Blockly.JavaScript.addReservedWords('angularVelocityAccess');
  Blockly.JavaScript.addReservedWords('aprilTagAccess');
  Blockly.JavaScript.addReservedWords('blackboard');
  Blockly.JavaScript.addReservedWords('blinkinPatternAccess');
  Blockly.JavaScript.addReservedWords('blocksOpMode');
  Blockly.JavaScript.addReservedWords('bno055imuParametersAccess');
  Blockly.JavaScript.addReservedWords('colorAccess');
  Blockly.JavaScript.addReservedWords('colorBlobLocatorAccess');
  Blockly.JavaScript.addReservedWords('dbgLogAccess');
  Blockly.JavaScript.addReservedWords('elapsedTimeAccess');
  Blockly.JavaScript.addReservedWords('exposureControlAccess');
  Blockly.JavaScript.addReservedWords('focusControlAccess');
  Blockly.JavaScript.addReservedWords('gainControlAccess');
  Blockly.JavaScript.addReservedWords('gamepad1');
  Blockly.JavaScript.addReservedWords('gamepad2');
  Blockly.JavaScript.addReservedWords('imuParametersAccess');
  Blockly.JavaScript.addReservedWords('ledEffectAccess');
  Blockly.JavaScript.addReservedWords('linearOpMode');
  Blockly.JavaScript.addReservedWords('llResultAccess');
  Blockly.JavaScript.addReservedWords('llStatusAccess');
  Blockly.JavaScript.addReservedWords('magneticFluxAccess');
  Blockly.JavaScript.addReservedWords('matrixFAccess');
  Blockly.JavaScript.addReservedWords('miscAccess');
  Blockly.JavaScript.addReservedWords('navigationAccess');
  Blockly.JavaScript.addReservedWords('openGLMatrixAccess');
  Blockly.JavaScript.addReservedWords('opencvAccess');
  Blockly.JavaScript.addReservedWords('orientationAccess');
  Blockly.JavaScript.addReservedWords('pidfCoefficientsAccess');
  Blockly.JavaScript.addReservedWords('pose2DAccess');
  Blockly.JavaScript.addReservedWords('positionAccess');
  Blockly.JavaScript.addReservedWords('predominantColorAccess');
  Blockly.JavaScript.addReservedWords('ptzControlAccess');
  Blockly.JavaScript.addReservedWords('quaternionAccess');
  Blockly.JavaScript.addReservedWords('rangeAccess');
  Blockly.JavaScript.addReservedWords('rev9AxisImuOrientationOnRobotAccess');
  Blockly.JavaScript.addReservedWords('revHubOrientationOnRobotAccess');
  Blockly.JavaScript.addReservedWords('rumbleEffectAccess');
  Blockly.JavaScript.addReservedWords('systemAccess');
  Blockly.JavaScript.addReservedWords('telemetry');
  Blockly.JavaScript.addReservedWords('temperatureAccess');
  Blockly.JavaScript.addReservedWords('tensorFlowAccess');
  Blockly.JavaScript.addReservedWords('tfodAccess');
  Blockly.JavaScript.addReservedWords('tfodCurrentGameAccess');
  Blockly.JavaScript.addReservedWords('tfodCustomModelAccess');
  Blockly.JavaScript.addReservedWords('tfodRoverRuckusAccess');
  Blockly.JavaScript.addReservedWords('tfodSkyStoneAccess');
  Blockly.JavaScript.addReservedWords('vectorFAccess');
  Blockly.JavaScript.addReservedWords('velocityAccess');
  Blockly.JavaScript.addReservedWords('visionPortalAccess');
  Blockly.JavaScript.addReservedWords('vuforiaAccess');
  Blockly.JavaScript.addReservedWords('vuforiaCurrentGameAccess');
  Blockly.JavaScript.addReservedWords('vuforiaLocalizerAccess');
  Blockly.JavaScript.addReservedWords('vuforiaLocalizerParametersAccess');
  Blockly.JavaScript.addReservedWords('vuforiaRoverRuckusAccess');
  Blockly.JavaScript.addReservedWords('vuforiaSkyStoneAccess');
  Blockly.JavaScript.addReservedWords('vuforiaTrackableAccess');
  Blockly.JavaScript.addReservedWords('vuforiaTrackableDefaultListenerAccess');
  Blockly.JavaScript.addReservedWords('vuforiaTrackablesAccess');
  Blockly.JavaScript.addReservedWords('whiteBalanceControlAccess');
  Blockly.JavaScript.addReservedWords('yawPitchRollAnglesAccess');
}

function getHardwareItemDeviceName(identifier) {
  switch (identifier) {
    case 'ControlHubAsREVModule':
      return 'Control Hub';
    case 'ControlHubAsServoController':
      return 'Control Hub';
    case 'ControlHubAsVoltageSensor':
      return 'Control Hub';
    case 'ExpansionHub2AsREVModule':
      return 'Expansion Hub 2';
    case 'ExpansionHub2AsServoController':
      return 'Expansion Hub 2';
    case 'ExpansionHub2AsVoltageSensor':
      return 'Expansion Hub 2';
    case 'Webcam1AsWebcamName':
      return 'Webcam 1';
    case 'backLeftAsDcMotor':
      return 'backLeft';
    case 'backRightAsDcMotor':
      return 'backRight';
    case 'frontLeftAsDcMotor':
      return 'frontLeft';
    case 'frontRightAsDcMotor':
      return 'frontRight';
    case 'imuAsIMU':
      return 'imu';
    case 'auxMotor1AsDcMotor':
      return 'auxMotor1';
    case 'auxMotor2AsDcMotor':
      return 'auxMotor2';
  }
  throw 'Unexpected identifier (' + identifier + ').';
}

function getHardwareItemIdentifierForFtcJava(identifier) {
  switch (identifier) {
    case 'ControlHubAsREVModule':
      return 'ControlHub';
    case 'ControlHubAsServoController':
      return 'ControlHub_ServoController';
    case 'ControlHubAsVoltageSensor':
      return 'ControlHub_VoltageSensor';
    case 'ExpansionHub2AsREVModule':
      return 'ExpansionHub2';
    case 'ExpansionHub2AsServoController':
      return 'ExpansionHub2_ServoController';
    case 'ExpansionHub2AsVoltageSensor':
      return 'ExpansionHub2_VoltageSensor';
    case 'Webcam1AsWebcamName':
      return 'Webcam1';
    case 'backLeftAsDcMotor':
      return 'backLeft';
    case 'backRightAsDcMotor':
      return 'backRight';
    case 'frontLeftAsDcMotor':
      return 'frontLeft';
    case 'frontRightAsDcMotor':
      return 'frontRight';
    case 'imuAsIMU':
      return 'imu';
    case 'auxMotor1AsDcMotor':
      return 'auxMotor1';
    case 'auxMotor2AsDcMotor':
      return 'auxMotor2';
  }
  throw 'Unexpected identifier (' + identifier + ').';
}

function addReservedWordsForFtcJava() {
  Blockly.FtcJava.addReservedWords('AbstractMethodError');
  Blockly.FtcJava.addReservedWords('Acceleration');
  Blockly.FtcJava.addReservedWords('AccelerationSensor');
  Blockly.FtcJava.addReservedWords('AnalogInput');
  Blockly.FtcJava.addReservedWords('AndroidAccelerometer');
  Blockly.FtcJava.addReservedWords('AndroidGyroscope');
  Blockly.FtcJava.addReservedWords('AndroidOrientation');
  Blockly.FtcJava.addReservedWords('AndroidSoundPool');
  Blockly.FtcJava.addReservedWords('AndroidTextToSpeech');
  Blockly.FtcJava.addReservedWords('AndyMarkColorSensor');
  Blockly.FtcJava.addReservedWords('AndyMarkIMU');
  Blockly.FtcJava.addReservedWords('AndyMarkIMUOrientationOnRobot');
  Blockly.FtcJava.addReservedWords('AngleUnit');
  Blockly.FtcJava.addReservedWords('AngularVelocity');
  Blockly.FtcJava.addReservedWords('AppUtil');
  Blockly.FtcJava.addReservedWords('Appendable');
  Blockly.FtcJava.addReservedWords('AprilTagDetection');
  Blockly.FtcJava.addReservedWords('AprilTagGameDatabase');
  Blockly.FtcJava.addReservedWords('AprilTagLibrary');
  Blockly.FtcJava.addReservedWords('AprilTagMetadata');
  Blockly.FtcJava.addReservedWords('AprilTagPoseFtc');
  Blockly.FtcJava.addReservedWords('AprilTagPoseRaw');
  Blockly.FtcJava.addReservedWords('AprilTagProcessor');
  Blockly.FtcJava.addReservedWords('ArithmeticException');
  Blockly.FtcJava.addReservedWords('ArrayIndexOutOfBoundsException');
  Blockly.FtcJava.addReservedWords('ArrayList');
  Blockly.FtcJava.addReservedWords('ArrayStoreException');
  Blockly.FtcJava.addReservedWords('AssertionError');
  Blockly.FtcJava.addReservedWords('AutoCloseable');
  Blockly.FtcJava.addReservedWords('Autonomous');
  Blockly.FtcJava.addReservedWords('AxesOrder');
  Blockly.FtcJava.addReservedWords('AxesReference');
  Blockly.FtcJava.addReservedWords('Axis');
  Blockly.FtcJava.addReservedWords('BNO055IMU');
  Blockly.FtcJava.addReservedWords('Boolean');
  Blockly.FtcJava.addReservedWords('BootstrapMethodError');
  Blockly.FtcJava.addReservedWords('BuiltinCameraDirection');
  Blockly.FtcJava.addReservedWords('Byte');
  Blockly.FtcJava.addReservedWords('CRServo');
  Blockly.FtcJava.addReservedWords('CameraControl');
  Blockly.FtcJava.addReservedWords('CameraName');
  Blockly.FtcJava.addReservedWords('CameraStreamServer');
  Blockly.FtcJava.addReservedWords('CharSequence');
  Blockly.FtcJava.addReservedWords('Character');
  Blockly.FtcJava.addReservedWords('Circle');
  Blockly.FtcJava.addReservedWords('Class');
  Blockly.FtcJava.addReservedWords('ClassCastException');
  Blockly.FtcJava.addReservedWords('ClassCircularityError');
  Blockly.FtcJava.addReservedWords('ClassFactory');
  Blockly.FtcJava.addReservedWords('ClassFormatError');
  Blockly.FtcJava.addReservedWords('ClassLoader');
  Blockly.FtcJava.addReservedWords('ClassNotFoundException');
  Blockly.FtcJava.addReservedWords('ClassValue');
  Blockly.FtcJava.addReservedWords('CloneNotSupportedException');
  Blockly.FtcJava.addReservedWords('Cloneable');
  Blockly.FtcJava.addReservedWords('Collections');
  Blockly.FtcJava.addReservedWords('Color');
  Blockly.FtcJava.addReservedWords('ColorBlobLocatorProcessor');
  Blockly.FtcJava.addReservedWords('ColorRange');
  Blockly.FtcJava.addReservedWords('ColorSensor');
  Blockly.FtcJava.addReservedWords('ColorSpace');
  Blockly.FtcJava.addReservedWords('Comparable');
  Blockly.FtcJava.addReservedWords('CompassSensor');
  Blockly.FtcJava.addReservedWords('Compiler');
  Blockly.FtcJava.addReservedWords('CurrentUnit');
  Blockly.FtcJava.addReservedWords('DcMotor');
  Blockly.FtcJava.addReservedWords('DcMotorEx');
  Blockly.FtcJava.addReservedWords('DcMotorSimple');
  Blockly.FtcJava.addReservedWords('Deprecated');
  Blockly.FtcJava.addReservedWords('DigitalChannel');
  Blockly.FtcJava.addReservedWords('Disabled');
  Blockly.FtcJava.addReservedWords('DistanceSensor');
  Blockly.FtcJava.addReservedWords('DistanceUnit');
  Blockly.FtcJava.addReservedWords('Double');
  Blockly.FtcJava.addReservedWords('ElapsedTime');
  Blockly.FtcJava.addReservedWords('Enum');
  Blockly.FtcJava.addReservedWords('EnumConstantNotPresentException');
  Blockly.FtcJava.addReservedWords('Error');
  Blockly.FtcJava.addReservedWords('Exception');
  Blockly.FtcJava.addReservedWords('ExceptionInInitializerError');
  Blockly.FtcJava.addReservedWords('ExposureControl');
  Blockly.FtcJava.addReservedWords('Float');
  Blockly.FtcJava.addReservedWords('FocusControl');
  Blockly.FtcJava.addReservedWords('FunctionalInterface');
  Blockly.FtcJava.addReservedWords('GainControl');
  Blockly.FtcJava.addReservedWords('Gamepad');
  Blockly.FtcJava.addReservedWords('GoBildaPinpointDriver');
  Blockly.FtcJava.addReservedWords('GyroSensor');
  Blockly.FtcJava.addReservedWords('Gyroscope');
  Blockly.FtcJava.addReservedWords('HuskyLens');
  Blockly.FtcJava.addReservedWords('I2cAddr');
  Blockly.FtcJava.addReservedWords('I2cAddrConfig');
  Blockly.FtcJava.addReservedWords('I2cAddressableDevice');
  Blockly.FtcJava.addReservedWords('IMU');
  Blockly.FtcJava.addReservedWords('IllegalAccessError');
  Blockly.FtcJava.addReservedWords('IllegalAccessException');
  Blockly.FtcJava.addReservedWords('IllegalArgumentException');
  Blockly.FtcJava.addReservedWords('IllegalMonitorStateException');
  Blockly.FtcJava.addReservedWords('IllegalStateException');
  Blockly.FtcJava.addReservedWords('IllegalThreadStateException');
  Blockly.FtcJava.addReservedWords('ImageRegion');
  Blockly.FtcJava.addReservedWords('ImuOrientationOnRobot');
  Blockly.FtcJava.addReservedWords('IncompatibleClassChangeError');
  Blockly.FtcJava.addReservedWords('IndexOutOfBoundsException');
  Blockly.FtcJava.addReservedWords('InheritableThreadLocal');
  Blockly.FtcJava.addReservedWords('InstantiationError');
  Blockly.FtcJava.addReservedWords('InstantiationException');
  Blockly.FtcJava.addReservedWords('Integer');
  Blockly.FtcJava.addReservedWords('InternalError');
  Blockly.FtcJava.addReservedWords('InterruptedException');
  Blockly.FtcJava.addReservedWords('IrSeekerSensor');
  Blockly.FtcJava.addReservedWords('Iterable');
  Blockly.FtcJava.addReservedWords('JavaUtil');
  Blockly.FtcJava.addReservedWords('JustLoggingAccelerationIntegrator');
  Blockly.FtcJava.addReservedWords('LED');
  Blockly.FtcJava.addReservedWords('LLResult');
  Blockly.FtcJava.addReservedWords('LLResultTypes');
  Blockly.FtcJava.addReservedWords('LLStatus');
  Blockly.FtcJava.addReservedWords('Light');
  Blockly.FtcJava.addReservedWords('LightSensor');
  Blockly.FtcJava.addReservedWords('Limelight3A');
  Blockly.FtcJava.addReservedWords('LinearOpMode');
  Blockly.FtcJava.addReservedWords('LinkageError');
  Blockly.FtcJava.addReservedWords('List');
  Blockly.FtcJava.addReservedWords('Long');
  Blockly.FtcJava.addReservedWords('MS_BEFORE_FORCE_STOP_AFTER_STOP_REQUESTED');
  Blockly.FtcJava.addReservedWords('MagneticFlux');
  Blockly.FtcJava.addReservedWords('Math');
  Blockly.FtcJava.addReservedWords('MatrixF');
  Blockly.FtcJava.addReservedWords('MaxSonarI2CXL');
  Blockly.FtcJava.addReservedWords('ModernRoboticsI2cCompassSensor');
  Blockly.FtcJava.addReservedWords('ModernRoboticsI2cGyro');
  Blockly.FtcJava.addReservedWords('ModernRoboticsI2cRangeSensor');
  Blockly.FtcJava.addReservedWords('MotorControlAlgorithm');
  Blockly.FtcJava.addReservedWords('NegativeArraySizeException');
  Blockly.FtcJava.addReservedWords('NoClassDefFoundError');
  Blockly.FtcJava.addReservedWords('NoSuchFieldError');
  Blockly.FtcJava.addReservedWords('NoSuchFieldException');
  Blockly.FtcJava.addReservedWords('NoSuchMethodError');
  Blockly.FtcJava.addReservedWords('NoSuchMethodException');
  Blockly.FtcJava.addReservedWords('NormalizedColorSensor');
  Blockly.FtcJava.addReservedWords('NormalizedRGBA');
  Blockly.FtcJava.addReservedWords('NullPointerException');
  Blockly.FtcJava.addReservedWords('Number');
  Blockly.FtcJava.addReservedWords('NumberFormatException');
  Blockly.FtcJava.addReservedWords('Object');
  Blockly.FtcJava.addReservedWords('OctoQuad');
  Blockly.FtcJava.addReservedWords('OpMode');
  Blockly.FtcJava.addReservedWords('OpenGLMatrix');
  Blockly.FtcJava.addReservedWords('OpticalDistanceSensor');
  Blockly.FtcJava.addReservedWords('Orientation');
  Blockly.FtcJava.addReservedWords('OrientationSensor');
  Blockly.FtcJava.addReservedWords('OutOfMemoryError');
  Blockly.FtcJava.addReservedWords('Override');
  Blockly.FtcJava.addReservedWords('PIDCoefficients');
  Blockly.FtcJava.addReservedWords('PIDFCoefficients');
  Blockly.FtcJava.addReservedWords('PWMOutput');
  Blockly.FtcJava.addReservedWords('Package');
  Blockly.FtcJava.addReservedWords('Pose2D');
  Blockly.FtcJava.addReservedWords('Pose3D');
  Blockly.FtcJava.addReservedWords('Position');
  Blockly.FtcJava.addReservedWords('PredominantColorProcessor');
  Blockly.FtcJava.addReservedWords('Process');
  Blockly.FtcJava.addReservedWords('ProcessBuilder');
  Blockly.FtcJava.addReservedWords('PtzControl');
  Blockly.FtcJava.addReservedWords('Quaternion');
  Blockly.FtcJava.addReservedWords('Range');
  Blockly.FtcJava.addReservedWords('ReadWriteFile');
  Blockly.FtcJava.addReservedWords('Readable');
  Blockly.FtcJava.addReservedWords('ReflectiveOperationException');
  Blockly.FtcJava.addReservedWords('Rev9AxisImuOrientationOnRobot');
  Blockly.FtcJava.addReservedWords('RevBlinkinLedDriver');
  Blockly.FtcJava.addReservedWords('RevHubOrientationOnRobot');
  Blockly.FtcJava.addReservedWords('RobotLog');
  Blockly.FtcJava.addReservedWords('RotatedRect');
  Blockly.FtcJava.addReservedWords('Runnable');
  Blockly.FtcJava.addReservedWords('Runtime');
  Blockly.FtcJava.addReservedWords('RuntimeException');
  Blockly.FtcJava.addReservedWords('RuntimePermission');
  Blockly.FtcJava.addReservedWords('SafeVarargs');
  Blockly.FtcJava.addReservedWords('Scalar');
  Blockly.FtcJava.addReservedWords('SecurityException');
  Blockly.FtcJava.addReservedWords('SecurityManager');
  Blockly.FtcJava.addReservedWords('Servo');
  Blockly.FtcJava.addReservedWords('ServoController');
  Blockly.FtcJava.addReservedWords('Short');
  Blockly.FtcJava.addReservedWords('Size');
  Blockly.FtcJava.addReservedWords('SortOrder');
  Blockly.FtcJava.addReservedWords('SoundPlayer');
  Blockly.FtcJava.addReservedWords('SparkFunLEDStick');
  Blockly.FtcJava.addReservedWords('SparkFunOTOS');
  Blockly.FtcJava.addReservedWords('StackOverflowError');
  Blockly.FtcJava.addReservedWords('StackTraceElement');
  Blockly.FtcJava.addReservedWords('StrictMath');
  Blockly.FtcJava.addReservedWords('String');
  Blockly.FtcJava.addReservedWords('StringBuffer');
  Blockly.FtcJava.addReservedWords('StringBuilder');
  Blockly.FtcJava.addReservedWords('StringIndexOutOfBoundsException');
  Blockly.FtcJava.addReservedWords('SuppressWarnings');
  Blockly.FtcJava.addReservedWords('SwitchableLight');
  Blockly.FtcJava.addReservedWords('System');
  Blockly.FtcJava.addReservedWords('TeleOp');
  Blockly.FtcJava.addReservedWords('Telemetry');
  Blockly.FtcJava.addReservedWords('TempUnit');
  Blockly.FtcJava.addReservedWords('Temperature');
  Blockly.FtcJava.addReservedWords('Thread');
  Blockly.FtcJava.addReservedWords('ThreadDeath');
  Blockly.FtcJava.addReservedWords('ThreadGroup');
  Blockly.FtcJava.addReservedWords('ThreadLocal');
  Blockly.FtcJava.addReservedWords('Throwable');
  Blockly.FtcJava.addReservedWords('TimeUnit');
  Blockly.FtcJava.addReservedWords('TouchSensor');
  Blockly.FtcJava.addReservedWords('TypeNotPresentException');
  Blockly.FtcJava.addReservedWords('UltrasonicSensor');
  Blockly.FtcJava.addReservedWords('UnknownError');
  Blockly.FtcJava.addReservedWords('UnnormalizedAngleUnit');
  Blockly.FtcJava.addReservedWords('UnsatisfiedLinkError');
  Blockly.FtcJava.addReservedWords('UnsupportedClassVersionError');
  Blockly.FtcJava.addReservedWords('UnsupportedOperationException');
  Blockly.FtcJava.addReservedWords('VectorF');
  Blockly.FtcJava.addReservedWords('Velocity');
  Blockly.FtcJava.addReservedWords('VerifyError');
  Blockly.FtcJava.addReservedWords('VirtualMachineError');
  Blockly.FtcJava.addReservedWords('VisionPortal');
  Blockly.FtcJava.addReservedWords('VisionProcessor');
  Blockly.FtcJava.addReservedWords('Void');
  Blockly.FtcJava.addReservedWords('VoltageSensor');
  Blockly.FtcJava.addReservedWords('WebcamName');
  Blockly.FtcJava.addReservedWords('WhiteBalanceControl');
  Blockly.FtcJava.addReservedWords('YawPitchRollAngles');
  Blockly.FtcJava.addReservedWords('abstract');
  Blockly.FtcJava.addReservedWords('assert');
  Blockly.FtcJava.addReservedWords('blackboard');
  Blockly.FtcJava.addReservedWords('boolean');
  Blockly.FtcJava.addReservedWords('break');
  Blockly.FtcJava.addReservedWords('byte');
  Blockly.FtcJava.addReservedWords('case');
  Blockly.FtcJava.addReservedWords('catch');
  Blockly.FtcJava.addReservedWords('char');
  Blockly.FtcJava.addReservedWords('class');
  Blockly.FtcJava.addReservedWords('const');
  Blockly.FtcJava.addReservedWords('continue');
  Blockly.FtcJava.addReservedWords('default');
  Blockly.FtcJava.addReservedWords('do');
  Blockly.FtcJava.addReservedWords('double');
  Blockly.FtcJava.addReservedWords('else');
  Blockly.FtcJava.addReservedWords('enum');
  Blockly.FtcJava.addReservedWords('equals');
  Blockly.FtcJava.addReservedWords('extends');
  Blockly.FtcJava.addReservedWords('final');
  Blockly.FtcJava.addReservedWords('finally');
  Blockly.FtcJava.addReservedWords('float');
  Blockly.FtcJava.addReservedWords('for');
  Blockly.FtcJava.addReservedWords('gamepad1');
  Blockly.FtcJava.addReservedWords('gamepad2');
  Blockly.FtcJava.addReservedWords('getClass');
  Blockly.FtcJava.addReservedWords('getRuntime');
  Blockly.FtcJava.addReservedWords('goto');
  Blockly.FtcJava.addReservedWords('hardwareMap');
  Blockly.FtcJava.addReservedWords('hashCode');
  Blockly.FtcJava.addReservedWords('idle');
  Blockly.FtcJava.addReservedWords('if');
  Blockly.FtcJava.addReservedWords('implements');
  Blockly.FtcJava.addReservedWords('import');
  Blockly.FtcJava.addReservedWords('init');
  Blockly.FtcJava.addReservedWords('init_loop');
  Blockly.FtcJava.addReservedWords('instanceof');
  Blockly.FtcJava.addReservedWords('int');
  Blockly.FtcJava.addReservedWords('interface');
  Blockly.FtcJava.addReservedWords('internalPostInitLoop');
  Blockly.FtcJava.addReservedWords('internalPostLoop');
  Blockly.FtcJava.addReservedWords('internalPreInit');
  Blockly.FtcJava.addReservedWords('internalUpdateTelemetryNow');
  Blockly.FtcJava.addReservedWords('isStarted');
  Blockly.FtcJava.addReservedWords('isStopRequested');
  Blockly.FtcJava.addReservedWords('long');
  Blockly.FtcJava.addReservedWords('loop');
  Blockly.FtcJava.addReservedWords('msStuckDetectInit');
  Blockly.FtcJava.addReservedWords('msStuckDetectInitLoop');
  Blockly.FtcJava.addReservedWords('msStuckDetectLoop');
  Blockly.FtcJava.addReservedWords('msStuckDetectStart');
  Blockly.FtcJava.addReservedWords('msStuckDetectStop');
  Blockly.FtcJava.addReservedWords('native');
  Blockly.FtcJava.addReservedWords('new');
  Blockly.FtcJava.addReservedWords('notify');
  Blockly.FtcJava.addReservedWords('notifyAll');
  Blockly.FtcJava.addReservedWords('opModeInInit');
  Blockly.FtcJava.addReservedWords('opModeIsActive');
  Blockly.FtcJava.addReservedWords('package');
  Blockly.FtcJava.addReservedWords('private');
  Blockly.FtcJava.addReservedWords('protected');
  Blockly.FtcJava.addReservedWords('public');
  Blockly.FtcJava.addReservedWords('requestOpModeStop');
  Blockly.FtcJava.addReservedWords('resetRuntime');
  Blockly.FtcJava.addReservedWords('return');
  Blockly.FtcJava.addReservedWords('short');
  Blockly.FtcJava.addReservedWords('sleep');
  Blockly.FtcJava.addReservedWords('start');
  Blockly.FtcJava.addReservedWords('static');
  Blockly.FtcJava.addReservedWords('stop');
  Blockly.FtcJava.addReservedWords('strictfp');
  Blockly.FtcJava.addReservedWords('super');
  Blockly.FtcJava.addReservedWords('switch');
  Blockly.FtcJava.addReservedWords('synchronized');
  Blockly.FtcJava.addReservedWords('telemetry');
  Blockly.FtcJava.addReservedWords('terminateOpModeNow');
  Blockly.FtcJava.addReservedWords('this');
  Blockly.FtcJava.addReservedWords('throw');
  Blockly.FtcJava.addReservedWords('throws');
  Blockly.FtcJava.addReservedWords('time');
  Blockly.FtcJava.addReservedWords('toString');
  Blockly.FtcJava.addReservedWords('transient');
  Blockly.FtcJava.addReservedWords('try');
  Blockly.FtcJava.addReservedWords('updateTelemetry');
  Blockly.FtcJava.addReservedWords('void');
  Blockly.FtcJava.addReservedWords('volatile');
  Blockly.FtcJava.addReservedWords('wait');
  Blockly.FtcJava.addReservedWords('waitForStart');
  Blockly.FtcJava.addReservedWords('while');
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ControlHubAsREVModule'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ControlHubAsServoController'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ControlHubAsVoltageSensor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ExpansionHub2AsREVModule'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ExpansionHub2AsServoController'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('ExpansionHub2AsVoltageSensor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('Webcam1AsWebcamName'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('backLeftAsDcMotor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('backRightAsDcMotor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('frontLeftAsDcMotor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('frontRightAsDcMotor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('imuAsIMU'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('auxMotor1AsDcMotor'));
  Blockly.FtcJava.addReservedWords(getHardwareItemIdentifierForFtcJava('auxMotor2AsDcMotor'));
  Blockly.FtcJava.addReservedWords('androidAccelerometer');
  Blockly.FtcJava.addReservedWords('androidGyroscope');
  Blockly.FtcJava.addReservedWords('androidOrientation');
  Blockly.FtcJava.addReservedWords('androidSoundPool');
  Blockly.FtcJava.addReservedWords('androidTextToSpeech');
  Blockly.FtcJava.addReservedWords('gamepad1');
  Blockly.FtcJava.addReservedWords('gamepad2');
  Blockly.FtcJava.addReservedWords('tfod');
  Blockly.FtcJava.addReservedWords('tfodCustomModel');
  Blockly.FtcJava.addReservedWords('tfodPOWERPLAY');
  Blockly.FtcJava.addReservedWords('tfodRoverRuckus');
  Blockly.FtcJava.addReservedWords('tfodSkyStone');
  Blockly.FtcJava.addReservedWords('vuforiaPOWERPLAY');
  Blockly.FtcJava.addReservedWords('vuforiaRelicRecovery');
  Blockly.FtcJava.addReservedWords('vuforiaRoverRuckus');
  Blockly.FtcJava.addReservedWords('vuforiaSkyStone');
}

function knownTypeToClassName(type) {
  switch (type) {
    case 'Color':
      return 'android.graphics.' + type;
    case 'Size':
      return 'android.util.' + type;
    case 'SoundPlayer':
      return 'com.qualcomm.ftccommon.' + type;
    case 'AndyMarkIMU':
    case 'AndyMarkIMUOrientationOnRobot':
    case 'AndyMarkIMUOrientationOnRobot.I2cPortFacingDirection':
    case 'AndyMarkIMUOrientationOnRobot.LogoFacingDirection':
    case 'AndyMarkColorSensor':
      return 'com.qualcomm.hardware.andymark.' + type;
    case 'BNO055IMU':
    case 'BNO055IMU.AccelerationIntegrator':
    case 'BNO055IMU.AccelUnit':
    case 'BNO055IMU.Parameters':
    case 'BNO055IMU.SensorMode':
    case 'BNO055IMU.SystemStatus':
    case 'JustLoggingAccelerationIntegrator':
      return 'com.qualcomm.hardware.bosch.' + type;
    case 'HuskyLens':
      return 'com.qualcomm.hardware.dfrobot.' + type;
    case 'OctoQuad':
      return 'com.qualcomm.hardware.digitalchickenlabs.' + type;
    case 'GoBildaPinpointDriver':
    case 'GoBildaPinpointDriver.DeviceStatus':
    case 'GoBildaPinpointDriver.EncoderDirection':
    case 'GoBildaPinpointDriver.GoBildaOdometryPods':
    case 'GoBildaPinpointDriver.ReadData':
      return 'com.qualcomm.hardware.gobilda.' + type;
    case 'Limelight3A':
    case 'LLResult':
    case 'LLResultTypes':
    case 'LLResultTypes.FiducialResult':
    case 'LLResultTypes.ColorResult':
    case 'LLStatus':
      return 'com.qualcomm.hardware.limelightvision.' + type;
    case 'MaxSonarI2CXL':
      return 'com.qualcomm.hardware.maxbotix.' + type;
    case 'ModernRoboticsI2cCompassSensor':
    case 'ModernRoboticsI2cGyro':
    case 'ModernRoboticsI2cGyro.HeadingMode':
    case 'ModernRoboticsI2cRangeSensor':
      return 'com.qualcomm.hardware.modernrobotics.' + type;
    case 'RevBlinkinLedDriver':
    case 'RevBlinkinLedDriver.BlinkinPattern':
    case 'RevHubOrientationOnRobot':
    case 'RevHubOrientationOnRobot.LogoFacingDirection':
    case 'RevHubOrientationOnRobot.UsbFacingDirection':
    case 'Rev9AxisImuOrientationOnRobot':
    case 'Rev9AxisImuOrientationOnRobot.I2cPortFacingDirection':
    case 'Rev9AxisImuOrientationOnRobot.LogoFacingDirection':
      return 'com.qualcomm.hardware.rev.' + type;
    case 'SparkFunLEDStick':
    case 'SparkFunOTOS':
    case 'SparkFunOTOS.Pose2D':
    case 'SparkFunOTOS.SelfTestConfig':
    case 'SparkFunOTOS.SignalProcessConfig':
    case 'SparkFunOTOS.Status':
    case 'SparkFunOTOS.Version':
      return 'com.qualcomm.hardware.sparkfun.' + type;
    case 'Autonomous':
    case 'Disabled':
    case 'LinearOpMode':
    case 'OpMode':
    case 'TeleOp':
      return 'com.qualcomm.robotcore.eventloop.opmode.' + type;
    case 'AccelerationSensor':
    case 'AnalogInput':
    case 'CRServo':
    case 'CRServo.Direction':
    case 'ColorSensor':
    case 'CompassSensor':
    case 'CompassSensor.CompassMode':
    case 'DcMotor':
    case 'DcMotor.Direction':
    case 'DcMotor.RunMode':
    case 'DcMotor.ZeroPowerBehavior':
    case 'DcMotorEx':
    case 'DcMotorSimple':
    case 'DcMotorSimple.Direction':
    case 'DigitalChannel':
    case 'DigitalChannel.Mode':
    case 'DistanceSensor':
    case 'Gamepad':
    case 'Gamepad.LedEffect':
    case 'Gamepad.LedEffect.Builder':
    case 'Gamepad.RumbleEffect':
    case 'Gamepad.RumbleEffect.Builder':
    case 'GyroSensor':
    case 'Gyroscope':
    case 'I2cAddr':
    case 'I2cAddrConfig':
    case 'I2cAddressableDevice':
    case 'IMU':
    case 'IMU.Parameters':
    case 'ImuOrientationOnRobot':
    case 'IrSeekerSensor':
    case 'IrSeekerSensor.Mode':
    case 'LED':
    case 'Light':
    case 'LightSensor':
    case 'MotorControlAlgorithm':
    case 'NormalizedColorSensor':
    case 'NormalizedRGBA':
    case 'OpticalDistanceSensor':
    case 'OrientationSensor':
    case 'PIDCoefficients':
    case 'PIDFCoefficients':
    case 'PWMOutput':
    case 'Servo':
    case 'Servo.Direction':
    case 'ServoController':
    case 'ServoController.PwmStatus':
    case 'SwitchableLight':
    case 'TouchSensor':
    case 'UltrasonicSensor':
    case 'VoltageSensor':
      return 'com.qualcomm.robotcore.hardware.' + type;
    case 'ElapsedTime':
    case 'ElapsedTime.Resolution':
    case 'Range':
    case 'ReadWriteFile':
    case 'RobotLog':
    case 'SortOrder':
      return 'com.qualcomm.robotcore.util.' + type;
    case 'Boolean':
    case 'Byte':
    case 'Character':
    case 'Double':
    case 'Float':
    case 'Integer':
    case 'Long':
    case 'Number':
    case 'Object':
    case 'Short':
    case 'String':
      return 'java.lang.' + type;
    case 'ArrayList':
    case 'Collections':
    case 'List':
      return 'java.util.' + type;
    case 'TimeUnit':
      return 'java.util.concurrent.' + type;
    case 'ClassFactory':
    case 'JavaUtil':
    case 'Telemetry':
    case 'Telemetry.DisplayFormat':
      return 'org.firstinspires.ftc.robotcore.external.' + type;
    case 'AndroidAccelerometer':
    case 'AndroidGyroscope':
    case 'AndroidOrientation':
    case 'AndroidSoundPool':
    case 'AndroidTextToSpeech':
      return 'org.firstinspires.ftc.robotcore.external.android.' + type;
    case 'BuiltinCameraDirection':
    case 'CameraName':
    case 'WebcamName':
      return 'org.firstinspires.ftc.robotcore.external.hardware.camera.' + type;
    case 'CameraControl':
    case 'ExposureControl':
    case 'FocusControl':
    case 'GainControl':
    case 'PtzControl':
    case 'WhiteBalanceControl':
      return 'org.firstinspires.ftc.robotcore.external.hardware.camera.controls.' + type;
    case 'MatrixF':
    case 'OpenGLMatrix':
    case 'VectorF':
      return 'org.firstinspires.ftc.robotcore.external.matrices.' + type;
    case 'Acceleration':
    case 'AngleUnit':
    case 'AngularVelocity':
    case 'AxesOrder':
    case 'AxesReference':
    case 'Axis':
    case 'CurrentUnit':
    case 'DistanceUnit':
    case 'MagneticFlux':
    case 'Orientation':
    case 'Pose2D':
    case 'Pose3D':
    case 'Position':
    case 'Quaternion':
    case 'TempUnit':
    case 'Temperature':
    case 'UnnormalizedAngleUnit':
    case 'Velocity':
    case 'YawPitchRollAngles':
      return 'org.firstinspires.ftc.robotcore.external.navigation.' + type;
    case 'CameraStreamServer':
      return 'org.firstinspires.ftc.robotcore.external.stream.' + type;
    case 'AppUtil':
      return 'org.firstinspires.ftc.robotcore.internal.system.' + type;
    case 'VisionPortal':
    case 'VisionProcessor':
      return 'org.firstinspires.ftc.vision.' + type;
    case 'AprilTagDetection':
    case 'AprilTagGameDatabase':
    case 'AprilTagLibrary':
    case 'AprilTagMetadata':
    case 'AprilTagPoseFtc':
    case 'AprilTagPoseRaw':
    case 'AprilTagProcessor':
      return 'org.firstinspires.ftc.vision.apriltag.' + type;
    case 'Circle':
    case 'ColorBlobLocatorProcessor':
    case 'ColorRange':
    case 'ColorSpace':
    case 'ImageRegion':
    case 'PredominantColorProcessor':
      return 'org.firstinspires.ftc.vision.opencv.' + type;
    case 'RotatedRect':
    case 'Scalar':
      return 'org.opencv.core.' + type;
    case 'org.opencv.core.Point':
    case 'org.opencv.core.Rect':
    case 'org.opencv.core.Size':
      return type;
  }
  return knownTypeToClassNameObsolete(type);
}

function getIconClass(categoryName) {
  if (categoryName == 'AccelerationSensor') {
    return 'AccelerationSensor-icon';
  }
  if (categoryName == 'AnalogInput') {
    return 'AnalogInput-icon';
  }
  if (categoryName == 'AndyMarkColorSensor') {
    return 'ColorSensor-icon';
  }
  if (categoryName == 'REV Color/Range Sensor') {
    return 'ColorSensor-icon';
  }
  if (categoryName == 'ColorSensor') {
    return 'ColorSensor-icon';
  }
  if (categoryName == 'CompassSensor') {
    return 'CompassSensor-icon';
  }
  if (categoryName == 'CRServo') {
    return 'CRServo-icon';
  }
  if (categoryName == 'DcMotor') {
    return 'DcMotor-icon';
  }
  if (categoryName == 'DigitalChannel') {
    return 'DigitalChannel-icon';
  }
  if (categoryName == 'DistanceSensor') {
    return 'UltrasonicSensor-icon';
  }
  if (categoryName == 'GyroSensor') {
    return 'GyroSensor-icon';
  }
  if (categoryName == 'IrSeekerSensor') {
    return 'IrSeekerSensor-icon';
  }
  if (categoryName == 'LED') {
    return 'LED-icon';
  }
  if (categoryName == 'LightSensor') {
    return 'LightSensor-icon';
  }
  if (categoryName == 'MrI2cCompassSensor') {
    return 'CompassSensor-icon';
  }
  if (categoryName == 'MrI2cRangeSensor') {
    return 'OpticalDistanceSensor-icon';
  }
  if (categoryName == 'OctoQuad') {
    return 'OctoQuad-icon';
  }
  if (categoryName == 'OpticalDistanceSensor') {
    return 'OpticalDistanceSensor-icon';
  }
  if (categoryName == 'RevBlinkinLedDriver') {
    return 'LED-icon';
  }
  if (categoryName == 'Servo') {
    return 'Servo-icon';
  }
  if (categoryName == 'ServoController') {
    return 'ServoController-icon';
  }
  if (categoryName == 'TouchSensor') {
    return 'TouchSensor-icon';
  }
  if (categoryName == 'UltrasonicSensor') {
    return 'UltrasonicSensor-icon';
  }
  if (categoryName == 'VoltageSensor') {
    return 'VoltageSensor-icon';
  }
  if (categoryName == 'Dual') {
    return 'DcMotor-icon';
  }
  if (categoryName == 'Gamepad') {
    return 'Gamepad-icon';
  }
  if (categoryName == 'LinearOpMode') {
    return 'LinearOpMode-icon';
  }
  if (categoryName == 'Color') {
    return 'ColorSensor-icon';
  }
  if (categoryName == 'ElapsedTime') {
    return 'ElapsedTime-icon';
  }
  return '';
}

function getWarningForCapabilityRequestedBySample(capability) {
  switch (capability) {
    case 'SWITCHABLE_CAMERA':
      return 'The current configuration does not have multiple webcams.';
  }
  return '';
}

function getToolbox() {
  return '<xml id="toolbox" style="display: none"><category name="LinearOpMode"><block type="linearOpMode_waitForStart"></block><block type="linearOpMode_idle"></block><block type="linearOpMode_sleep_Number"><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="linearOpMode_opModeInInit"></block><block type="linearOpMode_opModeIsActive"></block><block type="linearOpMode_isStarted"></block><block type="linearOpMode_isStopRequested"></block><block type="linearOpMode_getRuntime_Number"></block><block type="linearOpMode_resetRuntime"></block><block type="linearOpMode_requestOpModeStop"></block><block type="linearOpMode_terminateOpModeNow"></block></category><category name="Gamepad"><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">A</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">AtRest</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">B</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Back</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Circle</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Cross</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadDown</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadLeft</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadRight</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadUp</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Guide</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftBumper</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftStickButton</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftStickX</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftStickY</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftTrigger</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftTriggerPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Options</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">PS</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightBumper</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightStickButton</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightStickX</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightStickY</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightTrigger</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightTriggerPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Share</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Square</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Start</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Touchpad</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger1</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger2</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger1X</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger1Y</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger2X</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadFinger2Y</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Triangle</field></block><block type="gamepad_getProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TriggerThreshold</field></block><block type="gamepad_setProperty_Number"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TriggerThreshold</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">X</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">Y</field></block><category name="Pressed"><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">AWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">BWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">BackWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">CircleWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">CrossWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadDownWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadLeftWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadRightWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadUpWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">GuideWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftBumperWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftStickButtonWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftTriggerWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">OptionsWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">PSWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightBumperWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightStickButtonWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightTriggerWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">ShareWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">SquareWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">StartWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TriangleWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">XWasPressed</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">YWasPressed</field></block><block type="gamepad_resetEdgeDetection"><field name="IDENTIFIER">gamepad1</field></block></category><category name="Released"><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">AWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">BWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">BackWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">CircleWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">CrossWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadDownWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadLeftWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadRightWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">DpadUpWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">GuideWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftBumperWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftStickButtonWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">LeftTriggerWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">OptionsWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">PSWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightBumperWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightStickButtonWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">RightTriggerWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">ShareWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">SquareWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">StartWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TouchpadWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">TriangleWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">XWasReleased</field></block><block type="gamepad_getProperty_Boolean"><field name="IDENTIFIER">gamepad1</field><field name="PROP">YWasReleased</field></block><block type="gamepad_resetEdgeDetection"><field name="IDENTIFIER">gamepad1</field></block></category><category name="Rumble"><block type="gamepad_rumble_with1"><field name="IDENTIFIER">gamepad1</field><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="gamepad_rumble_with3"><field name="IDENTIFIER">gamepad1</field><value name="RUMBLE_1"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="RUMBLE_2"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="gamepad_stopRumble"><field name="IDENTIFIER">gamepad1</field></block><block type="gamepad_rumbleBlips"><field name="IDENTIFIER">gamepad1</field><value name="COUNT"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block><block type="gamepad_isRumbling"><field name="IDENTIFIER">gamepad1</field></block><block type="variables_set"><field name="VAR">myRumbleEffectBuilder</field><value name="VALUE"><block type="rumbleEffect_createBuilder"></block></value></block><block type="rumbleEffect_addStep"><value name="RUMBLE_EFFECT_BUILDER"><block type="variables_get"><field name="VAR">myRumbleEffectBuilder</field></block></value><value name="RUMBLE_1"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="RUMBLE_2"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="variables_set"><field name="VAR">myRumbleEffect</field><value name="VALUE"><block type="rumbleEffect_build"><value name="RUMBLE_EFFECT_BUILDER"><block type="variables_get"><field name="VAR">myRumbleEffectBuilder</field></block></value></block></value></block><block type="gamepad_runRumbleEffect"><field name="IDENTIFIER">gamepad1</field><value name="RUMBLE_EFFECT"><block type="variables_get"><field name="VAR">myRumbleEffect</field></block></value></block><block type="gamepad_RUMBLE_DURATION_CONTINUOUS"></block></category><category name="LED "><block type="gamepad_setLedColor"><field name="IDENTIFIER">gamepad1</field><value name="RED"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="variables_set"><field name="VAR">myLedEffectBuilder</field><value name="VALUE"><block type="ledEffect_createBuilder"></block></value></block><block type="ledEffect_addStep"><value name="LED_EFFECT_BUILDER"><block type="variables_get"><field name="VAR">myLedEffectBuilder</field></block></value><value name="RED"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value><value name="MILLISECONDS"><shadow type="math_number"><field name="NUM">1000</field></shadow></value></block><block type="ledEffect_setRepeating"><value name="LED_EFFECT_BUILDER"><block type="variables_get"><field name="VAR">myLedEffectBuilder</field></block></value><value name="REPEATING"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="variables_set"><field name="VAR">myLedEffect</field><value name="VALUE"><block type="ledEffect_build"><value name="LED_EFFECT_BUILDER"><block type="variables_get"><field name="VAR">myLedEffectBuilder</field></block></value></block></value></block><block type="gamepad_runLedEffect"><field name="IDENTIFIER">gamepad1</field><value name="LED_EFFECT"><block type="variables_get"><field name="VAR">myLedEffect</field></block></value></block><block type="gamepad_LED_DURATION_CONTINUOUS"></block></category></category><category name="Actuators"><category name="DcMotor"><block type="dcMotor_getProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">CurrentPosition</field></block><block type="dcMotor_setProperty_Direction"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Direction</field><value name="VALUE"><shadow type="dcMotor_typedEnum_direction"></shadow></value></block><block type="dcMotor_getProperty_Direction"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Direction</field></block><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="dcMotor_getProperty_Direction"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Direction</field></block></value><value name="B"><block type="dcMotor_typedEnum_direction"></block></value></block><block type="dcMotor_setProperty_RunMode"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Mode</field><value name="VALUE"><shadow type="dcMotor_typedEnum_runMode"></shadow></value></block><block type="dcMotor_getProperty_RunMode"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Mode</field></block><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="dcMotor_getProperty_RunMode"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Mode</field></block></value><value name="B"><block type="dcMotor_typedEnum_runMode"></block></value></block><block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Power</field><value name="VALUE"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Power</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="dcMotor_getProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Power</field></block><block type="dcMotor_getProperty_Boolean"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">PowerFloat</field></block><block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">TargetPosition</field><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="dcMotor_getProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">TargetPosition</field></block><block type="dcMotor_setProperty_ZeroPowerBehavior"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">ZeroPowerBehavior</field><value name="VALUE"><shadow type="dcMotor_typedEnum_zeroPowerBehavior"></shadow></value></block><block type="dcMotor_getProperty_ZeroPowerBehavior"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">ZeroPowerBehavior</field></block><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="dcMotor_getProperty_ZeroPowerBehavior"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">ZeroPowerBehavior</field></block></value><value name="B"><block type="dcMotor_typedEnum_zeroPowerBehavior"></block></value></block><block type="dcMotor_isBusy"><field name="IDENTIFIER">backLeftAsDcMotor</field></block><category name="Dual"><block type="dcMotor_setDualProperty_Number"><field name="PROP">Power</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="VALUE2"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="dcMotor_setDualProperty_Number"><field name="PROP">Power</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="VALUE2"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="dcMotor_setDualProperty_RunMode"><field name="PROP">Mode</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="dcMotor_typedEnum_runMode"></shadow></value><value name="VALUE2"><shadow type="dcMotor_typedEnum_runMode"></shadow></value></block><block type="dcMotor_setDualProperty_Number"><field name="PROP">TargetPosition</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="VALUE2"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="dcMotor_setDualProperty_ZeroPowerBehavior"><field name="PROP">ZeroPowerBehavior</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="dcMotor_typedEnum_zeroPowerBehavior"></shadow></value><value name="VALUE2"><shadow type="dcMotor_typedEnum_zeroPowerBehavior"></shadow></value></block></category><category name="Extended"><block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">TargetPositionTolerance</field><value name="VALUE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="dcMotor_getProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">TargetPositionTolerance</field></block><block type="dcMotor_setProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Velocity</field><value name="VALUE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="dcMotor_getProperty_Number"><field name="IDENTIFIER">backLeftAsDcMotor</field><field name="PROP">Velocity</field></block><category name="Dual"><block type="dcMotor_setDualProperty_Number"><field name="PROP">TargetPositionTolerance</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="VALUE2"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="dcMotor_setDualProperty_Number"><field name="PROP">Velocity</field><field name="IDENTIFIER1">backLeftAsDcMotor</field><field name="IDENTIFIER2">backRightAsDcMotor</field><value name="VALUE1"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="VALUE2"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block></category><block type="dcMotor_setMotorEnable"><field name="IDENTIFIER">backLeftAsDcMotor</field></block><block type="dcMotor_setMotorDisable"><field name="IDENTIFIER">backLeftAsDcMotor</field></block><block type="dcMotor_isMotorEnabled"><field name="IDENTIFIER">backLeftAsDcMotor</field></block><block type="dcMotor_setVelocity_withAngleUnit"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="ANGULAR_RATE"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="dcMotor_getVelocity_withAngleUnit"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="dcMotor_setVelocityPIDFCoefficients"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="P"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="I"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="D"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="F"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="dcMotor_setPositionPIDFCoefficients"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="P"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="dcMotor_setPIDFCoefficients"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="RUN_MODE"><shadow type="dcMotor_typedEnum_runMode"><field name="RUN_MODE">RUN_USING_ENCODER</field></shadow></value><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">pidfCoefficients</field></block></value></block><block type="dcMotor_getPIDFCoefficients"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="RUN_MODE"><shadow type="dcMotor_typedEnum_runMode"><field name="RUN_MODE">RUN_USING_ENCODER</field></shadow></value></block><block type="dcMotor_getCurrent"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="CURRENT_UNIT"><shadow type="navigation_typedEnum_currentUnit"></shadow></value></block><block type="dcMotor_setCurrentAlert"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="CURRENT"><shadow type="math_number"><field name="NUM">5</field></shadow></value><value name="CURRENT_UNIT"><shadow type="navigation_typedEnum_currentUnit"></shadow></value></block><block type="dcMotor_getCurrentAlert"><field name="IDENTIFIER">backLeftAsDcMotor</field><value name="CURRENT_UNIT"><shadow type="navigation_typedEnum_currentUnit"></shadow></value></block><block type="dcMotor_isOverCurrent"><field name="IDENTIFIER">backLeftAsDcMotor</field></block></category></category><category name="ServoController"><block type="servoController_getProperty_PwmStatus"><field name="IDENTIFIER">ControlHubAsServoController</field><field name="PROP">PwmStatus</field></block><block type="servoController_pwmDisable"><field name="IDENTIFIER">ControlHubAsServoController</field></block><block type="servoController_pwmEnable"><field name="IDENTIFIER">ControlHubAsServoController</field></block></category></category><category name="Sensors"><category name="IMU"><block type="imu_initialize"><field name="IDENTIFIER">imuAsIMU</field><value name="PARAMETERS"><block type="imuParameters_create"></block></value></block><block type="imu_getProperty_Quaternion"><field name="IDENTIFIER">imuAsIMU</field><field name="PROP">RobotOrientationAsQuaternion</field></block><block type="imu_getProperty_YawPitchRollAngles"><field name="IDENTIFIER">imuAsIMU</field><field name="PROP">RobotYawPitchRollAngles</field></block><block type="imu_getRobotAngularVelocity"><field name="IDENTIFIER">imuAsIMU</field><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="imu_getRobotOrientation"><field name="IDENTIFIER">imuAsIMU</field><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"><field name="AXES_REFERENCE">INTRINSIC</field></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"><field name="AXES_ORDER">ZYX</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="imu_resetYaw"><field name="IDENTIFIER">imuAsIMU</field></block><category name="RevHubOrientationOnRobot"><block type="revHubOrientationOnRobot_create1"><comment pinned="false" h="150" w="325">Create a RevHubOrientationOnRobot object for use with an IMU in a REV Robotics Control Hub or Expansion Hub, specifying the hub\'s orientation on the robot via the direction that the REV Robotics logo is facing and the direction that the USB ports are facing.     </comment><value name="LOGO_FACING_DIRECTION"><shadow type="revHubOrientationOnRobot_typedEnum_logoFacingDirection"><field name="LOGO_FACING_DIRECTION">UP</field></shadow></value><value name="USB_FACING_DIRECTION"><shadow type="revHubOrientationOnRobot_typedEnum_usbFacingDirection"><field name="USB_FACING_DIRECTION">FORWARD</field></shadow></value></block><block type="revHubOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a RevHubOrientationOnRobot object for use with an IMU in a REV Robotics Control Hub or Expansion Hub, specifying the hub\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the hub from having its logo facing up and the USB ports facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="revHubOrientationOnRobot_xyzOrientation"><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="revHubOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a RevHubOrientationOnRobot object for use with an IMU in a REV Robotics Control Hub or Expansion Hub, specifying the hub\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the hub from having its logo facing up and the USB ports facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="revHubOrientationOnRobot_zyxOrientation"><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block></value></block><block type="revHubOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a RevHubOrientationOnRobot object for use with an IMU in a REV Robotics Control Hub or Expansion Hub, specifying the hub\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the hub from having its logo facing up and the USB ports facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="orientation_create_withArgs2"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"><field name="AXES_REFERENCE">INTRINSIC</field></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"><field name="AXES_ORDER">ZYX</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="revHubOrientationOnRobot_create3"><comment pinned="false" h="175" w="375">Create a RevHubOrientationOnRobot object for use with an IMU in a REV Robotics Control Hub or Expansion Hub, specifying the hub\'s arbitrary orientation on the robot via a Quaternion block that describes the rotation that would need to be applied in order to rotate the hub from having its logo facing up and the USB ports facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="quaternion_create_withArgs2"><value name="W"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></value></block></category><category name="Rev9AxisImuOrientationOnRobot"><block type="rev9AxisImuOrientationOnRobot_create1"><comment pinned="false" h="150" w="325">Create a Rev9AxisImuOrientationOnRobot object for use with a REV 9-Axis IMU, specifying the IMU\'s orientation on the robot via the direction that the REV logo on the IMU is facing and the direction that the I2C port on the IMU is facing.     </comment><value name="LOGO_FACING_DIRECTION"><shadow type="rev9AxisImuOrientationOnRobot_typedEnum_logoFacingDirection"><field name="LOGO_FACING_DIRECTION">UP</field></shadow></value><value name="I2C_PORT_FACING_DIRECTION"><shadow type="rev9AxisImuOrientationOnRobot_typedEnum_i2cPortFacingDirection"><field name="I2C_PORT_FACING_DIRECTION">FORWARD</field></shadow></value></block><block type="rev9AxisImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a Rev9AxisImuOrientationOnRobot object for use with a REV 9-Axis IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="rev9AxisImuOrientationOnRobot_xyzOrientation"><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="rev9AxisImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a Rev9AxisImuOrientationOnRobot object for use with a REV 9-Axis IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="rev9AxisImuOrientationOnRobot_zyxOrientation"><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block></value></block><block type="rev9AxisImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create a Rev9AxisImuOrientationOnRobot object for use with a REV 9-Axis IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="orientation_create_withArgs2"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"><field name="AXES_REFERENCE">INTRINSIC</field></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"><field name="AXES_ORDER">ZYX</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="rev9AxisImuOrientationOnRobot_create3"><comment pinned="false" h="175" w="375">Create a Rev9AxisImuOrientationOnRobot object for use with a REV 9-Axis IMU, specifying the IMU\'s arbitrary orientation on the robot via a Quaternion block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="quaternion_create_withArgs2"><value name="W"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></value></block></category><category name="AndyMarkIMUOrientationOnRobot"><block type="andyMarkImuOrientationOnRobot_create1"><comment pinned="false" h="150" w="325">Create an AndyMarkIMUOrientationOnRobot object for use with an AndyMark IMU, specifying the IMU\'s orientation on the robot via the direction that the AndyMark logo on the IMU is facing and the direction that the I2C port on the IMU is facing.     </comment><value name="LOGO_FACING_DIRECTION"><shadow type="andyMarkImuOrientationOnRobot_typedEnum_logoFacingDirection"><field name="LOGO_FACING_DIRECTION">UP</field></shadow></value><value name="I2C_PORT_FACING_DIRECTION"><shadow type="andyMarkImuOrientationOnRobot_typedEnum_i2cPortFacingDirection"><field name="I2C_PORT_FACING_DIRECTION">FORWARD</field></shadow></value></block><block type="andyMarkImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create an AndyMarkIMUOrientationOnRobot object for use with an AndyMark IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="andyMarkImuOrientationOnRobot_xyzOrientation"><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="andyMarkImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create an AndyMarkIMUOrientationOnRobot object for use with an AndyMark IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="andyMarkImuOrientationOnRobot_zyxOrientation"><value name="Z"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block></value></block><block type="andyMarkImuOrientationOnRobot_create2"><comment pinned="false" h="175" w="375">Create an AndyMarkIMUOrientationOnRobot object for use with an AndyMark IMU, specifying the IMU\'s arbitrary orientation on the robot via an Orientation block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="orientation_create_withArgs2"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"><field name="AXES_REFERENCE">INTRINSIC</field></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"><field name="AXES_ORDER">ZYX</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">-45</field></shadow></value></block></value></block><block type="andyMarkImuOrientationOnRobot_create3"><comment pinned="false" h="175" w="375">Create an AndyMarkIMUOrientationOnRobot object for use with an AndyMark IMU, specifying the IMU\'s arbitrary orientation on the robot via a Quaternion block that describes the rotation that would need to be applied in order to rotate the IMU from having its logo facing up and the I2C port facing forward, to its actual orientation on the robot.     </comment><value name="ROTATION"><block type="quaternion_create_withArgs2"><value name="W"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></value></block></category></category><category name="VoltageSensor"><block type="voltageSensor_getProperty_Number"><field name="IDENTIFIER">ControlHubAsVoltageSensor</field><field name="PROP">Voltage</field></block></category></category><category name="Other Devices"></category><category name="Android"><category name="SoundPool"><block type="androidSoundPool_initialize"></block><block type="androidSoundPool_preloadSound"><value name="SOUND_NAME"><shadow type="androidSoundPoolSkyStone_typedEnum_soundResource"></shadow></value></block><block type="androidSoundPool_preloadSound"><value name="SOUND_NAME"><shadow type="text"><field name="TEXT">click.wav</field></shadow></value></block><block type="androidSoundPool_play"><value name="SOUND_NAME"><shadow type="androidSoundPoolSkyStone_typedEnum_soundResource"></shadow></value></block><block type="androidSoundPool_play"><value name="SOUND_NAME"><shadow type="text"><field name="TEXT">click.wav</field></shadow></value></block><block type="androidSoundPool_stop"></block><block type="androidSoundPool_setProperty_Number"><field name="PROP">Volume</field><value name="VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value></block><block type="androidSoundPool_getProperty_Number"><field name="PROP">Volume</field></block><block type="androidSoundPool_setProperty_Number"><field name="PROP">Rate</field><value name="VALUE"><shadow type="math_number"><field name="NUM">2.0</field></shadow></value></block><block type="androidSoundPool_getProperty_Number"><field name="PROP">Rate</field></block><block type="androidSoundPool_setProperty_Number"><field name="PROP">Loop</field><value name="VALUE"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block><block type="androidSoundPool_getProperty_Number"><field name="PROP">Loop</field></block></category><category name="TextToSpeech"><block type="androidTextToSpeech_initialize"></block><block type="androidTextToSpeech_getProperty_String"><field name="PROP">Status</field></block><block type="androidTextToSpeech_getProperty_String"><field name="PROP">LanguageCode</field></block><block type="androidTextToSpeech_getProperty_String"><field name="PROP">CountryCode</field></block><block type="androidTextToSpeech_getProperty_Boolean"><field name="PROP">IsSpeaking</field></block><block type="androidTextToSpeech_setProperty_Number"><field name="PROP">Pitch</field><value name="VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value></block><block type="androidTextToSpeech_setProperty_Number"><field name="PROP">SpeechRate</field><value name="VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value></block><block type="androidTextToSpeech_isLanguageAvailable_String"><value name="LANGUAGE_CODE"><shadow type="text"><field name="TEXT">en</field></shadow><block type="locale_languageCode"></block></value></block><block type="androidTextToSpeech_isLanguageAndCountryAvailable_String"><value name="LANGUAGE_CODE"><shadow type="text"><field name="TEXT">en</field></shadow><block type="locale_languageCode"></block></value><value name="COUNTRY_CODE"><shadow type="text"><field name="TEXT">US</field></shadow><block type="locale_countryCode"></block></value></block><block type="androidTextToSpeech_setLanguage_String"><value name="LANGUAGE_CODE"><shadow type="text"><field name="TEXT">en</field></shadow><block type="locale_languageCode"></block></value></block><block type="androidTextToSpeech_setLanguageAndCountry_String"><value name="LANGUAGE_CODE"><shadow type="text"><field name="TEXT">en</field></shadow><block type="locale_languageCode"></block></value><value name="COUNTRY_CODE"><shadow type="text"><field name="TEXT">US</field></shadow><block type="locale_countryCode"></block></value></block><block type="androidTextToSpeech_speak_String"><value name="TEXT"><shadow type="text"><field name="TEXT">Get to the choppa!</field></shadow></value></block></category></category><category name="Vision"><category name="VisionPortal.Builder"><block type="visionPortalBuilder_create_assign"><comment pinned="false" h="150" w="325">Create a VisionPortal.Builder object so you can specify attributes about the cameras. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field></block><block type="visionPortalBuilder_setCamera"><comment pinned="false" h="150" w="325">Set the camera to the specified webcam name. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="CAMERA"><shadow type="navigation_webcamName"></shadow></value></block><block type="visionPortalBuilder_setStreamFormat"><comment pinned="false" h="150" w="325">Set the stream format. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="STREAM_FORMAT"><shadow type="visionPortal_typedEnum_streamFormat"></shadow></value></block><block type="visionPortalBuilder_enableLiveView"><comment pinned="false" h="150" w="325">Enable the live camera preview. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="ENABLE_CAMERA_MONITORING"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="visionPortalBuilder_setAutoStopLiveView"><comment pinned="false" h="150" w="325">Set whether to automatically stop the LiveView (RC preview) when all vision processors are disabled. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="AUTO_STOP_LIVE_VIEW"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="visionPortalBuilder_setAutoStartStreamOnBuild"><comment pinned="false" h="150" w="325">Set whether the VisionPortal should automatically start streaming when you issue a .build() call on this VisionPortal.Builder object. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="AUTO_START_STREAM_ON_BUILD"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="visionPortalBuilder_setShowStatsOverlay"><comment pinned="false" h="150" w="325">Set whether the statistics overlay should be shown on the LiveView. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="SHOW_STATS_OVERLAY"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="visionPortalBuilder_setLiveViewContainerId"><comment pinned="false" h="150" w="325">Set the LiveView container id. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field></block><block type="visionPortalBuilder_setCameraResolution"><comment pinned="false" h="150" w="325">Set the camera resolution. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="CAMERA_WIDTH"><shadow type="math_number"><field name="NUM">640</field></shadow></value><value name="CAMERA_HEIGHT"><shadow type="math_number"><field name="NUM">480</field></shadow></value></block><block type="visionPortalBuilder_addProcessor"><comment pinned="false" h="150" w="325">Add the AprilTag processor. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block><block type="visionPortalBuilder_addProcessor"><comment pinned="false" h="150" w="325">Add the color blob locator processor. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value></block><block type="visionPortalBuilder_addProcessor"><comment pinned="false" h="150" w="325">Add the predominant color processor. </comment><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myPredominantColorProcessor</field></block></value></block><block type="variables_set"><comment pinned="false" h="150" w="325">Build the VisionPortal object and assign it to a variable. </comment><field name="VAR">myVisionPortal</field><value name="VALUE"><block type="visionPortalBuilder_build"><field name="VISION_PORTAL_BUILDER" variabletype="VisionPortal.Builder">myVisionPortalBuilder</field></block></value></block></category><category name="VisionPortal"><block type="variables_set"><comment pinned="false" h="150" w="325">Create a VisionPortal, with the specified webcam name and AprilTag processor, and assign it to a variable. </comment><field name="VAR">myVisionPortal</field><value name="VALUE"><block type="visionPortal_easyCreateWithDefaults_oneProcessor"><value name="CAMERA"><shadow type="navigation_webcamName"></shadow></value><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block></value></block><block type="visionPortal_setProcessorEnabled"><comment pinned="false" h="150" w="325">Enable or disable the AprilTag processor. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value><value name="ENABLED"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="visionPortal_getProcessorEnabled"><comment pinned="false" h="150" w="325">Get whether the AprilTag processor is enabled. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value><value name="VISION_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block><block type="visionPortal_getCameraState"><comment pinned="false" h="150" w="325">Get the state of the camera. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_typedEnum_cameraState"><field name="CAMERA_STATE">STREAMING</field></block><block type="visionPortal_saveNextFrameRaw"><comment pinned="false" h="150" w="325">Save the next frame to the given file. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value><value name="FILENAME"><shadow type="text"><field name="TEXT">CameraFrameCapture-0</field></shadow></value></block><block type="visionPortal_stopStreaming"><comment pinned="false" h="150" w="325">Temporarily stop the streaming session. This can save CPU resources, with the ability to resume quickly when needed. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_resumeStreaming"><comment pinned="false" h="150" w="325">Resume the streaming session if previously stopped. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_stopLiveView"><comment pinned="false" h="150" w="325">Temporarily stop the LiveView (RC preview). </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_resumeLiveView"><comment pinned="false" h="150" w="325">Start the LiveView (RC preview) again. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_getFps"><comment pinned="false" h="150" w="325">Get the current vision frame rate. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_makeMultiPortalView"><value name="NUM_PORTALS"><shadow type="math_number"><field name="NUM">2</field></shadow></value><value name="MULTI_PORTAL_LAYOUT"><shadow type="visionPortal_typedEnum_multiPortalLayout"><field name="MULTI_PORTAL_LAYOUT">HORIZONTAL</field></shadow></value></block><block type="variables_set"><field name="VAR">myExposureControl</field><value name="VALUE"><block type="visionPortal_getExposureControl"><comment pinned="false" h="150" w="325">Get the ExposureControl object, to allow adjusting the camera\'s exposure. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myFocusControl</field><value name="VALUE"><block type="visionPortal_getFocusControl"><comment pinned="false" h="150" w="325">Get the FocusControl object, to allow adjusting the camera\'s focus length. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myGainControl</field><value name="VALUE"><block type="visionPortal_getGainControl"><comment pinned="false" h="150" w="325">Get the GainControl object, to allow adjusting the camera\'s gain. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myPtzControl</field><value name="VALUE"><block type="visionPortal_getPtzControl"><comment pinned="false" h="150" w="325">Get the PtzControl object, to allow adjusting the camera\'s pan, tilt, and zoom. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myWhiteBalanceControl</field><value name="VALUE"><block type="visionPortal_getWhiteBalanceControl"><comment pinned="false" h="150" w="325">Get the WhiteBalanceControl object, to allow adjusting the camera\'s white balance temperature. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></value></block><block type="visionPortal_CameraStreamServer_setSource"><comment pinned="false" h="150" w="615">Set which Vision Portal is the source of the DS Camera Stream image. Default is the last built Vision Portal.  This setSource() Block is useful under MultiPortal. The camera view of the designated Vision Portal will be routed to the Driver Station (DS) Camera Stream. An OpMode can change this while running, during the INIT stage. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block><block type="visionPortal_close"><comment pinned="false" h="150" w="325">Save computing resources by closing the camera stream, if no longer needed. </comment><value name="VISION_PORTAL"><block type="variables_get"><field name="VAR">myVisionPortal</field></block></value></block></category><category name="AprilTag"><category name="AprilTagProcessor.Builder"><block type="aprilTagProcessorBuilder_create_assign"><comment pinned="false" h="150" w="325">Create a new AprilTagProcessor.Builder object and assign it to a variable. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field></block><block type="aprilTagProcessorBuilder_setDrawAxes"><comment pinned="false" h="150" w="325">Set whether or not to draw the axes on detections. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="DRAW_AXES"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagProcessorBuilder_setDrawCubeProjection"><comment pinned="false" h="150" w="325">Set whether or not to draw the cube projection on detections. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="DRAW_CUBE"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagProcessorBuilder_setDrawTagOutline"><comment pinned="false" h="150" w="325">Set whether or not to draw the tag outline on detections. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="DRAW_OUTLINE"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagProcessorBuilder_setDrawTagID"><comment pinned="false" h="150" w="325">Set whether or not to draw the tag ID on detections. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="DRAW_TAG_ID"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagProcessorBuilder_setCameraPose"><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="POSITION"><block type="variables_get"><field name="VAR">cameraPosition</field></block></value><value name="ORIENTATION"><block type="variables_get"><field name="VAR">cameraOrientation</field></block></value></block><block type="aprilTagProcessorBuilder_setLensIntrinsics"><comment pinned="false" h="150" w="325">Set the lens intrinsics, obtained from a camera calibration. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="FX"><shadow type="math_number"><field name="NUM">578.272</field></shadow></value><value name="FY"><shadow type="math_number"><field name="NUM">578.272</field></shadow></value><value name="CX"><shadow type="math_number"><field name="NUM">402.145</field></shadow></value><value name="CY"><shadow type="math_number"><field name="NUM">221.506</field></shadow></value></block><block type="aprilTagProcessorBuilder_setSuppressCalibrationWarnings"><comment pinned="false" h="150" w="325">Set whether any warnings about camera calibration should be suppressed. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="SUPPRESS_CALIBRATION_WARNINGS"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagProcessorBuilder_setNumThreads"><comment pinned="false" h="150" w="325">Set the number of threads to use for detection. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="NUM_THREADS"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block><block type="aprilTagProcessorBuilder_setOutputUnits"><comment pinned="false" h="150" w="325">Set the output units. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"><field name="DISTANCE_UNIT">INCH</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value></block><block type="aprilTagProcessorBuilder_setTagFamily"><comment pinned="false" h="150" w="325">Set the tag family to be detected. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="TAG_FAMILY"><shadow type="aprilTag_typedEnum_tagFamily"><field name="TAG_FAMILY">TAG_36h11</field></shadow></value></block><block type="aprilTagProcessorBuilder_setTagLibrary"><comment pinned="false" h="150" w="325">Set the tag library. </comment><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field><value name="APRIL_TAG_LIBRARY"><block type="variables_get"><field name="VAR">myAprilTagLibrary</field></block></value></block><block type="variables_set"><comment pinned="false" h="150" w="325">Build the AprilTag processor and assign it to a variable. </comment><field name="VAR">myAprilTagProcessor</field><value name="VALUE"><block type="aprilTagProcessorBuilder_build"><field name="APRIL_TAG_PROCESSOR_BUILDER" variabletype="AprilTagProcessor.Builder">myAprilTagProcessorBuilder</field></block></value></block></category><category name="AprilTagProcessor"><block type="variables_set"><comment pinned="false" h="150" w="325">Create the AprilTag processor and assign it to a variable. </comment><field name="VAR">myAprilTagProcessor</field><value name="VALUE"><block type="aprilTagProcessor_easyCreateWithDefaults"></block></value></block><block type="variables_set"><field name="VAR">myAprilTagDetections</field><value name="VALUE"><block type="aprilTagProcessor_getDetections"><comment pinned="false" h="150" w="325">Get a list containing the latest detections, which may be stale. </comment><value name="APRIL_TAG_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myAprilTagDetections</field><value name="VALUE"><block type="aprilTagProcessor_getFreshDetections"><comment pinned="false" h="150" w="325">Get a list containing detections that were detected since the last call to this method, or null if no new detections are available. This is useful to avoid re-processing the same detections multiple times. </comment><value name="APRIL_TAG_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block></value></block><block type="aprilTagProcessor_setDecimation"><comment pinned="false" h="150" w="325">Set the detector decimation. </comment><value name="APRIL_TAG_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value><value name="DECIMATION"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="aprilTagProcessor_setPoseSolver"><comment pinned="false" h="150" w="325">Set the pose solver. </comment><value name="APRIL_TAG_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value><value name="POSE_SOLVER"><shadow type="aprilTag_typedEnum_poseSolver"><field name="POSE_SOLVER">APRILTAG_BUILTIN</field></shadow></value></block><block type="aprilTagProcessor_getPerTagAvgPoseSolveTime"><comment pinned="false" h="150" w="325">Get the per tag average pose solve time. </comment><value name="APRIL_TAG_PROCESSOR"><block type="variables_get"><field name="VAR">myAprilTagProcessor</field></block></value></block></category><category name="AprilTagDetection"><block type="aprilTagDetection_getProperty_Number"><field name="PROP">id</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">hamming</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">decisionMargin</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">center.x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">center.y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[0].x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[0].y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[1].x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[1].y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[2].x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[2].y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[3].x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">corners[3].y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_IsNotNull"><field name="PROP">metadata</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_String"><field name="PROP">metadata.name</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_AprilTagMetadata"><field name="PROP">metadata</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_IsNotNull"><field name="PROP">ftcPose</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.z</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.yaw</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.pitch</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.roll</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.range</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.bearing</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">ftcPose.elevation</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_AprilTagPoseFtc"><field name="PROP">ftcPose</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_IsNotNull"><field name="PROP">rawPose</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">rawPose.x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">rawPose.y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">rawPose.z</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_MatrixF"><field name="PROP">rawPose.R</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_AprilTagPoseRaw"><field name="PROP">rawPose</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_IsNotNull"><field name="PROP">robotPose</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.position.x</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.position.y</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.position.z</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.orientation.roll</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.orientation.pitch</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block><block type="aprilTagDetection_getProperty_Number"><field name="PROP">robotPose.orientation.yaw</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block></category><category name="AprilTagLibrary"><block type="variables_set"><field name="VAR">myAprilTagLibrary</field><value name="VALUE"><block type="aprilTagGameDatabase_getCurrentGameTagLibrary"><comment pinned="false" h="150" w="325">Get the AprilTagLibrary for the current season. </comment></block></value></block><block type="variables_set"><field name="VAR">myAprilTagLibrary</field><value name="VALUE"><block type="aprilTagGameDatabase_DecodeTagLibrary"><comment pinned="false" h="150" w="325">Get the AprilTagLibrary for the Decode FTC game. </comment></block></value></block><block type="variables_set"><field name="VAR">myAprilTagLibrary</field><value name="VALUE"><block type="aprilTagGameDatabase_getSampleTagLibrary"><comment pinned="false" h="150" w="325">Get the AprilTagLibrary for the tags used in the sample OpModes. </comment></block></value></block><block type="aprilTagLibraryBuilder_create_assign"><comment pinned="false" h="150" w="325">Create a new AprilTagLibrary.Builder objectand assigns it to a variable. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field></block><block type="aprilTagLibraryBuilder_setAllowOverwrite"><comment pinned="false" h="150" w="325">Set whether to allow a new tag to be added when the library already contains a tag with the same ID. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field><value name="ALLOW_OVERWRITE"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="aprilTagLibraryBuilder_addTag_withMetadata"><comment pinned="false" h="150" w="325">Add a tag to the AprilTagLibrary.Builder. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagLibraryBuilder_addTag_withoutPoseInfo"><comment pinned="false" h="150" w="325">Add a tag, without pose information, to the AprilTagLibrary.Builder. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field><value name="ID"><shadow type="math_number"><field name="NUM">67</field></shadow></value><value name="NAME"><shadow type="text"><field name="TEXT">Team Tag</field></shadow></value><value name="TAG_SIZE"><shadow type="math_number"><field name="NUM">0.125</field></shadow></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"><field name="DISTANCE_UNIT">INCH</field></shadow></value></block><block type="aprilTagLibraryBuilder_addTag"><comment pinned="false" h="150" w="325">Add a tag to the AprilTagLibrary.Builder. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field><value name="ID"><shadow type="math_number"><field name="NUM">67</field></shadow></value><value name="NAME"><shadow type="text"><field name="TEXT">Team Tag</field></shadow></value><value name="TAG_SIZE"><shadow type="math_number"><field name="NUM">0.125</field></shadow></value><value name="FIELD_POSITION"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"><field name="DISTANCE_UNIT">INCH</field></shadow></value><value name="FIELD_ORIENTATION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="aprilTagLibraryBuilder_addTags"><comment pinned="false" h="150" w="325">Add all the tags from the given AprilTagLibrary to the AprilTagLibrary.Builder. </comment><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field><value name="APRIL_TAG_LIBRARY"><block type="variables_get"><field name="VAR">myAprilTagLibrary</field></block></value></block><block type="variables_set"><comment pinned="false" h="150" w="325">Build the AprilTag library and assign it to a variable. </comment><field name="VAR">myAprilTagLibrary</field><value name="VALUE"><block type="aprilTagLibraryBuilder_build"><field name="APRIL_TAG_LIBRARY_BUILDER" variabletype="AprilTagLibrary.Builder">myAprilTagLibraryBuilder</field></block></value></block><block type="variables_set"><field name="VAR">myAprilTagMetadata</field><value name="VALUE"><block type="aprilTagLibrary_lookupTag"><comment pinned="false" h="150" w="325">Look up a tag id in the AprilTagLibrary. </comment><value name="APRIL_TAG_LIBRARY"><block type="variables_get"><field name="VAR">myAprilTagLibrary</field></block></value><value name="ID"><block type="aprilTagDetection_getProperty_Number"><field name="PROP">id</field><value name="APRIL_TAG_DETECTION"><block type="variables_get"><field name="VAR">myAprilTagDetection</field></block></value></block></value></block></value></block></category><category name="AprilTagMetadata"><block type="variables_set"><comment pinned="false" h="150" w="325">Create a new AprilTagMetdata object and assign it to a variable. </comment><field name="VAR">myAprilTagMetadata</field><value name="VALUE"><block type="aprilTagMetadata_create"><value name="ID"><shadow type="math_number"><field name="NUM">67</field></shadow></value><value name="NAME"><shadow type="text"><field name="TEXT">Team Tag</field></shadow></value><value name="TAG_SIZE"><shadow type="math_number"><field name="NUM">0.125</field></shadow></value><value name="FIELD_POSITION"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"><field name="DISTANCE_UNIT">INCH</field></shadow></value><value name="FIELD_ORIENTATION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block></value></block><block type="variables_set"><comment pinned="false" h="150" w="325">Create a new AprilTagMetdata object and assign it to a variable. </comment><field name="VAR">myAprilTagMetadata</field><value name="VALUE"><block type="aprilTagMetadata_create_withoutPoseInfo"><value name="ID"><shadow type="math_number"><field name="NUM">67</field></shadow></value><value name="NAME"><shadow type="text"><field name="TEXT">Team Tag</field></shadow></value><value name="TAG_SIZE"><shadow type="math_number"><field name="NUM">0.125</field></shadow></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"><field name="DISTANCE_UNIT">INCH</field></shadow></value></block></value></block><block type="aprilTagMetadata_getProperty_DistanceUnit"><field name="PROP">distanceUnit</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagMetadata_getProperty_Quaternion"><field name="PROP">fieldOrientation</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagMetadata_getProperty_VectorF"><field name="PROP">fieldPosition</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagMetadata_getProperty_Number"><field name="PROP">id</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagMetadata_getProperty_String"><field name="PROP">name</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block><block type="aprilTagMetadata_getProperty_Number"><field name="PROP">tagsize</field><value name="APRIL_TAG_METADATA"><block type="variables_get"><field name="VAR">myAprilTagMetadata</field></block></value></block></category></category><category name="ColorBlobLocator"><category name="Processor.Builder"><block type="colorBlobLocatorProcessorBuilder_create_assign"><comment pinned="false" h="150" w="325">Create a new ColorBlobLocatorProcessor.Builder object and assign it to a variable. </comment><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field></block><block type="colorBlobLocatorProcessorBuilder_setDrawContours"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="DRAW_CONTOURS"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setBoxFitColor"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR"><shadow type="color_constant_Number"><field name="CONSTANT">WHITE</field></shadow><block type="color_rgbToColor_Number"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">120</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">31</field></shadow></value></block></value></block><block type="colorBlobLocatorProcessorBuilder_setCircleFitColor"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR"><shadow type="color_constant_Number"><field name="CONSTANT">WHITE</field></shadow><block type="color_rgbToColor_Number"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></value></block><block type="colorBlobLocatorProcessorBuilder_setRoiColor"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR"><shadow type="color_constant_Number"><field name="CONSTANT">WHITE</field></shadow><block type="color_rgbToColor_Number"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">255</field></shadow></value></block></value></block><block type="colorBlobLocatorProcessorBuilder_setContourColor"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR"><shadow type="color_constant_Number"><field name="CONSTANT">WHITE</field></shadow><block type="color_rgbToColor_Number"><value name="RED"><shadow type="math_number"><field name="NUM">3</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">227</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">252</field></shadow></value></block></value></block><block type="colorBlobLocatorProcessorBuilder_setTargetColorRange"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR_RANGE"><shadow type="colorRange_constant_ColorRange"><field name="CONSTANT">ARTIFACT_GREEN</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setTargetColorRange"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR_RANGE"><shadow type="colorRange_constant_ColorRange"><field name="CONSTANT">ARTIFACT_PURPLE</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setTargetColorRange"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR_RANGE"><shadow type="colorRange_constant_ColorRange"><field name="CONSTANT">BLUE</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setTargetColorRange"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="COLOR_RANGE"><shadow type="colorRange_constant_ColorRange"><field name="CONSTANT">BLUE</field></shadow><block type="colorRange_create"><value name="COLOR_SPACE"><shadow type="colorSpace_typedEnum_colorSpace"><field name="COLOR_SPACE">YCrCb</field></shadow></value><value name="MIN"><block type="scalar_create_with3"><value name="V0"><shadow type="math_number"><field name="NUM">16</field></shadow></value><value name="V1"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="V2"><shadow type="math_number"><field name="NUM">155</field></shadow></value></block></value><value name="MAX"><block type="scalar_create_with3"><value name="V0"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="V1"><shadow type="math_number"><field name="NUM">127</field></shadow></value><value name="V2"><shadow type="math_number"><field name="NUM">255</field></shadow></value></block></value></block></value></block><block type="colorBlobLocatorProcessorBuilder_setContourMode"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="CONTOUR_MODE"><shadow type="colorBlobLocator_typedEnum_contourMode"><field name="CONTOUR_MODE">EXTERNAL_ONLY</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setRoi"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="ROI"><shadow type="imageRegion_entireFrame"></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setBlurSize"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="BLUR_SIZE"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setMorphOperationType"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="MORPH_OPERATION_TYPE"><shadow type="colorBlobLocator_typedEnum_morphOperationType"><field name="MORPH_OPERATION_TYPE">EXTERNAL_ONLY</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setErodeSize"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="ERODE_SIZE"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="colorBlobLocatorProcessorBuilder_setDilateSize"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field><value name="DILATE_SIZE"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="variables_set"><comment pinned="false" h="150" w="325">Build the ColorBlobLocatorProcessor and assign it to a variable. </comment><field name="VAR">myColorBlobLocatorProcessor</field><value name="VALUE"><block type="colorBlobLocatorProcessorBuilder_build"><field name="COLOR_BLOB_LOCATOR_PROCESSOR_BUILDER" variabletype="ColorBlobLocatorProcessor.Builder">myColorBlobLocatorProcessorBuilder</field></block></value></block></category><category name="Processor"><block type="colorBlobLocatorProcessor_addFilter"><value name="COLOR_BLOB_LOCATOR_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value><value name="FILTER"><block type="variables_get"><field name="VAR">myFilter</field></block></value></block><block type="colorBlobLocatorProcessor_removeFilter"><value name="COLOR_BLOB_LOCATOR_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value><value name="FILTER"><block type="variables_get"><field name="VAR">myFilter</field></block></value></block><block type="colorBlobLocatorProcessor_removeAllFilters"><value name="COLOR_BLOB_LOCATOR_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value></block><block type="colorBlobLocatorProcessor_setSort"><value name="COLOR_BLOB_LOCATOR_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value><value name="SORT"><block type="variables_get"><field name="VAR">mySort</field></block></value></block><block type="variables_set"><field name="VAR">myBlobs</field><value name="VALUE"><block type="colorBlobLocatorProcessor_getBlobs"><value name="COLOR_BLOB_LOCATOR_PROCESSOR"><block type="variables_get"><field name="VAR">myColorBlobLocatorProcessor</field></block></value></block></value></block></category><category name="Pre-processing"><block type="variables_set"><field name="VAR">myFilter</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobFilter_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CONTOUR_AREA</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">50</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">20000</field></shadow></value></block></value></block><block type="variables_set"><field name="VAR">myFilter</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobFilter_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_DENSITY</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value></block></value></block><block type="variables_set"><field name="VAR">myFilter</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobFilter_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_ASPECT_RATIO</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">3.0</field></shadow></value></block></value></block><sep gap="32"></sep><block type="variables_set"><field name="VAR">mySort</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobSort_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CONTOUR_AREA</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value></block></value></block><block type="variables_set"><field name="VAR">mySort</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobSort_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_DENSITY</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value></block></value></block><block type="variables_set"><field name="VAR">mySort</field><value name="VALUE"><block type="colorBlobLocatorProcessorBlobSort_create"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_ASPECT_RATIO</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value></block></value></block></category><category name="Post-processing"><block type="colorBlobLocatorProcessorUtil_filterByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CONTOUR_AREA</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">50</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">20000</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_sortByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CONTOUR_AREA</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_filterByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_DENSITY</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_sortByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_DENSITY</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_filterByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_ASPECT_RATIO</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">3.0</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_sortByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_ASPECT_RATIO</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_filterByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CIRCULARITY</field></shadow></value><value name="MIN_VALUE"><shadow type="math_number"><field name="NUM">0.9</field></shadow></value><value name="MAX_VALUE"><shadow type="math_number"><field name="NUM">1.01</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block><block type="colorBlobLocatorProcessorUtil_sortByCriteria"><value name="CRITERIA"><shadow type="colorBlobLocator_typedEnum_blobCriteria"><field name="CRITERIA">BY_CIRCULARITY</field></shadow></value><value name="SORT_ORDER"><shadow type="util_typedEnum_sortOrder"><field name="SORT_ORDER">DESCENDING</field></shadow></value><value name="BLOBS"><block type="variables_get"><field name="VAR">myBlobs</field></block></value></block></category><category name="Blob data"><block type="colorBlobLocatorProcessorBlob_getProperty_Array"><field name="PROP">ContourPoints</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Number"><field name="PROP">ContourArea</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Number"><field name="PROP">Density</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Number"><field name="PROP">AspectRatio</field><comment pinned="false" h="63" w="419">Get the aspect ratio of this blob, i.e. the ratio of the longer side of the "boxFit" bounding box to the shorter side.</comment><data>{"commentPositionLeft":-18,"commentPositionTop":-84}</data><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Number"><field name="PROP">ArcLength</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Number"><field name="PROP">Circularity</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_RotatedRect"><field name="PROP">BoxFit</field><comment pinned="false" h="55" w="424">Get a "best-fit" bounding box (called "boxFit", of type RotatedRect) for this blob.</comment><data>{"commentPositionLeft":-19,"commentPositionTop":-75}</data><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><block type="colorBlobLocatorProcessorBlob_getProperty_Circle"><field name="PROP">Circle</field><value name="BLOB"><block type="variables_get"><field name="VAR">myBlob</field></block></value></block><sep gap="32"></sep><block type="point_getProperty_Number"><field name="PROP">x</field><value name="POINT"><block type="variables_get"><field name="VAR">myPoint</field></block></value></block><block type="point_getProperty_Number"><field name="PROP">y</field><value name="POINT"><block type="variables_get"><field name="VAR">myPoint</field></block></value></block><sep gap="32"></sep><block type="rotatedRect_getProperty_Number"><field name="PROP">angle</field><value name="ROTATED_RECT"><block type="variables_get"><field name="VAR">myBoxFit</field></block></value></block><block type="rotatedRect_getProperty_Point"><field name="PROP">center</field><value name="ROTATED_RECT"><block type="variables_get"><field name="VAR">myBoxFit</field></block></value></block><block type="rotatedRect_getProperty_Size"><field name="PROP">size</field><value name="ROTATED_RECT"><block type="variables_get"><field name="VAR">myBoxFit</field></block></value></block><block type="rotatedRect_boundingRect"><value name="ROTATED_RECT"><block type="variables_get"><field name="VAR">myBoxFit</field></block></value></block><block type="rotatedRect_points"><comment pinned="false" h="62" w="425">Store the 4 corners of "myBoxFit" (rotatedRect) as a List of Points in the "myPoints" variable, clockwise from top left corner.</comment><data>{"commentPositionLeft":-19,"commentPositionTop":-86}</data><value name="ROTATED_RECT"><block type="variables_get"><field name="VAR">myBoxFit</field></block></value><value name="POINTS"><block type="variables_get"><field name="VAR">myPoints</field></block></value></block><sep gap="32"></sep><block type="size_getProperty_Number"><field name="PROP">width</field><value name="SIZE"><block type="variables_get"><field name="VAR">mySize</field></block></value></block><block type="size_getProperty_Number"><field name="PROP">height</field><value name="SIZE"><block type="variables_get"><field name="VAR">mySize</field></block></value></block><sep gap="32"></sep><block type="rect_getProperty_Number"><field name="PROP">x</field><comment pinned="false" h="61" w="321">Get the x value of myHorizontalBoxFit (top left corner).</comment><data>{"commentPositionLeft":-18,"commentPositionTop":-79}</data><value name="RECT"><block type="variables_get"><field name="VAR">myHorizontalBoxFit</field></block></value></block><block type="rect_getProperty_Number"><field name="PROP">y</field><comment pinned="false" h="60" w="338">Get the y value of myHorizontalBoxFit (top left corner).</comment><data>{"commentPositionLeft":-21,"commentPositionTop":-76}</data><value name="RECT"><block type="variables_get"><field name="VAR">myHorizontalBoxFit</field></block></value></block><block type="rect_getProperty_Number"><field name="PROP">width</field><comment pinned="false" h="41" w="307">Get the width value of myHorizontalBoxFit.</comment><data>{"commentPositionLeft":-20,"commentPositionTop":-61}</data><value name="RECT"><block type="variables_get"><field name="VAR">myHorizontalBoxFit</field></block></value></block><block type="rect_getProperty_Number"><field name="PROP">height</field><comment pinned="false" h="41" w="311">Get the height value of myHorizontalBoxFit.</comment><data>{"commentPositionLeft":-19,"commentPositionTop":-60}</data><value name="RECT"><block type="variables_get"><field name="VAR">myHorizontalBoxFit</field></block></value></block><sep gap="32"></sep><block type="circle_getProperty_Number"><field name="PROP">Radius</field><value name="CIRCLE"><block type="variables_get"><field name="VAR">myCircle</field></block></value></block><block type="circle_getProperty_Point"><field name="PROP">Center</field><value name="CIRCLE"><block type="variables_get"><field name="VAR">myCircle</field></block></value></block></category></category><category name="PredominantColor"><category name="Processor.Builder"><block type="predominantColorProcessorBuilder_create_assign"><comment pinned="false" h="150" w="325">Create a new PredominantColorProcessor.Builder object and assign it to a variable. </comment><field name="PREDOMINANT_COLOR_PROCESSOR_BUILDER" variabletype="PredominantColorProcessor.Builder">myPredominantColorProcessorBuilder</field></block><block type="predominantColorProcessorBuilder_setRoi"><field name="PREDOMINANT_COLOR_PROCESSOR_BUILDER" variabletype="PredominantColorProcessor.Builder">myPredominantColorProcessorBuilder</field><value name="ROI"><shadow type="imageRegion_entireFrame"></shadow></value></block><block type="predominantColorProcessorBuilder_setSwatches" inline="false"><mutation items="3"/><field name="PREDOMINANT_COLOR_PROCESSOR_BUILDER" variabletype="PredominantColorProcessor.Builder">myPredominantColorProcessorBuilder</field><value name="SWATCH0"><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">RED</field></block></value><value name="SWATCH1"><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">WHITE</field></block></value><value name="SWATCH2"><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">BLUE</field></block></value></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">ARTIFACT_GREEN</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">ARTIFACT_PURPLE</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">RED</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">ORANGE</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">YELLOW</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">GREEN</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">CYAN</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">BLUE</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">PURPLE</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">MAGENTA</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">BLACK</field></block><block type="predominantColor_typedEnum_swatch"><field name="SWATCH">WHITE</field></block><block type="variables_set"><comment pinned="false" h="150" w="325">Build the PredominantColorProcessor and assign it to a variable. </comment><field name="VAR">myPredominantColorProcessor</field><value name="VALUE"><block type="predominantColorProcessorBuilder_build"><field name="PREDOMINANT_COLOR_PROCESSOR_BUILDER" variabletype="PredominantColorProcessor.Builder">myPredominantColorProcessorBuilder</field></block></value></block></category><category name="Processor"><block type="variables_set"><field name="VAR">myResult</field><value name="VALUE"><block type="predominantColorProcessor_getAnalysis"><value name="PREDOMINANT_COLOR_PROCESSOR"><block type="variables_get"><field name="VAR">myPredominantColorProcessor</field></block></value></block></value></block><sep gap="32"></sep><block type="predominantColorProcessorResult_getProperty_Number"><field name="PROP">rgb</field><value name="RESULT"><block type="variables_get"><field name="VAR">myResult</field></block></value></block><block type="predominantColorProcessorResult_getProperty_Swatch"><field name="PROP">closestSwatch</field><value name="RESULT"><block type="variables_get"><field name="VAR">myResult</field></block></value></block><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="predominantColorProcessorResult_getProperty_Swatch"><field name="PROP">closestSwatch</field><value name="RESULT"><block type="variables_get"><field name="VAR">myResult</field></block></value></block></value><value name="B"><block type="predominantColor_typedEnum_swatch"></block></value></block></category></category><category name="ImageRegion"><block type="imageRegion_asImageCoordinates"><value name="LEFT"><shadow type="math_number"><field name="NUM">50</field></shadow></value><value name="TOP"><shadow type="math_number"><field name="NUM">50</field></shadow></value><value name="RIGHT"><shadow type="math_number"><field name="NUM">150</field></shadow></value><value name="BOTTOM"><shadow type="math_number"><field name="NUM">150</field></shadow></value></block><block type="imageRegion_asUnityCenterCoordinates"><value name="LEFT"><shadow type="math_number"><field name="NUM">-0.5</field></shadow></value><value name="TOP"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value><value name="RIGHT"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value><value name="BOTTOM"><shadow type="math_number"><field name="NUM">-0.5</field></shadow></value></block><block type="imageRegion_entireFrame"></block></category><category name="Webcam Controls"><category name="ExposureControl"><block type="exposureControl_getMode"><comment pinned="false" h="150" w="325">Get the current exposure mode value. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value></block><block type="exposureControl_setMode"><comment pinned="false" h="150" w="325">Set the exposure mode value. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="MODE"><shadow type="exposureControl_typedEnum_mode"><field name="MODE">Manual</field></shadow></value></block><block type="exposureControl_isModeSupported"><comment pinned="false" h="150" w="325">Get whether the given ExposureControl.Mode is supported. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="MODE"><shadow type="exposureControl_typedEnum_mode"><field name="MODE">Manual</field></shadow></value></block><block type="exposureControl_typedEnum_mode"><field name="MODE">Manual</field></block><block type="exposureControl_getExposure"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) exposure. </comment><field name="FUNC">getMinExposure</field><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="TIME_UNIT"><shadow type="misc_typedEnum_TimeUnit"><field name="TIME_UNIT">MILLISECONDS</field></shadow></value></block><block type="exposureControl_getExposure"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) exposure. </comment><field name="FUNC">getMaxExposure</field><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="TIME_UNIT"><shadow type="misc_typedEnum_TimeUnit"><field name="TIME_UNIT">MILLISECONDS</field></shadow></value></block><block type="exposureControl_getExposure"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) exposure. </comment><field name="FUNC">getExposure</field><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="TIME_UNIT"><shadow type="misc_typedEnum_TimeUnit"><field name="TIME_UNIT">MILLISECONDS</field></shadow></value></block><block type="exposureControl_setExposure"><comment pinned="false" h="150" w="325">Set the exposure. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="DURATION"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="TIME_UNIT"><shadow type="misc_typedEnum_TimeUnit"><field name="TIME_UNIT">MILLISECONDS</field></shadow></value></block><block type="exposureControl_isExposureSupported"><comment pinned="false" h="150" w="325">Get whether exposure is supported. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value></block><block type="exposureControl_getAePriority"><comment pinned="false" h="150" w="325">Get the AE priority. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value></block><block type="exposureControl_setAePriority"><comment pinned="false" h="150" w="325">Set the AE priority. </comment><value name="EXPOSURE_CONTROL"><block type="variables_get"><field name="VAR">myExposureControl</field></block></value><value name="PRIORITY"><shadow type="logic_boolean"><field name="BOOL">TRUE</field></shadow></value></block></category><category name="FocusControl"><block type="focusControl_getMode"><comment pinned="false" h="150" w="325">Get the current focus mode value. </comment><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value></block><block type="focusControl_setMode"><comment pinned="false" h="150" w="325">Set the focus mode value. </comment><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value><value name="MODE"><shadow type="focusControl_typedEnum_mode"><field name="MODE">Fixed</field></shadow></value></block><block type="focusControl_isModeSupported"><comment pinned="false" h="150" w="325">Get whether the given FocusControl.Mode is supported. </comment><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value><value name="MODE"><shadow type="focusControl_typedEnum_mode"><field name="MODE">Fixed</field></shadow></value></block><block type="focusControl_typedEnum_mode"><field name="MODE">Fixed</field></block><block type="focusControl_getFocusLength"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) focus length. </comment><field name="FUNC">getMinFocusLength</field><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value></block><block type="focusControl_getFocusLength"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) focus length. </comment><field name="FUNC">getMaxFocusLength</field><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value></block><block type="focusControl_getFocusLength"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) focus length. </comment><field name="FUNC">getFocusLength</field><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value></block><block type="focusControl_setFocusLength"><comment pinned="false" h="150" w="325">Set the focus length. </comment><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value><value name="FOCUS_LENGTH"><shadow type="math_number"><field name="NUM">100</field></shadow></value></block><block type="focusControl_isFocusLengthSupported"><comment pinned="false" h="150" w="325">Get whether focus is supported. </comment><value name="FOCUS_CONTROL"><block type="variables_get"><field name="VAR">myFocusControl</field></block></value></block></category><category name="GainControl"><block type="gainControl_getGain"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) gain. </comment><field name="FUNC">getMinGain</field><value name="GAIN_CONTROL"><block type="variables_get"><field name="VAR">myGainControl</field></block></value></block><block type="gainControl_getGain"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) gain. </comment><field name="FUNC">getMaxGain</field><value name="GAIN_CONTROL"><block type="variables_get"><field name="VAR">myGainControl</field></block></value></block><block type="gainControl_getGain"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) gain. </comment><field name="FUNC">getGain</field><value name="GAIN_CONTROL"><block type="variables_get"><field name="VAR">myGainControl</field></block></value></block><block type="gainControl_setGain"><comment pinned="false" h="150" w="325">Set the gain. Requires Exposure Control Mode to be MANUAL. </comment><value name="GAIN_CONTROL"><block type="variables_get"><field name="VAR">myGainControl</field></block></value><value name="GAIN"><shadow type="math_number"><field name="NUM">25</field></shadow></value></block></category><category name="PtzControl"><block type="variables_set"><field name="VAR">myPanTiltHolder</field><value name="VALUE"><block type="ptzControl_getPanTilt"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) virtual pan/tilt. </comment><field name="FUNC">getMinPanTilt</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myPanTiltHolder</field><value name="VALUE"><block type="ptzControl_getPanTilt"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) virtual pan/tilt. </comment><field name="FUNC">getMaxPanTilt</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block></value></block><block type="variables_set"><field name="VAR">myPanTiltHolder</field><value name="VALUE"><block type="ptzControl_getPanTilt"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) virtual pan/tilt. </comment><field name="FUNC">getPanTilt</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block></value></block><block type="ptzControl_setPanTilt"><comment pinned="false" h="150" w="325">Set the virtual pan/tilt. </comment><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value><value name="PAN_TILT_HOLDER"><block type="variables_get"><field name="VAR">myPanTiltHolder</field></block></value></block><block type="variables_set"><field name="VAR">myPanTiltHolder</field><value name="VALUE"><block type="panTiltHolder_create"></block></value></block><block type="panTiltHolder_getProperty_Number"><comment pinned="false" h="150" w="325">Get the pan value from the given PanTiltHolder object. </comment><field name="PROP">pan</field><value name="PAN_TILT_HOLDER"><block type="variables_get"><field name="VAR">myPanTiltHolder</field></block></value></block><block type="panTiltHolder_getProperty_Number"><comment pinned="false" h="150" w="325">Get the tilt value from the given PanTiltHolder object. </comment><field name="PROP">tilt</field><value name="PAN_TILT_HOLDER"><block type="variables_get"><field name="VAR">myPanTiltHolder</field></block></value></block><block type="panTiltHolder_setProperty_Number"><comment pinned="false" h="150" w="325">Set the pan field in the given PanTiltHolder object. </comment><field name="PROP">pan</field><value name="PAN_TILT_HOLDER"><block type="variables_get"><field name="VAR">myPanTiltHolder</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="panTiltHolder_setProperty_Number"><comment pinned="false" h="150" w="325">Set the tilt value in the given PanTiltHolder object </comment><field name="PROP">tilt</field><value name="PAN_TILT_HOLDER"><block type="variables_get"><field name="VAR">myPanTiltHolder</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="ptzControl_getZoom"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) zoom. </comment><field name="FUNC">getMinZoom</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block><block type="ptzControl_getZoom"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) zoom. </comment><field name="FUNC">getMaxZoom</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block><block type="ptzControl_getZoom"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) zoom. </comment><field name="FUNC">getZoom</field><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value></block><block type="ptzControl_setZoom"><comment pinned="false" h="150" w="325">Set the zoom. </comment><value name="PTZ_CONTROL"><block type="variables_get"><field name="VAR">myPtzControl</field></block></value><value name="ZOOM"><shadow type="math_number"><field name="NUM">3</field></shadow></value></block></category><category name="WhiteBalanceControl"><block type="whiteBalanceControl_getMode"><comment pinned="false" h="150" w="325">Get the current white balance mode value. </comment><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value></block><block type="whiteBalanceControl_setMode"><comment pinned="false" h="150" w="325">Set the white balance mode value. </comment><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value><value name="MODE"><shadow type="whiteBalanceControl_typedEnum_mode"><field name="MODE">MANUAL</field></shadow></value></block><block type="whiteBalanceControl_typedEnum_mode"><field name="MODE">MANUAL</field></block><block type="whiteBalanceControl_getWhiteBalanceTemperature"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) white balance temperature, in degrees Kelvin. </comment><field name="FUNC">getMinWhiteBalanceTemperature</field><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value></block><block type="whiteBalanceControl_getWhiteBalanceTemperature"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) white balance temperature, in degrees Kelvin. </comment><field name="FUNC">getMaxWhiteBalanceTemperature</field><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value></block><block type="whiteBalanceControl_getWhiteBalanceTemperature"><comment pinned="false" h="150" w="325">Get the current (or minimum or maximum) white balance temperature, in degrees Kelvin. </comment><field name="FUNC">getWhiteBalanceTemperature</field><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value></block><block type="whiteBalanceControl_setWhiteBalanceTemperature"><comment pinned="false" h="150" w="325">Set the white balance temperature, in degrees Kelvin. </comment><value name="WHITE_BALANCE_CONTROL"><block type="variables_get"><field name="VAR">myWhiteBalanceControl</field></block></value><value name="WHITE_BALANCE_TEMPERATURE"><shadow type="math_number"><field name="NUM">3000</field></shadow></value></block></category></category></category><category name="Utilities"><category name="Acceleration"><block type="acceleration_getProperty_DistanceUnit"><field name="PROP">DistanceUnit</field><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_getProperty_Number"><field name="PROP">XAccel</field><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_getProperty_Number"><field name="PROP">YAccel</field><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_getProperty_Number"><field name="PROP">ZAccel</field><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_toDistanceUnit"><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value></block><block type="acceleration_toText"><value name="ACCELERATION"><block type="variables_get"><field name="VAR">myAcceleration</field></block></value></block><block type="acceleration_create"></block><block type="acceleration_create_withArgs"><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value><value name="X_ACCEL"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="Y_ACCEL"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="Z_ACCEL"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block><block type="acceleration_fromGravity"><value name="GX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="GY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="GZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="AngleUnit"><block type="navigation_angleUnit_normalize"><value name="ANGLE"><shadow type="math_number"><field name="NUM">360</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value></block><block type="navigation_angleUnit_convert"><value name="ANGLE"><shadow type="math_number"><field name="NUM">3.14</field></shadow></value><value name="FROM_ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">RADIANS</field></shadow></value><value name="TO_ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"><field name="ANGLE_UNIT">DEGREES</field></shadow></value></block></category><category name="AngularVelocity"><block type="angularVelocity_getProperty_AngleUnit"><field name="PROP">AngleUnit</field><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_getProperty_Number"><field name="PROP">XRotationRate</field><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_getProperty_Number"><field name="PROP">YRotationRate</field><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_getProperty_Number"><field name="PROP">ZRotationRate</field><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_getRotationRate"><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value><value name="AXIS"><shadow type="navigation_typedEnum_axis"></shadow></value></block><block type="angularVelocity_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_toAngleUnit"><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="angularVelocity_toText"><value name="ANGULAR_VELOCITY"><block type="variables_get"><field name="VAR">myAngularVelocity</field></block></value></block><block type="angularVelocity_create"></block><block type="angularVelocity_create_withArgs"><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="X_ROTATION_RATE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y_ROTATION_RATE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z_ROTATION_RATE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="Axis"><block type="navigation_typedEnum_axis"><field name="AXIS">X</field></block><block type="navigation_typedEnum_axis"><field name="AXIS">Y</field></block><block type="navigation_typedEnum_axis"><field name="AXIS">Z</field></block></category><category name="Blackboard"><block type="blackboard_clear"></block><block type="blackboard_containsKey"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value></block><block type="blackboard_get"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value></block><block type="blackboard_getOrDefault"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value></block><block type="blackboard_isEmpty"></block><block type="blackboard_put"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value></block><block type="blackboard_remove"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value></block><block type="blackboard_size"></block></category><category name="Color"><block type="color_rgbToHue"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="color_rgbToSaturation"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="color_rgbToValue"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="color_toText"><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_showColor"><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Red</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Green</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Blue</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Alpha</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Hue</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Saturation</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_getProperty_Number"><field name="PROP">Value</field><value name="COLOR"><block type="variables_get"><field name="VAR">myColor</field></block></value></block><block type="color_rgbToColor_Number"><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="color_argbToColor_Number"><value name="ALPHA"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="RED"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="GREEN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="BLUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="color_hsvToColor_Number"><value name="HUE"><shadow type="math_number"><field name="NUM">60</field></shadow></value><value name="SATURATION"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value></block><block type="color_ahsvToColor_Number"><value name="ALPHA"><shadow type="math_number"><field name="NUM">255</field></shadow></value><value name="HUE"><shadow type="math_number"><field name="NUM">60</field></shadow></value><value name="SATURATION"><shadow type="math_number"><field name="NUM">1.0</field></shadow></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0.5</field></shadow></value></block><block type="color_textToColor_Number"><value name="TEXT"><shadow type="text"><field name="TEXT">#FFFFFF</field></shadow></value></block><block type="color_textToColor_Number"><value name="TEXT"><shadow type="text"><field name="TEXT">#FFFFFFFF</field></shadow></value></block><block type="color_textToColor_Number"><value name="TEXT"><shadow type="text"><field name="TEXT">red</field></shadow></value></block><block type="normalizedColors_getProperty_Number"><field name="PROP">Red</field><value name="NORMALIZED_COLORS"><block type="variables_get"><field name="VAR">myNormalizedColors</field></block></value></block><block type="normalizedColors_getProperty_Number"><field name="PROP">Green</field><value name="NORMALIZED_COLORS"><block type="variables_get"><field name="VAR">myNormalizedColors</field></block></value></block><block type="normalizedColors_getProperty_Number"><field name="PROP">Blue</field><value name="NORMALIZED_COLORS"><block type="variables_get"><field name="VAR">myNormalizedColors</field></block></value></block><block type="normalizedColors_getProperty_Number"><field name="PROP">Alpha</field><value name="NORMALIZED_COLORS"><block type="variables_get"><field name="VAR">myNormalizedColors</field></block></value></block><block type="normalizedColors_getProperty_Number"><field name="PROP">Color</field><value name="NORMALIZED_COLORS"><block type="variables_get"><field name="VAR">myNormalizedColors</field></block></value></block><block type="color_constant_Number"><field name="CONSTANT">BLACK</field></block><block type="color_constant_Number"><field name="CONSTANT">BLUE</field></block><block type="color_constant_Number"><field name="CONSTANT">CYAN</field></block><block type="color_constant_Number"><field name="CONSTANT">DKGRAY</field></block><block type="color_constant_Number"><field name="CONSTANT">GRAY</field></block><block type="color_constant_Number"><field name="CONSTANT">GREEN</field></block><block type="color_constant_Number"><field name="CONSTANT">LTGRAY</field></block><block type="color_constant_Number"><field name="CONSTANT">MAGENTA</field></block><block type="color_constant_Number"><field name="CONSTANT">RED</field></block><block type="color_constant_Number"><field name="CONSTANT">WHITE</field></block><block type="color_constant_Number"><field name="CONSTANT">YELLOW</field></block></category><category name="DbgLog"><block type="dbgLog_msg"><value name="MESSAGE"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block><block type="dbgLog_error"><value name="MESSAGE"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block></category><category name="ElapsedTime"><block type="elapsedTime2_create"></block><block type="elapsedTime2_getProperty_Number"><field name="PROP">StartTime</field><value name="ELAPSED_TIME"><block type="variables_get"><field name="VAR">myElapsedTime</field></block></value></block><block type="elapsedTime2_getProperty_Number"><field name="PROP">Seconds</field><value name="ELAPSED_TIME"><block type="variables_get"><field name="VAR">myElapsedTime</field></block></value></block><block type="elapsedTime2_getProperty_Number"><field name="PROP">Milliseconds</field><value name="ELAPSED_TIME"><block type="variables_get"><field name="VAR">myElapsedTime</field></block></value></block><block type="elapsedTime2_reset"><value name="ELAPSED_TIME"><block type="variables_get"><field name="VAR">myElapsedTime</field></block></value></block><block type="elapsedTime2_toText"><value name="ELAPSED_TIME"><block type="variables_get"><field name="VAR">myElapsedTime</field></block></value></block></category><category name="MagneticFlux"><block type="magneticFlux_getProperty_Number"><field name="PROP">X</field><value name="MAGNETIC_FLUX"><block type="variables_get"><field name="VAR">myMagneticFlux</field></block></value></block><block type="magneticFlux_getProperty_Number"><field name="PROP">Y</field><value name="MAGNETIC_FLUX"><block type="variables_get"><field name="VAR">myMagneticFlux</field></block></value></block><block type="magneticFlux_getProperty_Number"><field name="PROP">Z</field><value name="MAGNETIC_FLUX"><block type="variables_get"><field name="VAR">myMagneticFlux</field></block></value></block><block type="magneticFlux_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="MAGNETIC_FLUX"><block type="variables_get"><field name="VAR">myMagneticFlux</field></block></value></block><block type="magneticFlux_toText"><value name="MAGNETIC_FLUX"><block type="variables_get"><field name="VAR">myMagneticFlux</field></block></value></block><block type="magneticFlux_create"></block><block type="magneticFlux_create_withArgs"><value name="X"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="Matrix"><block type="openGLMatrix_identityMatrix"></block><block type="openGLMatrix_multiplied"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="openGLMatrix_multiply"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="openGLMatrix_rotation"><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_rotation_withAxesArgs"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block><block type="openGLMatrix_rotate"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_rotate_withAxesArgs"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block><block type="openGLMatrix_rotated"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_rotated_withAxesArgs"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block><block type="openGLMatrix_scale_with3"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE_X"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="SCALE_Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="SCALE_Z"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_scale_with1"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="openGLMatrix_scaled_with3"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE_X"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="SCALE_Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="SCALE_Z"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_scaled_with1"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="openGLMatrix_translation"><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_translate"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_translated"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="DX"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="DY"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="DZ"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block><block type="openGLMatrix_create"></block><block type="openGLMatrix_create_withMatrixF"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_getProperty_Number"><field name="PROP">NumCols</field><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_getProperty_Number"><field name="PROP">NumRows</field><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_diagonalMatrix"><value name="DIM"><shadow type="math_number"><field name="NUM">4</field></shadow></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="matrixF_diagonalMatrix_withVector"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_identityMatrix"><value name="DIM"><shadow type="math_number"><field name="NUM">4</field></shadow></value></block><block type="matrixF_get"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ROW"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="COL"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="matrixF_put"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ROW"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="COL"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="VALUE"><shadow type="math_number"><field name="NUM">123</field></shadow></value></block><block type="matrixF_getRow"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ROW"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="matrixF_getColumn"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="COL"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="matrixF_added_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_added_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_add_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_add_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_multiplied_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_multiplied_withScale"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="matrixF_multiplied_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_multiply_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_multiply_withScale"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="matrixF_multiply_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_slice"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="ROW"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="COL"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="NUM_ROWS"><shadow type="math_number"><field name="NUM">2</field></shadow></value><value name="NUM_COLS"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block><block type="matrixF_subtracted_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_subtracted_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_subtract_withMatrix"><value name="MATRIX1"><block type="variables_get"><field name="VAR">myMatrix1</field></block></value><value name="MATRIX2"><block type="variables_get"><field name="VAR">myMatrix2</field></block></value></block><block type="matrixF_subtract_withVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_inverted"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_transform"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="matrixF_transposed"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_toText"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_formatAsTransform"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_formatAsTransform_withArgs"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="matrixF_toVector"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="matrixF_getTranslation"><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block></category><category name="Orientation"><block type="orientation_getProperty_AxesReference"><field name="PROP">AxesReference</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_AxesOrder"><field name="PROP">AxesOrder</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_AngleUnit"><field name="PROP">AngleUnit</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_Number"><field name="PROP">FirstAngle</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_Number"><field name="PROP">SecondAngle</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_Number"><field name="PROP">ThirdAngle</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_toAngleUnit"><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="orientation_toAxesReference"><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value></block><block type="orientation_toAxesOrder"><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value></block><block type="orientation_toText"><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getRotationMatrix"><value name="ORIENTATION"><block type="variables_get"><field name="VAR">myOrientation</field></block></value></block><block type="orientation_getRotationMatrix_withArgs"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value></block><block type="orientation_create"></block><block type="orientation_create_withArgs"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"><field name="AXES_REFERENCE">INTRINSIC</field></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"><field name="AXES_ORDER">ZYX</field></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="FIRST_ANGLE"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="SECOND_ANGLE"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="THIRD_ANGLE"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block><block type="orientation_getOrientation"><value name="AXES_REFERENCE"><shadow type="navigation_typedEnum_axesReference"></shadow></value><value name="AXES_ORDER"><shadow type="navigation_typedEnum_axesOrder"></shadow></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block></category><category name="PIDFCoefficients"><block type="pidfCoefficients_create"></block><block type="pidfCoefficients_create_withPIDFAlgorithm"><value name="P"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="I"><shadow type="math_number"><field name="NUM">3</field></shadow></value><value name="D"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="F"><shadow type="math_number"><field name="NUM">7</field></shadow></value><value name="ALGORITHM"><shadow type="pidfCoefficients_typedEnum_motorControlAlgorithm"><field name="MOTOR_CONTROL_ALGORITHM">PIDF</field></shadow></value></block><block type="pidfCoefficients_create_withPIDF"><value name="P"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="I"><shadow type="math_number"><field name="NUM">3</field></shadow></value><value name="D"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="F"><shadow type="math_number"><field name="NUM">7</field></shadow></value></block><block type="pidfCoefficients_create_withPIDFCoefficients"><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_setProperty_Number"><field name="PROP">P</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="pidfCoefficients_getProperty_Number"><field name="PROP">P</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_setProperty_Number"><field name="PROP">I</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="pidfCoefficients_getProperty_Number"><field name="PROP">I</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_setProperty_Number"><field name="PROP">D</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="pidfCoefficients_getProperty_Number"><field name="PROP">D</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_setProperty_Number"><field name="PROP">F</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value><value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="pidfCoefficients_getProperty_Number"><field name="PROP">F</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_setProperty_MotorControlAlgorithm"><field name="PROP">Algorithm</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value><value name="VALUE"><shadow type="pidfCoefficients_typedEnum_motorControlAlgorithm"><field name="MOTOR_CONTROL_ALGORITHM">PIDF</field></shadow></value></block><block type="pidfCoefficients_getProperty_MotorControlAlgorithm"><field name="PROP">Algorithm</field><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block><block type="pidfCoefficients_toText"><value name="PIDF_COEFFICIENTS"><block type="variables_get"><field name="VAR">myPidfCoefficients</field></block></value></block></category><category name="Pose2D"><block type="pose2D_getPropertyWithDistanceUnit_Number"><field name="PROP">X</field><value name="POSE2D"><block type="variables_get"><field name="VAR">myPose2D</field></block></value><value name="UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value></block><block type="pose2D_getPropertyWithDistanceUnit_Number"><field name="PROP">Y</field><value name="POSE2D"><block type="variables_get"><field name="VAR">myPose2D</field></block></value><value name="UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value></block><block type="pose2D_getPropertyWithAngleUnit_Number"><field name="PROP">Heading</field><value name="POSE2D"><block type="variables_get"><field name="VAR">myPose2D</field></block></value><value name="UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="pose2D_toText"><value name="POSE2D"><block type="variables_get"><field name="VAR">myPose2D</field></block></value></block><block type="pose2D_create"><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="HEADING_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="HEADING"><shadow type="math_number"><field name="NUM">30</field></shadow></value></block></category><category name="Position"><block type="position_getProperty_DistanceUnit"><field name="PROP">DistanceUnit</field><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_getProperty_Number"><field name="PROP">X</field><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_getProperty_Number"><field name="PROP">Y</field><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_getProperty_Number"><field name="PROP">Z</field><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_toDistanceUnit"><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value></block><block type="position_toText"><value name="POSITION"><block type="variables_get"><field name="VAR">myPosition</field></block></value></block><block type="position_create"></block><block type="position_create_withArgs"><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="Quaternion"><block type="quaternion_getProperty_Number"><field name="PROP">W</field><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_getProperty_Number"><field name="PROP">X</field><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_getProperty_Number"><field name="PROP">Y</field><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_getProperty_Number"><field name="PROP">Z</field><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_normalized"><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_conjugate"><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_toText"><value name="QUATERNION"><block type="variables_get"><field name="VAR">myQuaternion</field></block></value></block><block type="quaternion_create"></block><block type="quaternion_create_withArgs"><value name="W"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Y"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="Z"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="Range"><block type="range_clip"><value name="MIN"><shadow type="math_number"><field name="NUM">-1</field></shadow></value><value name="MAX"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="range_scale"><value name="X1"><shadow type="math_number"><field name="NUM">-100</field></shadow></value><value name="X2"><shadow type="math_number"><field name="NUM">100</field></shadow></value><value name="Y1"><shadow type="math_number"><field name="NUM">-1</field></shadow></value><value name="Y2"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block></category><category name="Telemetry"><block type="telemetry_addNumericData_Number"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value><value name="NUMBER"><shadow type="math_number"><field name="NUM">123</field></shadow></value></block><block type="telemetry_addNumericData_Number"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value><value name="NUMBER"><block type="misc_roundDecimal"><value name="NUMBER"><shadow type="math_number"><field name="NUM">3.14159265</field></shadow></value><value name="PRECISION"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block></value></block><block type="telemetry_addTextData_All"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value><value name="TEXT"><shadow type="text"><field name="TEXT">text</field></shadow></value></block><block type="telemetry_addTextData_All"><value name="KEY"><shadow type="text"><field name="TEXT">key</field></shadow></value><value name="TEXT"><block type="misc_formatNumber"><value name="NUMBER"><shadow type="math_number"><field name="NUM">3.14159265</field></shadow></value><value name="PRECISION"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block></value></block><block type="telemetry_addLine"><value name="TEXT"><shadow type="text"><field name="TEXT">text</field></shadow></value></block><block type="telemetry_update"></block><block type="telemetry_speak"><value name="TEXT"><shadow type="text"><field name="TEXT">text</field></shadow></value></block><block type="telemetry_speak_withLanguage"><value name="TEXT"><shadow type="text"><field name="TEXT">text</field></shadow></value><value name="LANGUAGE_CODE"><shadow type="text"><field name="TEXT">en</field></shadow><block type="locale_languageCode"></block></value><value name="COUNTRY_CODE"><shadow type="text"><field name="TEXT">US</field></shadow><block type="locale_countryCode"></block></value></block><block type="telemetry_setDisplayFormat"><value name="DISPLAY_FORMAT"><shadow type="telemetry_typedEnum_displayFormat"></shadow></value></block><block type="telemetry_setNumDecimalPlaces"><value name="MIN"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="MAX"><shadow type="math_number"><field name="NUM">4</field></shadow></value></block><block type="telemetry_setProperty_Number"><field name="PROP">MsTransmissionInterval</field><value name="VALUE"><shadow type="math_number"><field name="NUM">11</field></shadow></value></block><block type="telemetry_getProperty_Number"><field name="PROP">MsTransmissionInterval</field></block></category><category name="Temperature"><block type="temperature_getProperty_TempUnit"><field name="PROP">TempUnit</field><value name="TEMPERATURE"><block type="variables_get"><field name="VAR">myTemperature</field></block></value></block><block type="temperature_getProperty_Number"><field name="PROP">Temperature</field><value name="TEMPERATURE"><block type="variables_get"><field name="VAR">myTemperature</field></block></value></block><block type="temperature_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="TEMPERATURE"><block type="variables_get"><field name="VAR">myTemperature</field></block></value></block><block type="temperature_create"></block><block type="temperature_create_withArgs"><value name="TEMP_UNIT"><shadow type="navigation_typedEnum_tempUnit"></shadow></value><value name="TEMPERATURE"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block><block type="temperature_toTempUnit"><value name="TEMPERATURE"><block type="variables_get"><field name="VAR">myTemperature</field></block></value><value name="TEMP_UNIT"><shadow type="navigation_typedEnum_tempUnit"></shadow></value></block></category><category name="Time"><block type="system_currentTimeMillis"><comment pinned="false" h="150" w="325">Get the current time in milliseconds. The value returned represents the number of milliseconds since midnight, January 1, 1970 UTC. </comment></block><block type="system_nanoTime"><comment pinned="false" h="150" w="325">Get the current value of a high-resolution time source, in nanoseconds. This value can only be used to measure elapsed time and is not related to any other notion of system or wall-clock time. The value returned represents the number of nanoseconds since some fixed but arbitrary origin time (perhaps in the future, so values may be negative). </comment></block></category><category name="Vector"><block type="vectorF_getProperty_Number"><field name="PROP">Length</field><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_getProperty_Number"><field name="PROP">Magnitude</field><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_get"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="INDEX"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="vectorF_put"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="INDEX"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="VALUE"><shadow type="math_number"><field name="NUM">123</field></shadow></value></block><block type="vectorF_toText"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_normalized3D"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_dotProduct"><value name="VECTOR1"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="VECTOR2"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_multiplied"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="vectorF_added_withMatrix"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="vectorF_added_withVector"><value name="VECTOR1"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="VECTOR2"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_add_withVector"><value name="VECTOR1"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="VECTOR2"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_subtracted_withMatrix"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="MATRIX"><block type="variables_get"><field name="VAR">myMatrix</field></block></value></block><block type="vectorF_subtracted_withVector"><value name="VECTOR1"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="VECTOR2"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_subtract_withVector"><value name="VECTOR1"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="VECTOR2"><block type="variables_get"><field name="VAR">myVector</field></block></value></block><block type="vectorF_multiplied_withScale"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="vectorF_multiply_withScale"><value name="VECTOR"><block type="variables_get"><field name="VAR">myVector</field></block></value><value name="SCALE"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="vectorF_create"><value name="LENGTH"><shadow type="math_number"><field name="NUM">4</field></shadow></value></block></category><category name="Velocity"><block type="velocity_getProperty_DistanceUnit"><field name="PROP">DistanceUnit</field><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_getProperty_Number"><field name="PROP">XVeloc</field><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_getProperty_Number"><field name="PROP">YVeloc</field><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_getProperty_Number"><field name="PROP">ZVeloc</field><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_toDistanceUnit"><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value></block><block type="velocity_toText"><value name="VELOCITY"><block type="variables_get"><field name="VAR">myVelocity</field></block></value></block><block type="velocity_create"></block><block type="velocity_create_withArgs"><value name="DISTANCE_UNIT"><shadow type="navigation_typedEnum_distanceUnit"></shadow></value><value name="X_VELOC"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="Y_VELOC"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="Z_VELOC"><shadow type="math_number"><field name="NUM">30</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block></category><category name="YawPitchRollAngles"><block type="yawPitchRollAngles_getPropertyWithAngleUnit_Number"><field name="PROP">Yaw</field><value name="YAW_PITCH_ROLL_ANGLES"><block type="variables_get"><field name="VAR">myYawPitchRollAngles</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="yawPitchRollAngles_getPropertyWithAngleUnit_Number"><field name="PROP">Pitch</field><value name="YAW_PITCH_ROLL_ANGLES"><block type="variables_get"><field name="VAR">myYawPitchRollAngles</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="yawPitchRollAngles_getPropertyWithAngleUnit_Number"><field name="PROP">Roll</field><value name="YAW_PITCH_ROLL_ANGLES"><block type="variables_get"><field name="VAR">myYawPitchRollAngles</field></block></value><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value></block><block type="yawPitchRollAngles_getProperty_Number"><field name="PROP">AcquisitionTime</field><value name="YAW_PITCH_ROLL_ANGLES"><block type="variables_get"><field name="VAR">myYawPitchRollAngles</field></block></value></block><block type="yawPitchRollAngles_toText"><value name="YAW_PITCH_ROLL_ANGLES"><block type="variables_get"><field name="VAR">myYawPitchRollAngles</field></block></value></block><block type="yawPitchRollAngles_create_withArgs"><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="YAW"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="PITCH"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="ROLL"><shadow type="math_number"><field name="NUM">0</field></shadow></value><value name="ACQUISITION_TIME"><shadow type="math_number"><field name="NUM">0</field></shadow><block type="system_nanoTime"></block></value></block><block type="yawPitchRollAngles_create_withArgs2"><value name="ANGLE_UNIT"><shadow type="navigation_typedEnum_angleUnit"></shadow></value><value name="YAW"><shadow type="math_number"><field name="NUM">90</field></shadow></value><value name="PITCH"><shadow type="math_number"><field name="NUM">-45</field></shadow></value><value name="ROLL"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block></category></category><sep></sep><!-- Logic is from blockly/demos/code/index.html, with some modification. --><category name="Logic" colour="210"><block type="controls_if"></block><block type="controls_if"><mutation else="1"></mutation></block><block type="controls_if"><mutation elseif="1" else="1"></mutation></block><block type="logic_compare"></block><block type="logic_operation"></block><block type="logic_negate"></block><block type="logic_boolean"></block><block type="logic_null"></block><block type="logic_ternary"></block></category><!-- Loops is from blockly/demos/code/index.html --><category name="Loops" colour="120"><block type="controls_repeat_ext"><value name="TIMES"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="controls_whileUntil"></block><block type="controls_for"><value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="TO"><shadow type="math_number"><field name="NUM">10</field></shadow></value><value name="BY"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="controls_forEach"></block><block type="controls_flow_statements"></block></category><!-- Math is from blockly/demos/code/index.html, with some modifications --><category name="Math" colour="230"><block type="math_number"></block><block type="math_arithmetic"><field name="OP">ADD</field><value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="math_arithmetic"><field name="OP">MINUS</field><value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="math_arithmetic"><field name="OP">MULTIPLY</field><value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="math_arithmetic"><field name="OP">DIVIDE</field><value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="math_arithmetic"><field name="OP">POWER</field><value name="A"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="B"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="math_single"><field name="OP">NEG</field><value name="NUM"><shadow type="math_number"><field name="NUM">9</field></shadow></value></block><block type="math_single"><field name="OP">ABS</field><value name="NUM"><shadow type="math_number"><field name="NUM">9</field></shadow></value></block><block type="math_single"><field name="OP">ROOT</field><value name="NUM"><shadow type="math_number"><field name="NUM">9</field></shadow></value></block><block type="math_trig"><value name="NUM"><shadow type="math_number"><field name="NUM">45</field></shadow></value></block><block type="misc_atan2"><value name="Y"><shadow type="math_number"><field name="NUM">20</field></shadow></value><value name="X"><shadow type="math_number"><field name="NUM">20</field></shadow></value></block><block type="math_constant"></block><block type="math_number_property"><value name="NUMBER_TO_CHECK"><shadow type="math_number"><field name="NUM">0</field></shadow></value></block><block type="math_round"><value name="NUM"><shadow type="math_number"><field name="NUM">3.1</field></shadow></value></block><block type="misc_minmax"></block><block type="math_on_list"></block><block type="math_modulo"><value name="DIVIDEND"><shadow type="math_number"><field name="NUM">64</field></shadow></value><value name="DIVISOR"><shadow type="math_number"><field name="NUM">10</field></shadow></value></block><block type="math_constrain"><value name="VALUE"><shadow type="math_number"><field name="NUM">50</field></shadow></value><value name="LOW"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="HIGH"><shadow type="math_number"><field name="NUM">100</field></shadow></value></block><block type="math_random_int"><value name="FROM"><shadow type="math_number"><field name="NUM">1</field></shadow></value><value name="TO"><shadow type="math_number"><field name="NUM">100</field></shadow></value></block><block type="math_random_float"></block></category><!-- Text is from blockly/demos/code/index.html, with some modifications --><category name="Text" colour="160"><block type="text"></block><block type="text_join"></block><block type="text_append"><value name="TEXT"><shadow type="text"></shadow></value></block><block type="text_length"><value name="VALUE"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block><block type="text_isEmpty"><value name="VALUE"><shadow type="text"><field name="TEXT"></field></shadow></value></block><block type="text_indexOf"><value name="VALUE"><block type="variables_get"><field name="VAR">myText</field></block></value><value name="FIND"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block><block type="text_charAt"><value name="VALUE"><block type="variables_get"><field name="VAR">myText</field></block></value></block><block type="text_getSubstring"><value name="STRING"><block type="variables_get"><field name="VAR">myText</field></block></value></block><block type="text_changeCase"><value name="TEXT"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block><block type="text_trim"><value name="TEXT"><shadow type="text"><field name="TEXT">abc</field></shadow></value></block></category><!-- Lists is from blockly/demos/code/index.html --><category name="Lists" colour="260"><block type="lists_create_with"><mutation items="0"></mutation></block><block type="lists_create_with"></block><block type="lists_repeat"><value name="NUM"><shadow type="math_number"><field name="NUM">5</field></shadow></value></block><block type="lists_length"></block><block type="lists_isEmpty"></block><block type="misc_addItemToList"><value name="LIST"><block type="variables_get"><field name="VAR">myList</field></block></value></block><block type="lists_indexOf"><value name="VALUE"><block type="variables_get"><field name="VAR">myList</field></block></value></block><block type="lists_getIndex"><value name="VALUE"><block type="variables_get"><field name="VAR">myList</field></block></value></block><block type="lists_setIndex"><value name="LIST"><block type="variables_get"><field name="VAR">myList</field></block></value></block><block type="lists_getSublist"><value name="LIST"><block type="variables_get"><field name="VAR">myList</field></block></value></block><block type="lists_split"><value name="DELIM"><shadow type="text"><field name="TEXT">,</field></shadow></value></block><block type="lists_sort"></block></category><!-- Variables is from blockly/demos/code/index.html --><category name="Variables" colour="330" custom="VARIABLE"></category><!-- Functions is from blockly/demos/code/index.html --><category name="Functions" colour="290" custom="PROCEDURE"></category><category name="Miscellaneous" colour="200"><block type="comment"><field name="COMMENT">Enter your comment here!</field></block><block type="misc_roundDecimal"><value name="NUMBER"><shadow type="math_number"><field name="NUM">3.14159265</field></shadow></value><value name="PRECISION"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block><block type="misc_formatNumber"><value name="NUMBER"><shadow type="math_number"><field name="NUM">3.14159265</field></shadow></value><value name="PRECISION"><shadow type="math_number"><field name="NUM">2</field></shadow></value></block><block type="misc_formatNumber_withWidth"><value name="NUMBER"><shadow type="math_number"><field name="NUM">3.14159265</field></shadow></value><value name="WIDTH"><shadow type="math_number"><field name="NUM">6</field></shadow></value><value name="PRECISION"><shadow type="math_number"><field name="NUM">1</field></shadow></value></block><block type="misc_null"></block><block type="misc_isNull"></block><block type="misc_isNotNull"></block><block type="misc_evaluateButIgnoreResult"></block></category></xml>';
}

