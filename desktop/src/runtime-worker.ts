import { delimiter } from "node:path";
import { encodeWorkerCommand, encodeSensorDescriptorArgument, encodeCameraDescriptorArgument, BunJvmWorker, type JvmWorkerFactory, type JvmWorkerFactoryInput, type JvmWorkerRequest, type JvmWorkerReply, type OpModeJvmWorker } from "../../services/java-runner/src/jvm-worker";
import { encodeMotorProfileArgument } from "../../services/java-runner/src/motor-profile";
import { JavaHost } from "./java-host";
import { OPMODE_MAX_TICK_EXECUTION_MILLIS } from "@ftc-studio/opmode-protocol";

/** Per-session host. Each restart isolates all FTC library and program static state. */
export function createDesktopWorkerFactory(): JvmWorkerFactory & {close():void} {
  let host: JavaHost | undefined;
  const factory:JvmWorkerFactory = input => {
    if (input.debug) return new BunJvmWorker(input);
    if (!host || host.closed) host = new JavaHost();
    return new DesktopJvmWorker(input, host);
  };
  return Object.assign(factory,{close:()=>host?.close()});
}
export class DesktopJvmWorker implements OpModeJvmWorker {
  private readonly ready: Promise<unknown>;
  private closed = false;
  constructor(private readonly input: JvmWorkerFactoryInput, private readonly host: JavaHost) {
    const args = ["--class", input.entryClass,
      ...input.motors.flatMap(m => ["--motor-profile", encodeMotorProfileArgument(m)]), ...input.servos.flatMap(s => ["--servo", s]),
      ...(input.robotId ? ["--robot-id", input.robotId] : []), ...(input.sensors ?? []).flatMap(s => ["--sensor", encodeSensorDescriptorArgument(s)]),
      ...(input.cameras ?? []).flatMap(c => ["--camera", encodeCameraDescriptorArgument(c)])];
    this.ready = host.request("OPEN", [(input.runtimeClasspath ?? [input.classesRoot]).join(delimiter), ...args]).then(r => { if (r.exitCode) throw new Error(r.stderr); });
  }
  async request(message: JvmWorkerRequest): Promise<JvmWorkerReply> {
    if (this.closed) throw new Error("Runtime generation is closed");
    await this.ready;
    const encoded = encodeWorkerCommand(message, Boolean(this.input.robotId || this.input.cameras?.length || this.input.sensors?.length), this.input.motors.map(m => m.name), (this.input.cameras ?? []).map(c => c.name));
    const result = await this.host.request("FRAME", [encoded], message.command === "init" || message.command === "handoff" ? 2500 : OPMODE_MAX_TICK_EXECUTION_MILLIS);
    if (result.exitCode) throw new Error(result.stderr);
    const frame = JSON.parse(result.stdout) as JvmWorkerReply & { error?: { message: string } };
    if (!frame.ok || frame.error) throw new Error(frame.error?.message ?? "Invalid runtime reply");
    return frame;
  }
  async terminate(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try { await this.ready; if ((await this.host.request("DISPOSE", [], 1200)).exitCode) this.host.close(); }
    catch { this.host.close(); }
  }
}
