import type { AnalysisStore } from "./store";

export class AdvantageScopePublisher {
  private socket?: WebSocket;
  private unsubscribe?: () => void;
  private heartbeat?: ReturnType<typeof setInterval>;
  private timeout?: ReturnType<typeof setTimeout>;
  private listeners = new Set<() => void>();
  private snapshot = { status: "disconnected" as "disconnected" | "connecting" | "connected" | "error", message: "" };
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  connect(input: string, store: AnalysisStore) {
    this.disconnect();
    try {
      const url = new URL(input);
      if (url.protocol !== "ws:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.port !== "8000"
          || !/^\/publish\/[A-Za-z0-9_-]{43}$/u.test(url.pathname) || url.search || url.hash || url.username || url.password) {
        throw new Error("Paste the loopback bridge URL printed by bun run advantagescope:bridge.");
      }
      this.set("connecting", "Connecting to the local bridge… Allow access to apps on this device if your browser asks.");
      const socket = new WebSocket(url); this.socket = socket;
      this.timeout = setTimeout(() => { if (this.socket === socket) { this.disconnect(); this.set("error", "Connection timed out. Check the bridge and your browser’s local network permission, then reconnect."); } }, 30_000);
      socket.onmessage = (event) => {
        if (this.socket !== socket) return;
        try {
          if (JSON.parse(String(event.data)).type !== "ready") return;
          clearTimeout(this.timeout); this.set("connected", "Connected to the local bridge. Open AdvantageScope to view live data.");
          this.unsubscribe?.();
          this.unsubscribe = store.subscribeLive((sample) => {
            if (socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 256 * 1024) socket.send(JSON.stringify(sample));
          });
          this.heartbeat = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}'); }, 2_000);
        } catch { this.disconnect(); this.set("error", "The local service is not an FTC Simulator bridge."); }
      };
      socket.onerror = () => { if (this.socket === socket) { this.disconnect(); this.set("error", "Could not reach the bridge. Start it, allow local network access if prompted, then reconnect."); } };
      socket.onclose = () => { if (this.socket === socket) { this.disconnect(); this.set("error", "The local bridge disconnected. Reconnect to resume streaming."); } };
    } catch (error) { this.set("error", error instanceof Error ? error.message : "Could not connect to the bridge."); }
  }
  disconnect() {
    const socket = this.socket; this.socket = undefined; socket?.close();
    this.unsubscribe?.(); this.unsubscribe = undefined; clearInterval(this.heartbeat); clearTimeout(this.timeout);
    this.set("disconnected", "");
  }
  private set(status: typeof this.snapshot.status, message: string) { this.snapshot = { status, message }; for (const listener of this.listeners) listener(); }
}
