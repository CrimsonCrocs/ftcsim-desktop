#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$ROOT/.build"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
trap 'rm -rf "$BUILD_DIR"' EXIT

find \
  "$ROOT/src/main/java" \
  "$ROOT/samples/TeamCode/src/main/java" \
  "$ROOT/samples/smoke/java" \
  -name '*.java' -print > "$BUILD_DIR/sources.txt"

javac --release 8 -Xlint:all -d "$BUILD_DIR" @"$BUILD_DIR/sources.txt"

# Compile the same FTC sample against the downloaded official SDK first, then run it with the
# simulator shim ahead of those jars. This catches source-level and JVM descriptor drift.
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
SDK_TOOLCHAIN="$REPO_ROOT/services/java-runner/.runtime/ftc-sdk-11.1.0"
if [[ -d "$SDK_TOOLCHAIN" ]]; then
  SDK_CLASSPATH="$(find "$SDK_TOOLCHAIN" -name '*.jar' -print | paste -sd ':' -)"
  mkdir -p "$BUILD_DIR/official-sdk-classes"
  javac --release 8 -Xlint:all -classpath "$SDK_CLASSPATH:$BUILD_DIR" \
    -d "$BUILD_DIR/official-sdk-classes" \
    "$ROOT/samples/smoke/java/org/firstinspires/ftc/sim/VisionPortalSampleOpMode.java" \
    "$ROOT/samples/smoke/java/org/firstinspires/ftc/teamcode/PinpointPoseOpMode.java" \
    "$ROOT/samples/smoke/java/org/firstinspires/ftc/sim/MotorTypeSdkContractSmokeTest.java" \
    "$ROOT/samples/smoke/java/org/firstinspires/ftc/sim/VisionSdkParitySmokeTest.java" \
    "$ROOT/samples/smoke/java/org/firstinspires/ftc/sim/GeneralSdkParitySmokeTest.java"
  java -cp "$BUILD_DIR/official-sdk-classes:$BUILD_DIR:$SDK_CLASSPATH" \
    org.firstinspires.ftc.sim.MotorTypeSdkContractSmokeTest
  java -cp "$BUILD_DIR/official-sdk-classes:$BUILD_DIR:$SDK_CLASSPATH" \
    org.firstinspires.ftc.sim.VisionSdkParitySmokeTest
  java -cp "$BUILD_DIR/official-sdk-classes:$BUILD_DIR:$SDK_CLASSPATH" \
    org.firstinspires.ftc.sim.GeneralSdkParitySmokeTest
  java -cp "$BUILD_DIR/official-sdk-classes:$BUILD_DIR:$SDK_CLASSPATH" \
    org.firstinspires.ftc.sim.VisionPortalBridgeSmokeTest
  java -cp "$BUILD_DIR/official-sdk-classes:$BUILD_DIR:$SDK_CLASSPATH" \
    org.firstinspires.ftc.sim.PinpointOpModeSmokeTest
fi

java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.PathingHardwareSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.LibraryClockSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.ClockBarrierSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.TelemetryContractSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.HardwareSensorContractSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.YawPitchRollAnglesContractSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.MotorTypeBridgeSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.PersistentRunnerHandoffSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.VisionPortalBridgeSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.CameraPipelineSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.VisionSdkParitySmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.GeneralSdkParitySmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.PinpointOpModeSmokeTest
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.SmokeTest

CLI_OUTPUT="$({
  java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
    --class org.firstinspires.ftc.teamcode.BasicLinearTeleOp \
    --cycles 8 \
    --cycle-ms 10 \
    --motor-profile v1,left_drive,RevRobotics20HDHexMotor,560,300,0.85 \
    --motor-profile v1,right_drive,RevRobotics40HDHexMotor,1120,150,0.85 \
    --servo claw \
    --gamepad1 left_stick_y=-0.75 \
    --gamepad1 right_stick_x=0 \
    --gamepad1 a=true
} 2>"$BUILD_DIR/cli-success.stderr")"

if [[ "$(printf '%s\n' "$CLI_OUTPUT" | wc -l | tr -d ' ')" != "1" ]]; then
  echo "CLI success response was not exactly one line" >&2
  exit 1
