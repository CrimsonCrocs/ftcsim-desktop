// @bun
// tools/advantagescope/bridge.ts
import { randomBytes, timingSafeEqual } from "crypto";

// src/lib/analysis/channel-types.ts
class AnalysisChannelNames {
  names = new Map;
  used = new Set;
  resolve(name, type) {
    const key = `${name}\x00${type}`, existing = this.names.get(key);
    if (existing)
      return existing;
    if (this.names.size >= 2048)
      return null;
    let candidate = name, suffix = 1;
    while (this.used.has(candidate))
      candidate = `${name} [${type}${suffix++ > 1 ? ` ${suffix - 1}` : ""}]`;
    this.used.add(candidate);
    this.names.set(key, candidate);
    return candidate;
  }
}

// tools/advantagescope/bridge.ts
function createAdvantageScopeBridge(options = {}) {
  const token = options.token ?? randomBytes(32).toString("base64url");
  const subscribers = new Set;
  const names = new AnalysisChannelNames;
  let publisher = null;
  let phase = "stopped", latest = null, lastTime = -1, lastTimestamp = 0, lastReceived = 0, run = 1;
  let voltage;
  const status = () => JSON.stringify({ type: "RECEIVE_ROBOT_STATUS", status: {
    activeOpMode: publisher ? "FTC Simulator" : "$Stop$Robot$",
    activeOpModeStatus: phase === "running" ? "RUNNING" : "STOPPED",
    batteryVoltage: voltage,
    warningMessage: "",
    errorMessage: ""
  } });
  const send = (socket, value) => {
    if (socket.getBufferedAmount() > 256 * 1024) {
      socket.close(1013, "Live reader is too slow");
      return;
    }
    socket.send(value);
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: options.port ?? 8000,
    fetch(request, server2) {
      const url = new URL(request.url);
      if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
        return new Response("Loopback only", { status: 403 });
      const supplied = url.pathname.startsWith("/publish/") ? url.pathname.slice(9) : "";
      const isPublisher = supplied.length === token.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
      if (url.pathname !== "/" && !isPublisher)
        return new Response("Invalid bridge URL", { status: 403 });
      const origin = request.headers.get("origin");
      if (!isPublisher && origin && origin !== "null" && origin !== "file://")
        return new Response("Desktop readers only", { status: 403 });
      if (isPublisher && publisher)
        return new Response("A simulator is already connected", { status: 409 });
      if (!isPublisher && subscribers.size >= 8)
        return new Response("Too many readers", { status: 429 });
      if (server2.upgrade(request, { data: { publisher: isPublisher } }))
        return;
      return new Response("FTC Simulator AdvantageScope bridge", { status: 426 });
    },
    websocket: {
      maxPayloadLength: 256 * 1024,
      backpressureLimit: 256 * 1024,
      open(raw) {
        const socket = raw;
        if (socket.data.publisher) {
          publisher = socket;
          lastReceived = Date.now();
          socket.send(JSON.stringify({ type: "ready", version: 1 }));
        } else {
          subscribers.add(socket);
          send(socket, status());
          if (latest)
            send(socket, latest);
        }
      },
      message(raw, message) {
        const socket = raw;
        if (!socket.data.publisher) {
          send(socket, status());
          return;
        }
        lastReceived = Date.now();
        try {
          const sample = validateLiveSample(JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message)));
          if (!sample)
            return;
          if (sample.time < lastTime)
            run++;
          lastTime = sample.time;
          lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
          const data = { "/Session/SimulationTimeSeconds": sample.time / 1000, "/Session/Run": run };
          let count = 2;
          for (const [name, value] of Object.entries(sample.values)) {
            if (Array.isArray(value)) {
              value.forEach((item, index) => {
                if (count++ < 512)
                  data[`${name}/${index}`] = item;
              });
            } else if (count++ < 512)
              data[name] = value;
          }
          const pose = sample.values["/Robot/Pose"];
          if (Array.isArray(pose) && pose.length === 3) {
            data["Robot x"] = pose[0] / 0.0254;
            data["Robot y"] = pose[1] / 0.0254;
            data["Robot heading"] = pose[2];
          }
          if (typeof data["/Sensors/Voltage"] === "number")
            voltage = data["/Sensors/Voltage"];
          phase = String(data["/Session/Phase"] ?? phase);
          const typed = {};
          for (const [key, value] of Object.entries(data)) {
            const numericText = typeof value === "string" && !Number.isNaN(Number(value)) && !Number.isNaN(parseFloat(value));
            const name = names.resolve(key, typeof value === "number" || numericText ? "double" : typeof value);
            if (name)
              typed[name] = value;
          }
          latest = JSON.stringify({ type: "RECEIVE_TELEMETRY", telemetry: [{ timestamp: lastTimestamp, data: typed, log: [], fieldOverlay: { ops: [] } }] });
          for (const reader of subscribers)
            send(reader, latest);
        } catch {
          socket.close(1008, "Invalid telemetry sample");
        }
      },
      close(raw) {
        const socket = raw;
        if (socket === publisher) {
          publisher = null;
          phase = "stopped";
          latest = null;
          for (const reader of subscribers)
            send(reader, status());
        }
        subscribers.delete(socket);
      }
    }
  });
  const watchdog = setInterval(() => {
    if (publisher && Date.now() - lastReceived > 1e4)
      publisher.close(1001, "Simulator disconnected");
  }, 2000);
  return { server, publisherUrl: `ws://127.0.0.1:${server.port}/publish/${token}`, close() {
    clearInterval(watchdog);
    server.stop(true);
  } };
}
function validateLiveSample(value) {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid live sample");
  if ("type" in value && value.type === "ping")
    return null;
  if (!("time" in value) || typeof value.time !== "number" || !Number.isFinite(value.time) || value.time < 0 || !("values" in value) || typeof value.values !== "object" || value.values === null || Array.isArray(value.values))
    throw new Error("Invalid live sample");
  const entries = Object.entries(value.values);
  if (entries.length > 512 || entries.some(([name, item]) => name.length > 1024 || name === "__proto__" || !(typeof item === "boolean" || typeof item === "string" && item.length <= 2048 || typeof item === "number" && Number.isFinite(item) || Array.isArray(item) && item.length <= 32 && item.every((number) => typeof number === "number" && Number.isFinite(number)))))
    throw new Error("Invalid live channels");
  return { time: value.time, values: value.values };
}

// tools/advantagescope/start.ts
var bridge = createAdvantageScopeBridge();
console.log(`AdvantageScope bridge listening on 127.0.0.1:8000

Paste this private bridge URL into Telemetry \u2192 Analysis \u2192 AdvantageScope:
${bridge.publisherUrl}

In AdvantageScope: File \u2192 Connect to Simulator \u2192 FTC Dashboard.
Leave this terminal open. Press Ctrl+C to stop.`);
process.on("SIGINT", () => {
  bridge.close();
  process.exit(0);
});
process.on("SIGTERM", () => {
  bridge.close();
  process.exit(0);
});
