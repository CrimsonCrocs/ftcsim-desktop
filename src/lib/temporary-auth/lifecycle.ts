export const TEMPORARY_AUTH_BROADCAST_CHANNEL = "ftc-simulator-temporary-auth-v1";

export interface TemporaryAuthSessionState {
  expectedUserId: string | null;
  sessionUserId: string | null;
  isPending: boolean;
  explicitlyRevoked: boolean;
}

export interface TemporaryAuthSignOutMessage {
  type: "signed-out";
  version: 1;
}

export function temporaryAuthSessionRequiresExit({
  expectedUserId,
  sessionUserId,
  isPending,
  explicitlyRevoked,
}: TemporaryAuthSessionState): boolean {
  if (explicitlyRevoked) return expectedUserId !== null;
  if (sessionUserId !== null) return expectedUserId !== null && sessionUserId !== expectedUserId;
  return expectedUserId !== null && !isPending;
}

export function isTemporaryAuthSignOutMessage(value: unknown): value is TemporaryAuthSignOutMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<TemporaryAuthSignOutMessage>;
  return message.type === "signed-out" && message.version === 1;
}
