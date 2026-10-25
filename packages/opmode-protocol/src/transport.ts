/** Negotiated framing for large builds and artifacts; control frames stay unchanged. */
export const OPMODE_CHUNKED_TRANSPORT = "ftc-json-chunks-v1";
export const OPMODE_TRANSPORT_CHUNK_CHARACTERS = 128 * 1024;
export const OPMODE_TRANSPORT_MAX_BYTES = 96 * 1024 * 1024;

const utf8 = new TextEncoder();
const validId = (value: unknown): value is string => typeof value === "string" && /^[\w-]{1,64}$/u.test(value);

export function* encodeOpModeTransportFrames(json: string, transferId: string): Iterable<string> {
  if (json.length > OPMODE_TRANSPORT_MAX_BYTES || utf8.encode(json).byteLength > OPMODE_TRANSPORT_MAX_BYTES) {
    throw new Error("The runner message exceeds the 96 MiB transport limit");
  }
  if (json.length <= OPMODE_TRANSPORT_CHUNK_CHARACTERS) { yield json; return; }
  if (!validId(transferId)) throw new Error("Invalid runner transfer identity");
  for (let offset = 0, index = 0; offset < json.length; offset += OPMODE_TRANSPORT_CHUNK_CHARACTERS, index++) {
    yield JSON.stringify({ transport: OPMODE_CHUNKED_TRANSPORT, transferId, index,
      totalCharacters: json.length, data: json.slice(offset, offset + OPMODE_TRANSPORT_CHUNK_CHARACTERS) });
  }
}

/** WebSockets preserve order. Reject interleaved, duplicate, missing, or oversized parts. */
export class OpModeTransportDecoder {
  private pending: { transferId: string; total: number; characters: number; bytes: number; chunks: string[] } | null = null;

  reset(): void { this.pending = null; }

  accept(raw: string): string | null {
    if (raw.length > OPMODE_TRANSPORT_MAX_BYTES) throw new Error("Runner message exceeds the transport limit");
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("transport" in value)) {
      if (this.pending) throw new Error("Runner transfer was interrupted by another message");
      return raw;
    }
    const part = value as Record<string, unknown>;
    if (part.transport !== OPMODE_CHUNKED_TRANSPORT || !validId(part.transferId)
        || !Number.isSafeInteger(part.index) || (part.index as number) < 0
        || !Number.isSafeInteger(part.totalCharacters)
        || (part.totalCharacters as number) <= OPMODE_TRANSPORT_CHUNK_CHARACTERS
        || (part.totalCharacters as number) > OPMODE_TRANSPORT_MAX_BYTES
        || typeof part.data !== "string") throw new Error("Invalid runner transfer frame");
    if (!this.pending) {
      if (part.index !== 0) throw new Error("Runner transfer is missing its first frame");
      this.pending = { transferId: part.transferId, total: part.totalCharacters as number, characters: 0, bytes: 0, chunks: [] };
    }
    const pending = this.pending;
    if (part.transferId !== pending.transferId || part.totalCharacters !== pending.total
        || part.index !== pending.chunks.length
        || part.data.length !== Math.min(OPMODE_TRANSPORT_CHUNK_CHARACTERS, pending.total - pending.characters)) {
      throw new Error("Runner transfer frames are missing, out of order, or inconsistent");
    }
    pending.bytes += utf8.encode(part.data).byteLength;
    if (pending.bytes > OPMODE_TRANSPORT_MAX_BYTES) { this.reset(); throw new Error("Runner transfer exceeds the 96 MiB limit"); }
    pending.chunks.push(part.data);
    pending.characters += part.data.length;
    if (pending.characters < pending.total) return null;
    const complete = pending.chunks.join("");
    this.reset();
    return complete;
  }
}
