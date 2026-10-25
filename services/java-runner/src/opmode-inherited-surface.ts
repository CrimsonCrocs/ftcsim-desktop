/** Public members inherited from the SDK's package-private OpModeInternal base.
 * That base is absent from the public inventory; keep this exception descriptor-scoped.
 */
export function isSupportedOpModeInheritedMember(reference: { owner: string; kind: string; name: string; descriptor: string }): boolean {
  if (!["com.qualcomm.robotcore.eventloop.opmode.OpMode", "com.qualcomm.robotcore.eventloop.opmode.LinearOpMode"].includes(reference.owner)) return false;
  if (reference.kind === "method") return reference.name === "requestOpModeStop" && reference.descriptor === "()V";
  if (reference.kind !== "field") return false;
  const fields: Record<string, string> = {
    hardwareMap: "Lcom/qualcomm/robotcore/hardware/HardwareMap;",
    gamepad1: "Lcom/qualcomm/robotcore/hardware/Gamepad;",
    gamepad2: "Lcom/qualcomm/robotcore/hardware/Gamepad;",
    telemetry: "Lorg/firstinspires/ftc/robotcore/external/Telemetry;",
  };
  return fields[reference.name] === reference.descriptor;
}
