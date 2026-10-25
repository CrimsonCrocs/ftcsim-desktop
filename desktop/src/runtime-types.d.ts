// Shared runner code uses this structural name from its standalone Bun shim.
// The desktop uses the official Bun types instead of redeclaring Bun globals.
type BunSubprocess = import("bun").Subprocess<"pipe", "pipe", "pipe">;
