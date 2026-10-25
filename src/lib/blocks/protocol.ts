export const BLOCKS_BRIDGE_VERSION = 2 as const;
export const BLOCKS_MESSAGE_MAX_BYTES = 2_000_000;

export interface BlocksHardwareMotor {
  id: string;
  name: string;
}

export interface BlocksHardwareConfiguration {
  configurationHash: string;
  motors: BlocksHardwareMotor[];
}

export interface BlocksEditorInitMessage {
  type: "ftcsim.blocks.init";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  className: string;
  packageName: string;
  sourcePath: string;
  sourceXml: string;
  readOnly: boolean;
  hardware: BlocksHardwareConfiguration;
}

export interface BlocksEditorFlushMessage {
  type: "ftcsim.blocks.flush";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  requestId: string;
}

export type BlocksHostMessage = BlocksEditorInitMessage | BlocksEditorFlushMessage;

export interface BlocksFrameReadyMessage {
  type: "ftcsim.blocks.ready";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  configurationHash: string;
}

export const BLOCKS_KEYBOARD_CODES = [
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
] as const;

export type BlocksKeyboardCode = typeof BLOCKS_KEYBOARD_CODES[number];

export interface BlocksFrameKeyboardMessage {
  type: "ftcsim.blocks.keyboard";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  configurationHash: string;
  phase: "down" | "up" | "reset";
  code?: BlocksKeyboardCode;
}

export interface BlocksFrameSnapshotMessage {
  type: "ftcsim.blocks.snapshot";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  configurationHash: string;
  revision: number;
  sourceXml: string;
  generatedJava: string;
  sourceHash: string;
  requestId?: string;
}

export interface BlocksFrameErrorMessage {
  type: "ftcsim.blocks.error";
  version: typeof BLOCKS_BRIDGE_VERSION;
  nonce: string;
  documentId: string;
  configurationHash: string;
  code: string;
  message: string;
  requestId?: string;
  revision?: number;
  sourceXml?: string;
  sourceHash?: string;
}

export type BlocksFrameMessage =
  | BlocksFrameReadyMessage
  | BlocksFrameKeyboardMessage
  | BlocksFrameSnapshotMessage
  | BlocksFrameErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBoundedString(value: unknown, maximumBytes: number): value is string {
  return typeof value === "string"
    && new TextEncoder().encode(value).byteLength <= maximumBytes;
}

export function isBlocksFrameMessage(
  value: unknown,
  expected: { nonce: string; documentId: string; configurationHash?: string },
): value is BlocksFrameMessage {
  if (!isRecord(value)
      || value.version !== BLOCKS_BRIDGE_VERSION
      || value.nonce !== expected.nonce
      || value.documentId !== expected.documentId
      || typeof value.configurationHash !== "string"
      || (
        expected.configurationHash !== undefined
        && value.configurationHash !== expected.configurationHash
      )
      || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "ftcsim.blocks.ready") return true;
  if (value.type === "ftcsim.blocks.keyboard") {
    if (value.phase === "reset") return value.code === undefined;
    return (value.phase === "down" || value.phase === "up")
      && BLOCKS_KEYBOARD_CODES.includes(value.code as BlocksKeyboardCode);
  }
  if (value.type === "ftcsim.blocks.error") {
    const hasSource = value.sourceXml !== undefined
      || value.sourceHash !== undefined
      || value.revision !== undefined;
    return typeof value.code === "string"
      && isBoundedString(value.message, 8_192)
      && (value.requestId === undefined || typeof value.requestId === "string")
      && (!hasSource || (
        Number.isSafeInteger(value.revision)
        && (value.revision as number) >= 0
        && isBoundedString(value.sourceXml, BLOCKS_MESSAGE_MAX_BYTES)
        && /^[a-f0-9]{64}$/u.test(String(value.sourceHash))
      ));
  }
  if (value.type === "ftcsim.blocks.snapshot") {
    return Number.isSafeInteger(value.revision)
      && (value.revision as number) >= 0
      && isBoundedString(value.sourceXml, BLOCKS_MESSAGE_MAX_BYTES)
      && isBoundedString(value.generatedJava, BLOCKS_MESSAGE_MAX_BYTES)
      && /^[a-f0-9]{64}$/u.test(String(value.sourceHash))
      && (value.requestId === undefined || typeof value.requestId === "string");
  }
  return false;
}
