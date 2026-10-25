/** AdvantageScope fixes a field's type on its first sample. Preserve later types
 * under a distinct, stable name instead of silently losing those samples. */
export class AnalysisChannelNames {
  private names = new Map<string, string>();
  private used = new Set<string>();
  resolve(name: string, type: string): string | null {
    const key = `${name}\0${type}`, existing = this.names.get(key);
    if (existing) return existing;
    if (this.names.size >= 2048) return null;
    let candidate = name, suffix = 1;
    while (this.used.has(candidate)) candidate = `${name} [${type}${suffix++ > 1 ? ` ${suffix - 1}` : ""}]`;
    this.used.add(candidate); this.names.set(key, candidate); return candidate;
  }
}
