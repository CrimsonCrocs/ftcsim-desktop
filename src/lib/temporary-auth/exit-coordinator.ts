export type TemporaryAuthExitDecision = "ready" | "cancelled";
export type TemporaryAuthExitReason = "sign-out" | "revoked";

export type TemporaryAuthExitHandler = (
  (reason: TemporaryAuthExitReason) => TemporaryAuthExitDecision | Promise<TemporaryAuthExitDecision>
);

export class TemporaryAuthExitCoordinator {
  private readonly handlers = new Set<TemporaryAuthExitHandler>();
  private preparation: Promise<TemporaryAuthExitDecision> | null = null;

  register(handler: TemporaryAuthExitHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  prepare(reason: TemporaryAuthExitReason = "sign-out"): Promise<TemporaryAuthExitDecision> {
    if (this.preparation) return this.preparation;
    this.preparation = this.runPreparation(reason).finally(() => {
      this.preparation = null;
    });
    return this.preparation;
  }

  private async runPreparation(reason: TemporaryAuthExitReason): Promise<TemporaryAuthExitDecision> {
    for (const handler of [...this.handlers]) {
      if (await handler(reason) === "cancelled") return "cancelled";
    }
    return "ready";
  }
}
