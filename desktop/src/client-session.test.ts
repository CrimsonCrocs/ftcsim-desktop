import { test, expect } from "bun:test";
import { WebSocketOpModeSession } from "./client-session";
import { validateSessionMessage } from "../../services/java-runner/src/session-validation";

test("native editor tick carries the same fixed control interval as the web transport", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const messages: unknown[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { ftcDesktop: { request: async (path: string, body: { message?: unknown }) => {
    if (path === "/sessions/open") return { sessionId: "test-session" };
    messages.push(body.message);
    return { protocolVersion: 3, type: "response", status: "ok", command: "tick", requestId: "desktop-1", frame: { phase: "running", motors: {}, telemetry: {} } };
  } } } });
  try {
    const session = await WebSocketOpModeSession.connect();
    await session.tick({ sequence: 1, gamepad1: {}, gamepad2: {}, motors: {} });
    expect(validateSessionMessage(messages[0])).toMatchObject({ command: "tick", sequence: 1, deltaMillis: 20 });
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