fi
case "$CLI_OUTPUT" in
  *'"ok":true'*'"opModeClass":"org.firstinspires.ftc.teamcode.BasicLinearTeleOp"'*'"completedCycles":8'*'"drive":"0.75"'*'"claw":{"position":0.75'*) ;;
  *)
    echo "CLI success response was missing expected simulation data: $CLI_OUTPUT" >&2
    exit 1
    ;;
esac

CLI_CAPTURE_OUTPUT="$({
  java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
    --class org.firstinspires.ftc.sim.StdoutLinearOpMode \
    --cycles 2 \
    --cycle-ms 1
} 2>"$BUILD_DIR/cli-capture.stderr")"
if [[ "$(printf '%s\n' "$CLI_CAPTURE_OUTPUT" | wc -l | tr -d ' ')" != "1" ]]; then
  echo "TeamCode stdout escaped the CLI's single-line JSON envelope" >&2
  exit 1
fi
case "$CLI_CAPTURE_OUTPUT" in
  *'"ok":true'*'"capturedStdout":"team-code output\n"'*'"capturedStdoutTruncated":false'*) ;;
  *)
    echo "CLI did not capture TeamCode stdout: $CLI_CAPTURE_OUTPUT" >&2
    exit 1
    ;;
esac

set +e
CLI_ERROR_OUTPUT="$({
  java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
    --class org.firstinspires.ftc.teamcode.BasicLinearTeleOp \
    --gamepad1 left_stick_x=1.5
} 2>"$BUILD_DIR/cli-error.stderr")"
CLI_ERROR_STATUS=$?
set -e

if [[ "$CLI_ERROR_STATUS" != "2" ]]; then
  echo "CLI invalid-argument response exited with $CLI_ERROR_STATUS instead of 2" >&2
  exit 1
fi
if [[ "$(printf '%s\n' "$CLI_ERROR_OUTPUT" | wc -l | tr -d ' ')" != "1" ]]; then
  echo "CLI invalid-argument response was not exactly one line" >&2
  exit 1
fi
case "$CLI_ERROR_OUTPUT" in
  *'"ok":false'*'"kind":"ARGUMENT_ERROR"'*'left_stick_x must be between -1.0 and 1.0'*) ;;
  *)
    echo "CLI invalid-argument response was not machine-readable: $CLI_ERROR_OUTPUT" >&2
    exit 1
    ;;
esac

set +e
CLI_RUN_ERROR_OUTPUT="$({
  java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
    --class org.firstinspires.ftc.teamcode.BasicLinearTeleOp \
    --cycles 1 \
    --cycle-ms 1
} 2>"$BUILD_DIR/cli-run-error.stderr")"
CLI_RUN_ERROR_STATUS=$?
set -e

if [[ "$CLI_RUN_ERROR_STATUS" != "4" ]]; then
  echo "CLI execution failure exited with $CLI_RUN_ERROR_STATUS instead of 4" >&2
  exit 1
fi
case "$CLI_RUN_ERROR_OUTPUT" in
  *'"ok":false'*'"kind":"RUN_ERROR"'*'Unable to find a hardware device with name \"left_drive\"'*) ;;
  *)
    echo "CLI execution failure hid the TeamCode exception: $CLI_RUN_ERROR_OUTPUT" >&2
    exit 1
    ;;
esac

LOAD_TIMEOUT_OUTPUT_FILE="$BUILD_DIR/cli-load-timeout.stdout"
LOAD_TIMEOUT_WATCHDOG_FILE="$BUILD_DIR/cli-load-timeout.watchdog"
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
  --class org.firstinspires.ftc.sim.HangingInitializerLinearOpMode \
  --cycles 1 \
  --cycle-ms 1 \
  >"$LOAD_TIMEOUT_OUTPUT_FILE" \
  2>"$BUILD_DIR/cli-load-timeout.stderr" &
LOAD_TIMEOUT_PID=$!
(
  sleep 6
  if kill -0 "$LOAD_TIMEOUT_PID" 2>/dev/null; then
    : > "$LOAD_TIMEOUT_WATCHDOG_FILE"
    kill "$LOAD_TIMEOUT_PID" 2>/dev/null || true
  fi
) &
LOAD_TIMEOUT_WATCHDOG_PID=$!
set +e
wait "$LOAD_TIMEOUT_PID"
CLI_LOAD_TIMEOUT_STATUS=$?
set -e
kill "$LOAD_TIMEOUT_WATCHDOG_PID" 2>/dev/null || true
wait "$LOAD_TIMEOUT_WATCHDOG_PID" 2>/dev/null || true
if [[ -e "$LOAD_TIMEOUT_WATCHDOG_FILE" ]]; then
  echo "CLI's class-load deadline failed to terminate a hostile initializer" >&2
  exit 1
fi
CLI_LOAD_TIMEOUT_OUTPUT="$(<"$LOAD_TIMEOUT_OUTPUT_FILE")"
if [[ "$CLI_LOAD_TIMEOUT_STATUS" != "3" ]]; then
  echo "CLI class-load timeout exited with $CLI_LOAD_TIMEOUT_STATUS instead of 3" >&2
  exit 1
fi
case "$CLI_LOAD_TIMEOUT_OUTPUT" in
  *'"ok":false'*'"kind":"LOAD_ERROR"'*'class loading and construction exceeded 2000 milliseconds'*) ;;
  *)
    echo "CLI did not bound class initialization: $CLI_LOAD_TIMEOUT_OUTPUT" >&2
    exit 1
    ;;
esac

LEAK_OUTPUT_FILE="$BUILD_DIR/cli-leaked-thread.stdout"
LEAK_TIMEOUT_FILE="$BUILD_DIR/cli-leaked-thread.timed-out"
java -cp "$BUILD_DIR" org.firstinspires.ftc.sim.OpModeRunnerCli \
  --class org.firstinspires.ftc.sim.LeakyThreadLinearOpMode \
  --cycles 2 \
  --cycle-ms 1 \
  >"$LEAK_OUTPUT_FILE" \
  2>"$BUILD_DIR/cli-leaked-thread.stderr" &
LEAK_PID=$!
(
  sleep 5
  if kill -0 "$LEAK_PID" 2>/dev/null; then
    : > "$LEAK_TIMEOUT_FILE"
    kill "$LEAK_PID" 2>/dev/null || true
  fi
) &
LEAK_WATCHDOG_PID=$!
set +e
wait "$LEAK_PID"
LEAK_STATUS=$?
set -e
kill "$LEAK_WATCHDOG_PID" 2>/dev/null || true
wait "$LEAK_WATCHDOG_PID" 2>/dev/null || true
if [[ -e "$LEAK_TIMEOUT_FILE" ]]; then
  echo "CLI stayed alive after TeamCode leaked a non-daemon thread" >&2
  exit 1
fi
if [[ "$LEAK_STATUS" != "0" ]]; then
  echo "CLI leaked-thread proof exited with $LEAK_STATUS instead of 0" >&2
  exit 1
fi
CLI_LEAK_OUTPUT="$(<"$LEAK_OUTPUT_FILE")"
case "$CLI_LEAK_OUTPUT" in
  *'"ok":true'*'"opModeClass":"org.firstinspires.ftc.sim.LeakyThreadLinearOpMode"'*) ;;
  *)
    echo "CLI leaked-thread proof did not return success JSON: $CLI_LEAK_OUTPUT" >&2
    exit 1
    ;;
esac

printf '%s\n' \
  "$CLI_OUTPUT" \
  "$CLI_CAPTURE_OUTPUT" \
  "$CLI_ERROR_OUTPUT" \
  "$CLI_RUN_ERROR_OUTPUT" \
  "$CLI_LOAD_TIMEOUT_OUTPUT" \
  "$CLI_LEAK_OUTPUT" \
  | bun -e '
      const lines = (await Bun.stdin.text()).trimEnd().split("\n");
      if (lines.length !== 6) throw new Error(`expected 6 CLI JSON results, received ${lines.length}`);
      for (const line of lines) JSON.parse(line);
    '

for STDERR_FILE in \
  "$BUILD_DIR/cli-success.stderr" \
  "$BUILD_DIR/cli-capture.stderr" \
  "$BUILD_DIR/cli-error.stderr" \
  "$BUILD_DIR/cli-run-error.stderr" \
  "$BUILD_DIR/cli-load-timeout.stderr" \
  "$BUILD_DIR/cli-leaked-thread.stderr"; do
  if [[ -s "$STDERR_FILE" ]]; then
    echo "CLI wrote unexpected stderr output: $(<"$STDERR_FILE")" >&2
    exit 1
  fi
done

echo "java-sdk-shim CLI smoke tests passed"
